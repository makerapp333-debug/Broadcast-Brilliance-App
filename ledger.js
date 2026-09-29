
'use strict';
const { loadState, saveState, appendLedger, emptyWallet, uuid, appendFinanceAudit } = require('./store');
const { add, sub, assertNonNegative, split4060 } = require('./money');

function ensureWallet(state, userId) {
  if (!state.wallets[userId]) state.wallets[userId] = emptyWallet(userId);
  return state.wallets[userId];
}

/**
 * Append-only credit/debit with full transaction record.
 * amountMinor > 0 credit, < 0 debit
 */
function postTransaction(opts) {
  const state = loadState();
  const {
    userId, type, amountMinor, currency = 'KES', status = 'COMPLETED',
    reference, provider, description, metadata, idempotencyKey, bucket = 'available'
  } = opts;

  if (idempotencyKey && state.idempotency[idempotencyKey]) {
    return { ok: true, duplicate: true, transaction: state.idempotency[idempotencyKey] };
  }

  const amt = Number(amountMinor);
  if (!Number.isFinite(amt) || amt === 0) throw new Error('Invalid amountMinor');

  const w = ensureWallet(state, userId);
  if (bucket === 'available') {
    const next = add(w.availableMinor, amt);
    assertNonNegative(next, 'Available balance');
    w.availableMinor = next;
  } else if (bucket === 'pending') {
    const next = add(w.pendingMinor, amt);
    assertNonNegative(next, 'Pending balance');
    w.pendingMinor = next;
  } else if (bucket === 'platform') {
    const next = add(state.platformWallet.availableMinor, amt);
    assertNonNegative(next, 'Platform balance');
    state.platformWallet.availableMinor = next;
  }

  // counters
  if (type === 'DEPOSIT' && amt > 0) w.totalDepositsMinor = add(w.totalDepositsMinor, amt);
  if (type === 'WITHDRAWAL' && amt < 0) w.totalWithdrawnMinor = add(w.totalWithdrawnMinor, -amt);
  if (type === 'GUEST_TOKEN_REVENUE' && amt > 0) {
    w.totalGuestTokenRevenueMinor = add(w.totalGuestTokenRevenueMinor, amt);
    w.totalEarningsMinor = add(w.totalEarningsMinor, amt);
  }
  if (type === 'AD_REVENUE' && amt > 0) {
    w.totalAdRevenueMinor = add(w.totalAdRevenueMinor, amt);
    w.totalEarningsMinor = add(w.totalEarningsMinor, amt);
  }

  w.updatedAt = Date.now();

  const tx = {
    id: uuid(),
    userId,
    type,
    amountMinor: amt,
    currency,
    status,
    reference: reference || null,
    provider: provider || null,
    description: description || '',
    createdAt: Date.now(),
    completedAt: status === 'COMPLETED' ? Date.now() : null,
    metadata: metadata || {},
    bucket
  };

  appendLedger(tx);
  if (idempotencyKey) state.idempotency[idempotencyKey] = { id: tx.id, at: Date.now() };
  saveState(state);
  return { ok: true, transaction: tx, wallet: w };
}

/** 40/60 split for guest tokens and ads only */
function postRevenueSplit({ userId, grossMinor, currency = 'KES', source, sourceId, provider, reference, idempotencyKey }) {
  const state = loadState();
  if (idempotencyKey && state.idempotency[idempotencyKey]) {
    return { ok: true, duplicate: true, transaction: state.idempotency[idempotencyKey] };
  }
  const { gross, platform, creator } = split4060(grossMinor);
  const baseKey = idempotencyKey || ('rev_' + (reference || uuid()));

  // Creator pending earnings (not immediately withdrawable until settled — configurable; we put available for simplicity in TEST)
  // Creator share lands in PENDING until settled (withdrawable after settle)
  const c = postTransaction({
    userId,
    type: source === 'ad' ? 'AD_REVENUE' : 'GUEST_TOKEN_REVENUE',
    amountMinor: creator,
    currency,
    status: 'COMPLETED',
    reference,
    provider,
    description: `Creator 60% of ${source} revenue (pending)`,
    metadata: { gross, platform, creator, source, sourceId },
    idempotencyKey: baseKey + '_creator',
    bucket: 'pending'
  });

  const p = postTransaction({
    userId: 'admin',
    type: source === 'ad' ? 'PLATFORM_AD_REVENUE' : 'PLATFORM_GUEST_TOKEN_REVENUE',
    amountMinor: platform,
    currency,
    status: 'COMPLETED',
    reference,
    provider,
    description: `Platform 40% of ${source} revenue`,
    metadata: { gross, platform, creator, source, sourceId },
    idempotencyKey: baseKey + '_platform',
    bucket: 'platform'
  });

  // platform counters
  const st = loadState();
  if (source === 'ad') st.platformWallet.totalAdMinor = add(st.platformWallet.totalAdMinor, platform);
  else st.platformWallet.totalGuestTokenMinor = add(st.platformWallet.totalGuestTokenMinor, platform);
  saveState(st);

  try {
    appendFinanceAudit({
      actor: userId,
      action: 'REVENUE_SPLIT',
      target: sourceId || source,
      result: 'ok',
      meta: { source, gross, platform, creator, currency, reference }
    });
  } catch (e) {}
  return { ok: true, gross, platform, creator, creatorTx: c.transaction, platformTx: p.transaction };
}

function getWallet(userId) {
  const state = loadState();
  return ensureWallet(state, userId);
}

function listLedger(filter = {}) {
  const fs = require('fs');
  const { LEDGER_FILE } = require('./store');
  // re-read path
  const path = require('path');
  const file = path.join(process.env.FINANCE_DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'ledger.jsonl');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let rows = lines.map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  if (filter.userId) rows = rows.filter((r) => r.userId === filter.userId);
  if (filter.type) rows = rows.filter((r) => r.type === filter.type);
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return rows.slice(0, filter.limit || 100);
}

function settlePendingEarnings(userId, amountMinor) {
  const state = loadState();
  const w = ensureWallet(state, userId);
  const pending = Number(w.pendingMinor) || 0;
  if (pending <= 0) throw new Error('No pending earnings to settle');
  let move = amountMinor != null ? Number(amountMinor) : pending;
  if (!Number.isFinite(move) || move <= 0) throw new Error('Invalid settle amount');
  if (move > pending) move = pending;
  // debit pending
  postTransaction({
    userId,
    type: 'EARNINGS_SETTLE_OUT',
    amountMinor: -move,
    currency: w.currency || 'KES',
    status: 'COMPLETED',
    description: 'Move pending earnings to available',
    idempotencyKey: 'settle_out_' + userId + '_' + Date.now() + '_' + move,
    bucket: 'pending'
  });
  // credit available
  const r = postTransaction({
    userId,
    type: 'EARNINGS_SETTLE_IN',
    amountMinor: move,
    currency: w.currency || 'KES',
    status: 'COMPLETED',
    description: 'Pending earnings now available for withdrawal',
    idempotencyKey: 'settle_in_' + userId + '_' + Date.now() + '_' + move,
    bucket: 'available'
  });
  try {
    appendFinanceAudit({
      actor: userId,
      action: 'EARNINGS_SETTLE',
      target: userId,
      result: 'ok',
      meta: { settledMinor: move }
    });
  } catch (e) {}
  return { ok: true, settledMinor: move, wallet: getWallet(userId) };
}

module.exports = { postTransaction, postRevenueSplit, getWallet, listLedger, ensureWallet, settlePendingEarnings };

