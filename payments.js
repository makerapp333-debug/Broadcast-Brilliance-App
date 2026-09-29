
/**
 * Unified payment provider abstraction.
 * paymentProvider = "mpesa" | "intasend" | "test"
 * Secrets ONLY from env — never returned to clients.
 */
'use strict';

const crypto = require('crypto');
const { loadState, saveState, uuid, appendWebhook, hashPayload, appendFinanceAudit } = require('./store');
const { postTransaction } = require('./ledger');
const { toMinor } = require('./money');

function detectProvider(user) {
  // Prefer verified phone/country — not frontend claim alone
  const country = (user && user.country) || '';
  const phone = (user && user.phone) || '';
  if (country === 'KE' || /^\+?254/.test(phone)) return 'mpesa';
  return 'intasend';
}

function mode() {
  return (process.env.FINANCE_MODE || 'TEST').toUpperCase();
}

/** Initiate payment — returns client-safe checkout info */
async function initiatePayment({ userId, amount, currency, purpose, metadata }) {
  const state = loadState();
  let user = state.users[userId];
  if (!user) {
    // ephemeral buyer (guest checkout)
    user = { id: userId, name: 'Guest buyer', role: 'viewer', phone: '', country: 'KE', email: '', pinHash: null };
    state.users[userId] = user;
    saveState(state);
  }
  const amountMinor = toMinor(amount, currency || 'KES');
  if (amountMinor <= 0) throw new Error('Amount must be positive');

  const provider = detectProvider(user);
  const paymentId = uuid();
  const reference = 'BB-' + paymentId.replace(/-/g, '').slice(0, 12).toUpperCase();

  const payment = {
    id: paymentId,
    userId,
    provider: mode() === 'TEST' ? 'test' : provider,
    amountMinor,
    currency: currency || (provider === 'mpesa' ? 'KES' : (currency || 'USD')),
    purpose: purpose || 'wallet_deposit',
    status: 'PENDING',
    reference,
    metadata: metadata || {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.payments[paymentId] = payment;
  saveState(state);

  if (mode() === 'TEST' || payment.provider === 'test') {
    return {
      ok: true,
      paymentId,
      reference,
      provider: 'test',
      status: 'PENDING',
      // Client can call complete-test endpoint
      testCompleteUrl: '/api/v1/finance/payments/' + paymentId + '/test-complete',
      message: 'TEST mode — call test-complete to simulate success (no real money)'
    };
  }

  if (provider === 'mpesa') {
    return initiateMpesaStk(payment, user);
  }
  return initiateIntasend(payment, user);
}

async function initiateMpesaStk(payment, user) {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callback = process.env.MPESA_CALLBACK_URL;
  if (!key || !secret || !shortcode || !passkey || !callback) {
    return {
      ok: false,
      code: 'MPESA_NOT_CONFIGURED',
      paymentId: payment.id,
      reference: payment.reference,
      message: 'M-Pesa Daraja env vars not set. Use FINANCE_MODE=TEST or configure credentials on the server.'
    };
  }
  // Production: obtain OAuth token, then STK push — structure only until credentials present
  return {
    ok: true,
    paymentId: payment.id,
    reference: payment.reference,
    provider: 'mpesa',
    status: 'PENDING',
    message: 'M-Pesa credentials present — STK Push wiring requires live Daraja app. Callback: ' + callback,
    phone: user.phone
  };
}

async function initiateIntasend(payment, user) {
  const secret = process.env.INTASEND_SECRET_KEY;
  const pub = process.env.INTASEND_PUBLISHABLE_KEY;
  if (!secret) {
    return {
      ok: false,
      code: 'INTASEND_NOT_CONFIGURED',
      paymentId: payment.id,
      reference: payment.reference,
      message: 'IntaSend secret not configured. Use FINANCE_MODE=TEST or set INTASEND_SECRET_KEY on server.'
    };
  }
  return {
    ok: true,
    paymentId: payment.id,
    reference: payment.reference,
    provider: 'intasend',
    status: 'PENDING',
    publishableKey: pub || null, // publishable is OK for client
    message: 'IntaSend configured — complete checkout via provider API/webhook'
  };
}

/** TEST-only completion */
function testCompletePayment(paymentId, userId) {
  if (mode() !== 'TEST') throw new Error('test-complete only in FINANCE_MODE=TEST');
  const state = loadState();
  const p = state.payments[paymentId];
  if (!p) throw new Error('Payment not found');
  if (p.userId !== userId && userId !== 'admin') throw new Error('Forbidden');
  if (p.status === 'COMPLETED') return { ok: true, duplicate: true, payment: p };

  return finalizePayment(p, { providerRef: 'TEST-' + p.reference, raw: { test: true } });
}

function finalizePayment(payment, { providerRef, raw }) {
  const state = loadState();
  const p = state.payments[payment.id];
  if (!p) throw new Error('Payment not found');
  if (p.status === 'COMPLETED') return { ok: true, duplicate: true, payment: p };

  const idem = 'pay_' + p.reference;
  if (state.idempotency[idem]) return { ok: true, duplicate: true, payment: p };

  p.status = 'COMPLETED';
  p.providerRef = providerRef;
  p.updatedAt = Date.now();
  p.completedAt = Date.now();
  state.payments[p.id] = p;
  saveState(state);

  // Purpose routing
  if (p.purpose === 'wallet_deposit') {
    postTransaction({
      userId: p.userId,
      type: 'DEPOSIT',
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: 'COMPLETED',
      reference: p.reference,
      provider: p.provider,
      description: 'Wallet deposit',
      metadata: { paymentId: p.id, providerRef },
      idempotencyKey: idem
    });
  } else if (p.purpose === 'subscription') {
    activateSubscription(p.userId, p.metadata.planId, p);
  } else if (p.purpose === 'guest_token') {
    // revenue to creator via split
    const creatorId = p.metadata.creatorId;
    if (creatorId) {
      const { postRevenueSplit } = require('./ledger');
      postRevenueSplit({
        userId: creatorId,
        grossMinor: p.amountMinor,
        currency: p.currency,
        source: 'guest_token',
        sourceId: p.metadata.guestTokenId,
        provider: p.provider,
        reference: p.reference,
        idempotencyKey: idem + '_rev'
      });
    }
    markGuestTokenPaid(p.metadata.guestTokenId, p);
  }

  try {
    appendFinanceAudit({
      actor: p.userId,
      action: 'PAYMENT_COMPLETED',
      target: p.id,
      result: 'ok',
      meta: { purpose: p.purpose, amountMinor: p.amountMinor, currency: p.currency, provider: p.provider, reference: p.reference }
    });
  } catch (e) {}
  return { ok: true, payment: p };
}

function activateSubscription(userId, planId, payment) {
  const state = loadState();
  const plan = state.plans[planId];
  if (!plan || plan.status !== 'active') throw new Error('Invalid plan');
  const periodMs = plan.billingPeriod === 'yearly' ? 365 * 864e5 : 30 * 864e5;
  state.subscriptions[userId] = {
    userId,
    planId,
    status: 'ACTIVE',
    startedAt: Date.now(),
    expiresAt: Date.now() + periodMs,
    paymentId: payment.id
  };
  // Platform subscription revenue (NOT 40/60 — full to platform as product sale)
  state.platformWallet.totalSubscriptionMinor = (state.platformWallet.totalSubscriptionMinor || 0) + payment.amountMinor;
  state.platformWallet.availableMinor = (state.platformWallet.availableMinor || 0) + payment.amountMinor;
  const { postTransaction } = require('./ledger');
  postTransaction({
    userId: 'admin',
    type: 'SUBSCRIPTION_REVENUE',
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    reference: payment.reference,
    provider: payment.provider,
    description: 'Subscription ' + plan.name,
    idempotencyKey: 'sub_' + payment.reference,
    bucket: 'platform'
  });
  saveState(state);
}

function markGuestTokenPaid(tokenId, payment) {
  if (!tokenId) return;
  const state = loadState();
  const t = state.guestTokens[tokenId];
  if (t) {
    t.paymentStatus = 'paid';
    t.status = 'active';
    t.paidAt = Date.now();
    t.paymentId = payment.id;
    state.guestTokens[tokenId] = t;
    saveState(state);
  }
}

function handleWebhook(provider, headers, body) {
  const eventId = (body && (body.event_id || body.CheckoutRequestID || body.invoice_id)) || uuid();
  const payloadHash = hashPayload(body || {});
  appendWebhook({ eventId, provider, payloadHash, at: Date.now(), body: body });

  const state = loadState();
  const idem = 'wh_' + provider + '_' + eventId;
  if (state.idempotency[idem]) return { ok: true, duplicate: true };

  // Minimal verification hooks
  if (provider === 'intasend' && process.env.INTASEND_WEBHOOK_SECRET) {
    // In production verify signature header against secret
  }
  if (provider === 'mpesa') {
    // Daraja callback body ResultCode === 0
    if (body && body.Body && body.Body.stkCallback) {
      const cb = body.Body.stkCallback;
      if (cb.ResultCode === 0) {
        const ref = cb.CheckoutRequestID;
        const pay = Object.values(state.payments).find((p) => p.providerCheckoutId === ref || p.reference === ref);
        if (pay) finalizePayment(pay, { providerRef: ref, raw: body });
      }
    }
  }

  state.idempotency[idem] = { at: Date.now() };
  saveState(state);
  return { ok: true };
}

module.exports = {
  detectProvider, initiatePayment, testCompletePayment, finalizePayment, handleWebhook, mode
};
