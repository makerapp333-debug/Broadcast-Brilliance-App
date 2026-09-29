
'use strict';

/** Simple in-memory rate limiter (per process). Production: use Redis/gateway. */
const buckets = new Map();

function key(id, action) {
  return String(id || 'anon') + ':' + String(action || 'default');
}

/**
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
 */
function checkRateLimit(id, action, { max = 10, windowMs = 60000 } = {}) {
  const k = key(id, action);
  const now = Date.now();
  let b = buckets.get(k);
  if (!b || now - b.start > windowMs) {
    b = { start: now, count: 0 };
  }
  b.count += 1;
  buckets.set(k, b);
  if (b.count > max) {
    const retryAfterSec = Math.ceil((windowMs - (now - b.start)) / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  return { ok: true };
}

// periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets.entries()) {
    if (now - b.start > 5 * 60 * 1000) buckets.delete(k);
  }
}, 60 * 1000).unref?.();

module.exports = { checkRateLimit };
