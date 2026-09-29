
'use strict';
const crypto = require('crypto');
const { loadState, saveState, uuid, appendFinanceAudit } = require('./store');
const { postTransaction, getWallet } = require('./ledger');
const { toMinor, assertNonNegative } = require('./money');

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(String(salt) + ':' + String(pin)).digest('hex');
}

function setPin(userId, pin) {
  if (!/^\d{4,6}$/.test(String(pin))) throw new Error('PIN must be 4–6 digits');
  const state = loadState();
  const u = state.users[userId];
  if (!u) throw new Error('User not found');
  const salt = crypto.randomBytes(16).toString('hex');
  u.pinSalt = salt;
  u.pinHash = hashPin(pin, salt);
  u.pinAttempts = 0;
  u.pinLockedUntil = 0;
  state.users[userId] = u;
  saveState(state);
  try {
    appendFinanceAudit({ actor: userId, action: 'PIN_SET', target: userId, result: 'ok' });
  } catch (e) {}
  return { ok: true };
}

function verifyPin(userId, pin) {
  const state = loadState();
  const u = state.users[userId];
  if (!u) throw new Error('User not found');
  if (u.pinLockedUntil && Date.now() < u.pinLockedUntil) {
    throw new Error('PIN locked. Try later.');
  }
  if (!u.pinHash || !u.pinSalt) throw new Error('PIN not set');
  const ok = hashPin(pin, u.pinSalt) === u.pinHash;
  if (!ok) {
    u.pinAttempts = (u.pinAttempts || 0) + 1;
    if (u.pinAttempts >= 5) {
      u.pinLockedUntil = Date.now() + 15 * 60 * 1000;
      u.pinAttempts = 0;
    }
    state.users[userId] = u;
    saveState(state);
    throw new Error('Invalid PIN');
  }
  u.pinAttempts = 0;
  state.users[userId] = u;
  saveState(state);
  return true;
}

