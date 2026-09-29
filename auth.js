/**
 * JWT auth for Director Bridge.
 * v0.1: optional HS256 via JWT_SECRET. If unset → DEV_AUTH_OPEN (local only).
 */

function parseBearer(url, headers) {
  try {
    const u = new URL(url, 'http://localhost');
    const q = u.searchParams.get('token');
    if (q) return q;
  } catch (_) {
    /* ignore */
  }
  const h = headers.authorization || headers.Authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/**
 * Minimal HS256 verify without external deps (skeleton).
 * For production, replace with jose / jsonwebtoken.
 */
function b64urlToBuf(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

function verifyHs256(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const crypto = require('crypto');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(h + '.' + p)
    .digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(b64urlToBuf(p).toString('utf8'));
  } catch {
    return null;
  }
}

function authenticate(req) {
  const secret = process.env.JWT_SECRET || '';
  const token = parseBearer(req.url, req.headers);

  if (!secret) {
    // DEV ONLY
    return {
      ok: true,
      devOpen: true,
      user: { sub: 'dev-operator', role: 'director' },
    };
  }

  if (!token) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Missing token' };
  }

  const payload = verifyHs256(token, secret);
  if (!payload) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Invalid token' };
  }

  const role = payload.role || payload.app_metadata?.role || 'viewer';
  const allowed = ['owner', 'admin', 'producer', 'director'];
  if (!allowed.includes(role)) {
    return { ok: false, code: 'FORBIDDEN', message: `Role ${role} cannot control Program` };
  }

  return { ok: true, user: { sub: payload.sub, role } };
}

module.exports = { authenticate, parseBearer };
