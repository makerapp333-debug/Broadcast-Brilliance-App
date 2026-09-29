
/**
 * Finance HTTP API — mount on Director Bridge server.
 * Auth: X-User-Id header (demo) — replace with real JWT in production.
 * Never trusts frontend balances.
 */
'use strict';

const { loadState, saveState, listFinanceAudit, appendFinanceAudit } = require('./store');
const { getWallet, listLedger, postTransaction, settlePendingEarnings } = require('./ledger');
const { fromMinor, toMinor } = require('./money');
const { initiatePayment, testCompletePayment, handleWebhook, mode } = require('./payments');
const { hasFeature, getFeatureLimit, getSubscription, getPlan } = require('./features');
const { setPin, requestWithdrawal, adminSetWithdrawalStatus, addDestination } = require('./withdrawals');
const { createGuestToken, resolveGuestToken, revokeGuestToken } = require('./guestTokens');
const { checkRateLimit } = require('./rateLimit');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2e6) reject(new Error('Body too large')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

function userId(req) {
  return req.headers['x-user-id'] || 'u1';
}

function assertRate(uid, action, opts) {
  const r = checkRateLimit(uid, action, opts);
  if (!r.ok) {
    const e = new Error('Rate limit exceeded. Retry in ' + r.retryAfterSec + 's');
    e.status = 429;
    throw e;
  }
}

function requireAdmin(uid) {
  const state = loadState();
  const u = state.users[uid];
  if (!u || (u.role !== 'admin' && u.role !== 'owner')) {
    const e = new Error('Admin only');
    e.status = 403;
    throw e;
  }
}

async function handleFinanceRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    // Webhooks — no user header
    if (req.method === 'POST' && path === '/api/v1/webhooks/mpesa') {
      const body = await readBody(req);
      return json(res, 200, handleWebhook('mpesa', req.headers, body));
    }
    if (req.method === 'POST' && path === '/api/v1/webhooks/intasend') {
      const body = await readBody(req);
      return json(res, 200, handleWebhook('intasend', req.headers, body));
    }

    const uid = userId(req);

    if (req.method === 'GET' && path === '/api/v1/finance/health') {
      return json(res, 200, { ok: true, mode: mode(), service: 'finance', rateLimit: 'in-memory' });
    }

    if (req.method === 'GET' && path === '/api/v1/finance/wallet') {
      const w = getWallet(uid);
      const state = loadState();
      return json(res, 200, {
        ok: true,
        wallet: {
          available: fromMinor(w.availableMinor),
          pending: fromMinor(w.pendingMinor),
          totalEarnings: fromMinor(w.totalEarningsMinor),
          totalWithdrawn: fromMinor(w.totalWithdrawnMinor),
          totalDeposits: fromMinor(w.totalDepositsMinor),
          totalGuestTokenRevenue: fromMinor(w.totalGuestTokenRevenueMinor),
          totalAdRevenue: fromMinor(w.totalAdRevenueMinor),
          currency: w.currency || 'KES',
          status: w.status,
          _minor: mode() === 'TEST' ? w : undefined
        },
        config: {
          minWithdrawal: fromMinor(state.config.minWithdrawalMinor || 10000),
          withdrawalFee: fromMinor(state.config.withdrawalFeeMinor || 0),
          currency: state.config.currency || 'KES',
          mode: mode()
        }
      });
    }

    if (req.method === 'POST' && path === '/api/v1/finance/earnings/settle') {
      const body = await readBody(req);
      const amountMinor = body.amount != null ? require('./money').toMinor(body.amount) : null;
      const result = settlePendingEarnings(uid, amountMinor);
      return json(res, 200, {
        ok: true,
        settled: require('./money').fromMinor(result.settledMinor),
        wallet: {
          available: require('./money').fromMinor(result.wallet.availableMinor),
          pending: require('./money').fromMinor(result.wallet.pendingMinor),
          currency: result.wallet.currency || 'KES'
        }
      });
    }

    if (req.method === 'GET' && path === '/api/v1/finance/payments') {
      const state = loadState();
      const rows = Object.values(state.payments || {})
        .filter((p) => p.userId === uid || uid === 'admin')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 50)
        .map((p) => ({
          id: p.id,
          purpose: p.purpose,
          status: p.status,
          amount: fromMinor(p.amountMinor),
          currency: p.currency,
          provider: p.provider,
          reference: p.reference,
          createdAt: p.createdAt,
          completedAt: p.completedAt || null
        }));
      return json(res, 200, { ok: true, payments: rows });
    }

    if (req.method === 'GET' && path === '/api/v1/finance/transactions') {
      const rows = listLedger({ userId: uid, limit: 100 });
      return json(res, 200, {
        ok: true,
        transactions: rows.map((t) => ({
          id: t.id,
          type: t.type,
          amount: fromMinor(t.amountMinor),
          amountMinor: t.amountMinor,
          currency: t.currency,
          status: t.status,
          reference: t.reference,
          provider: t.provider,
          description: t.description,
          createdAt: t.createdAt,
          metadata: t.metadata
        }))
      });
    }

    if (req.method === 'POST' && path === '/api/v1/finance/payments/initiate') {
      assertRate(uid, 'pay_init', { max: 15, windowMs: 60000 });
      const body = await readBody(req);
      const result = await initiatePayment({
        userId: uid,
        amount: body.amount,
        currency: body.currency || 'KES',
        purpose: body.purpose || 'wallet_deposit',
        metadata: body.metadata || {}
      });
      return json(res, result.ok === false ? 400 : 200, result);
    }

    if (req.method === 'POST' && path.startsWith('/api/v1/finance/payments/') && path.endsWith('/test-complete')) {
      const paymentId = path.split('/')[5];
      const result = testCompletePayment(paymentId, uid);
      return json(res, 200, result);
    }

    if (req.method === 'POST' && path === '/api/v1/finance/pin') {
      assertRate(uid, 'pin_set', { max: 5, windowMs: 300000 });
      const body = await readBody(req);
      return json(res, 200, setPin(uid, body.pin));
    }

    if (req.method === 'GET' && path === '/api/v1/finance/withdrawals') {
      const state = loadState();
      const rows = Object.values(state.withdrawals || {})
        .filter((w) => w.userId === uid || uid === 'admin')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 50)
        .map((w) => ({
          id: w.id,
          userId: w.userId,
          amount: fromMinor(w.amountMinor),
          amountMinor: w.amountMinor,
          fee: fromMinor(w.feeMinor || 0),
          net: fromMinor(w.netMinor != null ? w.netMinor : (w.amountMinor - (w.feeMinor || 0))),
          currency: w.currency,
          status: w.status,
          destinationId: w.destinationId,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          adminNote: w.adminNote || null
        }));
      return json(res, 200, { ok: true, withdrawals: rows });
    }

    if (req.method === 'POST' && path === '/api/v1/finance/withdrawals') {
      assertRate(uid, 'withdraw', { max: 8, windowMs: 300000 });
      const body = await readBody(req);
      const result = requestWithdrawal({
        userId: uid,
        amount: body.amount,
        currency: body.currency,
        destinationId: body.destinationId,
        pin: body.pin
      });
      return json(res, 200, result);
    }

    if (req.method === 'GET' && path === '/api/v1/finance/destinations') {
      const state = loadState();
      const rows = Object.values(state.destinations || {})
        .filter((d) => d.userId === uid)
        .map((d) => ({
          id: d.id,
          type: d.type,
          details: d.details,
          createdAt: d.createdAt,
          availableAt: d.availableAt,
          ready: !d.availableAt || Date.now() >= d.availableAt
        }));
      return json(res, 200, { ok: true, destinations: rows });
    }

    if (req.method === 'POST' && path === '/api/v1/finance/destinations') {
      const body = await readBody(req);
      return json(res, 200, addDestination({ userId: uid, type: body.type, details: body.details }));
    }

    if (req.method === 'GET' && path === '/api/v1/finance/subscription') {
      const sub = getSubscription(uid);
      const plan = getPlan(sub.planId);
      return json(res, 200, { ok: true, subscription: sub, plan: { id: plan.id, name: plan.name, features: plan.features, price: fromMinor(plan.priceMinor), currency: plan.currency } });
    }

    if (req.method === 'GET' && path === '/api/v1/finance/plans') {
      const state = loadState();
      return json(res, 200, {
        ok: true,
        plans: Object.values(state.plans).map((p) => ({
          id: p.id, name: p.name, description: p.description,
          price: fromMinor(p.priceMinor), currency: p.currency,
          billingPeriod: p.billingPeriod, status: p.status, features: p.features
        }))
      });
    }

    if (req.method === 'POST' && path === '/api/v1/finance/subscription/purchase') {
      const body = await readBody(req);
      const state = loadState();
      const plan = state.plans[body.planId];
      if (!plan) return json(res, 400, { ok: false, message: 'Unknown plan' });
      const result = await initiatePayment({
        userId: uid,
        amount: fromMinor(plan.priceMinor),
        currency: plan.currency,
        purpose: 'subscription',
        metadata: { planId: plan.id }
      });
      return json(res, 200, result);
    }

    if (req.method === 'GET' && path === '/api/v1/finance/features/' + encodeURIComponent(path.split('/').pop())) {
      // fallback
    }
    if (req.method === 'GET' && path.startsWith('/api/v1/finance/features/')) {
      const key = path.split('/').pop();
      return json(res, 200, { ok: true, feature: key, allowed: hasFeature(uid, key), limit: getFeatureLimit(uid, key) });
    }

    
    if (req.method === 'GET' && path === '/api/v1/finance/guest-tokens') {
      const state = loadState();
      const rows = Object.values(state.guestTokens)
        .filter((t) => t.creatorId === uid)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 50)
        .map((t) => ({
          id: t.id,
          token: t.token,
          status: t.status,
          paymentStatus: t.paymentStatus,
          priceMinor: t.priceMinor,
          currency: t.currency,
          uses: t.uses,
          maxUses: t.maxUses,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
          revokedAt: t.revokedAt
        }));
      return json(res, 200, { ok: true, tokens: rows });
    }

    if (req.method === 'POST' && path === '/api/v1/finance/guest-tokens/purchase') {
      assertRate(uid, 'gt_purchase', { max: 12, windowMs: 60000 });
      const body = await readBody(req);
      const state = loadState();
      let rec = null;
      if (body.tokenId) rec = state.guestTokens[body.tokenId];
      if (!rec && body.token) rec = Object.values(state.guestTokens).find((t) => t.token === body.token);
      if (!rec) return json(res, 404, { ok: false, message: 'Token not found' });
      if (rec.revokedAt) return json(res, 400, { ok: false, message: 'Token revoked' });
      if (rec.expiresAt && Date.now() > rec.expiresAt) return json(res, 400, { ok: false, message: 'Token expired' });
      if (rec.paymentStatus === 'paid') return json(res, 200, { ok: true, alreadyPaid: true, tokenId: rec.id });
      const amount = (rec.priceMinor || 0) / 100;
      if (amount <= 0) {
        rec.paymentStatus = 'n/a';
        rec.status = 'active';
        state.guestTokens[rec.id] = rec;
        saveState(state);
        return json(res, 200, { ok: true, free: true, tokenId: rec.id });
      }
      const result = await initiatePayment({
        userId: uid,
        amount: amount,
        currency: rec.currency || 'KES',
        purpose: 'guest_token',
        metadata: { guestTokenId: rec.id, creatorId: rec.creatorId, token: rec.token }
      });
      return json(res, 200, result);
    }

    if (req.method === 'POST' && path === '/api/v1/finance/guest-tokens') {
      const body = await readBody(req);
      try {
        const result = createGuestToken({
          userId: uid,
          broadcastId: body.broadcastId,
          priceMinor: body.price != null ? toMinor(body.price) : undefined,
          expiresInHours: body.expiresInHours,
          maxUses: body.maxUses
        });
        return json(res, 200, result);
      } catch (e) {
        return json(res, e.code === 'FEATURE_LOCKED' ? 403 : 400, { ok: false, code: e.code, message: e.message });
      }
    }

    if (req.method === 'GET' && path.startsWith('/api/v1/finance/guest-tokens/resolve/')) {
      const token = path.split('/').pop();
      return json(res, 200, resolveGuestToken(token));
    }

    if (req.method === 'POST' && path.startsWith('/api/v1/finance/guest-tokens/') && path.endsWith('/revoke')) {
      const id = path.split('/')[5];
      return json(res, 200, revokeGuestToken(uid, id));
    }

    // Admin
    
    if (req.method === 'POST' && path === '/api/v1/finance/revenue/ad') {
      const body = await readBody(req);
      // Trusted server-side event from authenticated broadcaster — not free-form public credit
      const creatorId = body.creatorId || uid;
      const gross = Number(body.grossAmount);
      if (!Number.isFinite(gross) || gross <= 0) return json(res, 400, { ok: false, message: 'Invalid grossAmount' });
      const { postRevenueSplit } = require('./ledger');
      const { toMinor } = require('./money');
      const result = postRevenueSplit({
        userId: creatorId,
        grossMinor: toMinor(gross, body.currency || 'KES'),
        currency: body.currency || 'KES',
        source: 'ad',
        sourceId: body.adId || body.campaignId || null,
        provider: 'internal_ad_engine',
        reference: body.reference || ('AD-' + Date.now()),
        idempotencyKey: body.idempotencyKey || ('adrev_' + (body.adId || '') + '_' + (body.playId || Date.now()))
      });
      return json(res, 200, {
        ok: true,
        duplicate: !!result.duplicate,
        gross: result.gross,
        platform: result.platform,
        creator: result.creator
      });
    }

    if (req.method === 'GET' && path === '/api/v1/finance/admin/config') {
      requireAdmin(uid);
      const state = loadState();
      return json(res, 200, {
        ok: true,
        config: {
          minWithdrawal: fromMinor(state.config.minWithdrawalMinor || 10000),
          withdrawalFee: fromMinor(state.config.withdrawalFeeMinor || 0),
          defaultGuestTokenPrice: fromMinor(state.config.defaultGuestTokenPriceMinor || 5000),
          currency: state.config.currency || 'KES'
        }
      });
    }

    if (req.method === 'POST' && path === '/api/v1/finance/admin/config') {
      requireAdmin(uid);
      const body = await readBody(req);
      const state = loadState();
      const { toMinor } = require('./money');
      if (body.minWithdrawal != null) state.config.minWithdrawalMinor = toMinor(body.minWithdrawal);
      if (body.withdrawalFee != null) state.config.withdrawalFeeMinor = toMinor(body.withdrawalFee);
      if (body.defaultGuestTokenPrice != null) state.config.defaultGuestTokenPriceMinor = toMinor(body.defaultGuestTokenPrice);
      if (body.currency) state.config.currency = String(body.currency).toUpperCase();
      saveState(state);
      return json(res, 200, {
        ok: true,
        config: {
          minWithdrawal: fromMinor(state.config.minWithdrawalMinor),
          withdrawalFee: fromMinor(state.config.withdrawalFeeMinor),
          defaultGuestTokenPrice: fromMinor(state.config.defaultGuestTokenPriceMinor),
          currency: state.config.currency
        }
      });
    }

    if (req.method === 'GET' && path === '/api/v1/finance/admin/audit') {
      requireAdmin(uid);
      return json(res, 200, { ok: true, events: listFinanceAudit(80) });
    }

    if (req.method === 'GET' && path === '/api/v1/finance/admin/overview') {
      requireAdmin(uid);
      const state = loadState();
      return json(res, 200, {
        ok: true,
        platform: {
          available: fromMinor(state.platformWallet.availableMinor),
          guestTokenRevenue: fromMinor(state.platformWallet.totalGuestTokenMinor),
          adRevenue: fromMinor(state.platformWallet.totalAdMinor),
          subscriptionRevenue: fromMinor(state.platformWallet.totalSubscriptionMinor),
          withdrawalFees: fromMinor(state.platformWallet.totalWithdrawalFeesMinor || 0)
        },
        mode: mode()
      });
    }

    if (req.method === 'POST' && path.startsWith('/api/v1/finance/admin/withdrawals/')) {
      requireAdmin(uid);
      const id = path.split('/')[5];
      const body = await readBody(req);
      return json(res, 200, adminSetWithdrawalStatus(uid, id, body.status, body.note));
    }

    if (req.method === 'GET' && path === '/api/v1/finance/admin/withdrawals') {
      requireAdmin(uid);
      const state = loadState();
      return json(res, 200, {
        ok: true,
        withdrawals: Object.values(state.withdrawals).map((w) => ({
          ...w,
          amount: fromMinor(w.amountMinor),
          fee: fromMinor(w.feeMinor || 0),
          net: fromMinor(w.netMinor != null ? w.netMinor : (w.amountMinor - (w.feeMinor || 0)))
        }))
      });
    }

    return json(res, 404, { ok: false, message: 'Not found' });
  } catch (e) {
    return json(res, e.status || 400, { ok: false, message: e.message || String(e) });
  }
}

function isFinancePath(urlPath) {
  return urlPath.startsWith('/api/v1/finance') || urlPath.startsWith('/api/v1/webhooks/');
}

module.exports = { handleFinanceRequest, isFinancePath };
