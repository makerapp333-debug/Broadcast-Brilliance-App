
'use strict';
const crypto = require('crypto');
const { loadState, saveState, uuid, appendFinanceAudit } = require('./store');
const { hasFeature } = require('./features');

function createGuestToken({ userId, broadcastId, priceMinor, expiresInHours, maxUses }) {
  if (!hasFeature(userId, 'paid_guest_tokens') && priceMinor > 0) {
    const err = new Error('Paid guest tokens require a Professional plan or higher');
    err.code = 'FEATURE_LOCKED';
    throw err;
  }
  const state = loadState();
  const token = crypto.randomBytes(24).toString('base64url');
  const id = uuid();
  const rec = {
    id,
    token,
    creatorId: userId,
    broadcastId: broadcastId || 'bb-local-broadcast',
    priceMinor: priceMinor != null ? priceMinor : (state.config.defaultGuestTokenPriceMinor || 0),
    currency: 'KES',
    status: priceMinor > 0 ? 'pending_payment' : 'active',
    paymentStatus: priceMinor > 0 ? 'unpaid' : 'n/a',
    maxUses: maxUses || 1,
    uses: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + (expiresInHours || 24) * 3600 * 1000,
    revokedAt: null
  };
  state.guestTokens[id] = rec;
  saveState(state);
  try {
    appendFinanceAudit({
      actor: userId,
      action: 'GUEST_TOKEN_CREATE',
      target: id,
      result: 'ok',
      meta: { priceMinor: rec.priceMinor, expiresAt: rec.expiresAt }
    });
  } catch (e) {}
  return {
    ok: true,
    id,
    token,
    path: '/guest/' + token,
    priceMinor: rec.priceMinor,
    expiresAt: rec.expiresAt,
    status: rec.status
  };
}

function resolveGuestToken(token) {
  const state = loadState();
  const rec = Object.values(state.guestTokens).find((t) => t.token === token);
  if (!rec) return { ok: false, code: 'NOT_FOUND' };
  if (rec.revokedAt) return { ok: false, code: 'REVOKED' };
  if (rec.expiresAt && Date.now() > rec.expiresAt) return { ok: false, code: 'EXPIRED' };
  if (rec.priceMinor > 0 && rec.paymentStatus !== 'paid') return { ok: false, code: 'PAYMENT_REQUIRED', tokenId: rec.id, priceMinor: rec.priceMinor };
  if (rec.maxUses && rec.uses >= rec.maxUses) return { ok: false, code: 'MAX_USES' };
  return { ok: true, record: { id: rec.id, broadcastId: rec.broadcastId, status: rec.status } };
}

function revokeGuestToken(userId, id) {
  const state = loadState();
  const rec = state.guestTokens[id];
  if (!rec || rec.creatorId !== userId) throw new Error('Not found');
  rec.revokedAt = Date.now();
  rec.status = 'revoked';
  state.guestTokens[id] = rec;
  saveState(state);
  try {
    appendFinanceAudit({ actor: userId, action: 'GUEST_TOKEN_REVOKE', target: id, result: 'ok' });
  } catch (e) {}
  return { ok: true };
}

module.exports = { createGuestToken, resolveGuestToken, revokeGuestToken };