function requestWithdrawal({ userId, amount, currency, destinationId, pin }) {
  verifyPin(userId, pin);
  const state = loadState();
  const min = state.config.minWithdrawalMinor || 10000;
  const feeMinor = Number(state.config.withdrawalFeeMinor) || 0;
  const amountMinor = toMinor(amount, currency || 'KES');
  if (amountMinor < min) throw new Error('Below minimum withdrawal');
  if (feeMinor > 0 && amountMinor <= feeMinor) {
    throw new Error('Amount must be greater than withdrawal fee');
  }
  const netMinor = amountMinor - feeMinor;
  const w = getWallet(userId);
  if (w.availableMinor < amountMinor) throw new Error('Insufficient available balance');

  const dest = state.destinations[destinationId];
  if (!dest || dest.userId !== userId) throw new Error('Invalid destination');
  if (dest.availableAt && Date.now() < dest.availableAt) {
    throw new Error('Destination in security hold until ' + new Date(dest.availableAt).toISOString());
  }

  const holdKey = 'wd_hold_' + uuid();
  // Hold full gross amount from available
  postTransaction({
    userId,
    type: 'WITHDRAWAL_HOLD',
    amountMinor: -amountMinor,
    currency: currency || 'KES',
    status: 'COMPLETED',
    description: 'Withdrawal hold (gross)',
    metadata: { destinationId, feeMinor, netMinor },
    idempotencyKey: holdKey
  });

  // Platform fee (from held gross — recorded on platform ledger)
  if (feeMinor > 0) {
    postTransaction({
      userId: 'admin',
      type: 'WITHDRAWAL_FEE',
      amountMinor: feeMinor,
      currency: currency || 'KES',
      status: 'COMPLETED',
      description: 'Withdrawal fee',
      metadata: { fromUserId: userId, destinationId },
      idempotencyKey: holdKey + '_fee',
      bucket: 'platform'
    });
    const stFee = loadState();
    stFee.platformWallet.totalWithdrawalFeesMinor = (stFee.platformWallet.totalWithdrawalFeesMinor || 0) + feeMinor;
    saveState(stFee);
  }

  const id = uuid();
  const rec = {
    id,
    userId,
    amountMinor,
    feeMinor,
    netMinor,
    currency: currency || 'KES',
    destinationId,
    status: 'PENDING',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const st = loadState();
  st.withdrawals[id] = rec;
  saveState(st);
  try {
    appendFinanceAudit({
      actor: userId,
      action: 'WITHDRAWAL_REQUEST',
      target: id,
      result: 'ok',
      meta: { amountMinor, feeMinor, netMinor, destinationId }
    });
  } catch (e) {}
  return {
    ok: true,
    withdrawal: {
      ...rec,
      amount: (amountMinor / 100).toFixed(2),
      fee: (feeMinor / 100).toFixed(2),
      net: (netMinor / 100).toFixed(2)
    }
  };
}

function adminSetWithdrawalStatus(adminId, withdrawalId, status, note) {
  const state = loadState();
  const admin = state.users[adminId];
  if (!admin || (admin.role !== 'admin' && admin.role !== 'owner')) throw new Error('Forbidden');
  const wd = state.withdrawals[withdrawalId];
  if (!wd) throw new Error('Not found');
  const allowed = ['UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'];
  if (!allowed.includes(status)) throw new Error('Invalid status');
  const prev = wd.status;
  wd.status = status;
  wd.updatedAt = Date.now();
  wd.adminNote = note || null;
  wd.adminId = adminId;
  state.withdrawals[withdrawalId] = wd;
  saveState(state);

  if (status === 'REJECTED' || status === 'CANCELLED' || status === 'FAILED') {
    // return hold
    postTransaction({
      userId: wd.userId,
      type: 'WITHDRAWAL_RELEASE',
      amountMinor: wd.amountMinor,
      currency: wd.currency,
      status: 'COMPLETED',
      description: 'Withdrawal ' + status,
      metadata: { withdrawalId },
      idempotencyKey: 'wd_rel_' + withdrawalId + '_' + status
    });
  }
  if (status === 'COMPLETED' && prev !== 'COMPLETED') {
    // Funds already removed via WITHDRAWAL_HOLD — record completion + totalWithdrawn
    const { loadState, saveState, appendLedger, uuid } = require('./store');
    const { ensureWallet } = require('./ledger');
    const st = loadState();
    const wuser = ensureWallet(st, wd.userId);
    const gross = Number(wd.amountMinor) || 0;
    wuser.totalWithdrawnMinor = (Number(wuser.totalWithdrawnMinor) || 0) + gross;
    wuser.updatedAt = Date.now();
    st.wallets[wd.userId] = wuser;
    const tx = {
      id: uuid(),
      userId: wd.userId,
      type: 'WITHDRAWAL',
      amountMinor: -gross,
      currency: wd.currency,
      status: 'COMPLETED',
      reference: withdrawalId,
      provider: null,
      description: 'Withdrawal completed (net ' + ((wd.netMinor != null ? wd.netMinor : gross) / 100).toFixed(2) + ')',
      createdAt: Date.now(),
      completedAt: Date.now(),
      metadata: {
        withdrawalId,
        amountMinor: wd.amountMinor,
        feeMinor: wd.feeMinor || 0,
        netMinor: wd.netMinor != null ? wd.netMinor : gross,
        alreadyHeld: true
      },
      bucket: 'available'
    };
    appendLedger(tx);
    st.idempotency['wd_done_' + withdrawalId] = { id: tx.id, at: Date.now() };
    saveState(st);
  }
  try {
    appendFinanceAudit({
      actor: adminId,
      action: 'WITHDRAWAL_' + status,
      target: withdrawalId,
      result: 'ok',
      meta: { prev, note: note || null, userId: wd.userId, amountMinor: wd.amountMinor }
    });
  } catch (e) {}
  return { ok: true, withdrawal: wd };
}

function addDestination({ userId, type, details }) {
  const state = loadState();
  const id = uuid();
  const delayHrs = Number(process.env.WITHDRAWAL_DEST_DELAY_HOURS || 24);
  state.destinations[id] = {
    id,
    userId,
    type, // mpesa_phone | bank | intasend
    details, // never log full secrets
    createdAt: Date.now(),
    availableAt: Date.now() + delayHrs * 3600 * 1000
  };
  saveState(state);
  try {
    appendFinanceAudit({ actor: userId, action: 'DESTINATION_ADD', target: id, result: 'ok', meta: { type } });
  } catch (e) {}
  return { ok: true, destination: { id, type, availableAt: state.destinations[id].availableAt } };
}

module.exports = { setPin, verifyPin, requestWithdrawal, adminSetWithdrawalStatus, addDestination };
