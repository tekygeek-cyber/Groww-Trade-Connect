import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'gtc_session';
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Generate a secret caller-owned bearer handle; only its hash is saved server-side. */
export function generateSessionId() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionId(id) {
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) return null;
  return createHash('sha256').update(id, 'utf8').digest('hex');
}

export function matchesSessionId(sessionId, storedHash) {
  const candidateHash = hashSessionId(sessionId);
  if (!candidateHash || typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

export function readSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 8192) return null;
  const candidates = cookieHeader.split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${SESSION_COOKIE}=`));
  if (candidates.length !== 1) return null;
  const token = candidates[0].slice(SESSION_COOKIE.length + 1);
  return SESSION_ID_PATTERN.test(token) ? token : null;
}

export function makeSessionCookie(id, expiresAt, isSecure) {
  if (!hashSessionId(id)) throw new TypeError('Invalid session identifier');
  const expires = new Date(expiresAt);
  if (!Number.isFinite(expires.getTime())) throw new TypeError('Invalid session expiry');
  const maxAge = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}; Expires=${expires.toUTCString()}${isSecure ? '; Secure' : ''}`;
}

export function makeClearSessionCookie(isSecure) {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isSecure ? '; Secure' : ''}`;
}

/**
 * Require an explicit same-origin Origin for browser-side state changes.
 * Do not blindly trust reverse proxy forwarding headers.
 */
export function isSameOrigin(origin, host, secure) {
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const url = new URL(origin);
    const expectedProtocol = secure ? 'https:' : 'http:';
    return url.protocol === expectedProtocol && url.host.toLowerCase() === host.toLowerCase() &&
      url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
