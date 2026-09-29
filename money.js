/**
 * Decimal-safe money helpers — store integer minor units (e.g. cents).
 * NEVER use floating point for balances.
 */
'use strict';

function toMinor(amount, currency = 'KES') {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error('Invalid amount');
  // KES/USD-style 2 decimal places
  return Math.round(n * 100);
}

function fromMinor(minor) {
  const n = Number(minor) || 0;
  return (n / 100).toFixed(2);
}

function add(a, b) { return (Number(a) || 0) + (Number(b) || 0); }
function sub(a, b) { return (Number(a) || 0) - (Number(b) || 0); }

function split4060(grossMinor) {
  const g = Number(grossMinor) || 0;
  if (g < 0) throw new Error('Gross cannot be negative');
  const platform = Math.floor((g * 40) / 100);
  const creator = g - platform;
  return { gross: g, platform, creator };
}

function assertNonNegative(minor, label) {
  if ((Number(minor) || 0) < 0) throw new Error((label || 'Balance') + ' cannot be negative');
}

module.exports = { toMinor, fromMinor, add, sub, split4060, assertNonNegative };
