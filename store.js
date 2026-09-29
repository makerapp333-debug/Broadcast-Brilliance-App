/**
 * File-backed finance store (no native deps).
 * Production: swap for Postgres; keep same interface.
 * Balances are NEVER trusted from clients — only ledger writes mutate money.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.FINANCE_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'finance-state.json');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.jsonl');
const WEBHOOK_FILE = path.join(DATA_DIR, 'webhooks.jsonl');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultState() {
  return {
    version: 1,
    mode: process.env.FINANCE_MODE || 'TEST',
    users: {
      // demo users aligned with client
      u1: { id: 'u1', name: 'Director Maina', role: 'owner', phone: '+254700000001', country: 'KE', email: 'director@newsroom.local', pinHash: null, pinAttempts: 0, pinLockedUntil: 0 },
      u2: { id: 'u2', name: 'Producer Wanjiku', role: 'producer', phone: '+254700000002', country: 'KE', email: 'producer@newsroom.local', pinHash: null, pinAttempts: 0, pinLockedUntil: 0 },
      admin: { id: 'admin', name: 'Platform Admin', role: 'admin', phone: '+254700000000', country: 'KE', email: 'admin@newsroom.local', pinHash: null, pinAttempts: 0, pinLockedUntil: 0 }
    },
    wallets: {},
    // plans
    plans: {
      free: {
        id: 'free', name: 'Free', description: 'Basic studio', priceMinor: 0, currency: 'KES',
        billingPeriod: 'monthly', status: 'active',
        features: { guest_invites: true, paid_guest_tokens: false, advertising: false, virtual_studio: true, recording: true, analytics: false, multi_operator: false, HD_streaming: false }
      },
      pro: {
        id: 'pro', name: 'Professional', description: 'Paid guests, ads, HD', priceMinor: 250000, currency: 'KES',
        billingPeriod: 'monthly', status: 'active',
        features: { guest_invites: true, paid_guest_tokens: true, advertising: true, virtual_studio: true, recording: true, analytics: true, multi_operator: true, HD_streaming: true, guest_token_pricing: true }
      },
      enterprise: {
        id: 'enterprise', name: 'Enterprise', description: 'Full platform', priceMinor: 990000, currency: 'KES',
        billingPeriod: 'monthly', status: 'active',
        features: { guest_invites: true, paid_guest_tokens: true, advertising: true, virtual_studio: true, recording: true, analytics: true, multi_operator: true, HD_streaming: true, advanced_analytics: true, custom_branding: true, priority_support: true, guest_token_pricing: true }
      }
    },
    subscriptions: {},
    guestTokens: {},
    withdrawals: {},
    destinations: {},
    payments: {},
    idempotency: {},
    config: {
      minWithdrawalMinor: 10000, // 100.00 KES
      withdrawalFeeMinor: 0,
      defaultGuestTokenPriceMinor: 5000, // 50.00
      currency: 'KES'
    },
    platformWallet: {
      id: 'platform',
      availableMinor: 0,
      pendingMinor: 0,
      totalGuestTokenMinor: 0,
      totalAdMinor: 0,
      totalSubscriptionMinor: 0,
      totalWithdrawalFeesMinor: 0
    }
  };
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) {
    const s = defaultState();
    // seed wallets
    Object.keys(s.users).forEach((uid) => {
      s.wallets[uid] = emptyWallet(uid);
      s.subscriptions[uid] = { userId: uid, planId: uid === 'admin' ? 'enterprise' : 'pro', status: 'ACTIVE', startedAt: Date.now(), expiresAt: Date.now() + 30 * 864e5 };
    });
    saveState(s);
    return s;
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function emptyWallet(userId) {
  return {
    userId,
    availableMinor: 0,
    pendingMinor: 0,
    totalEarningsMinor: 0,
    totalWithdrawnMinor: 0,
    totalDepositsMinor: 0,
    totalGuestTokenRevenueMinor: 0,
    totalAdRevenueMinor: 0,
    status: 'active',
    withdrawalStatus: 'ok',
    currency: 'KES',
    updatedAt: Date.now()
  };
}

function saveState(state) {
  ensureDir();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function appendLedger(entry) {
  ensureDir();
  fs.appendFileSync(LEDGER_FILE, JSON.stringify(entry) + '\n');
}

function appendWebhook(entry) {
  ensureDir();
  fs.appendFileSync(WEBHOOK_FILE, JSON.stringify(entry) + '\n');
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : ('id_' + crypto.randomBytes(16).toString('hex'));
}

function hashPayload(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function appendFinanceAudit(entry) {
  ensureDir();
  const pathMod = require('path');
  const file = pathMod.join(DATA_DIR, 'finance-audit.jsonl');
  const row = Object.assign({ at: Date.now() }, entry);
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
  return row;
}

function listFinanceAudit(limit) {
  ensureDir();
  const pathMod = require('path');
  const file = pathMod.join(DATA_DIR, 'finance-audit.jsonl');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rows = [];
  for (let i = lines.length - 1; i >= 0 && rows.length < (limit || 50); i--) {
    try { rows.push(JSON.parse(lines[i])); } catch (e) {}
  }
  return rows;
}

module.exports = {
  loadState, saveState, appendLedger, appendWebhook, emptyWallet, uuid, hashPayload,
  appendFinanceAudit, listFinanceAudit, DATA_DIR, STATE_FILE
};

