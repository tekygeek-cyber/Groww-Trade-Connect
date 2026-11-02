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
 * Enforce an exact, parseable browser origin; never accept "null", wildcards,
 * credentials, paths, search strings, fragments, or multi-origin lists.
 */
function parseOrigin(value) {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.pathname !== '/' ||
        url.username || url.password || url.search || url.hash ||
        !url.hostname || url.origin === 'null') return null;
    // Browsers send the serialized Origin without a trailing slash.
    if (value !== url.origin) return null;
    return url;
  } catch { return null; }
}

/**
 * Reverse-proxy hosts can differ from the browser's public HTTPS origin.
 * APP_PUBLIC_ORIGIN overrides APP_URL, which is injected on some hosts.
 * Invalid explicit overrides fail closed; never inspect X-Forwarded-Host from
 * unconfigured reverse proxies.
 */
export function getConfiguredPublicOrigin(env = process.env) {
  const explicit = env?.APP_PUBLIC_ORIGIN;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const appUrl = env?.APP_URL;
  if (typeof appUrl === 'string' && parseOrigin(appUrl.trim())) return appUrl.trim();
  return null;
}

/**
 * State-changing requests need a real matching browser Origin.
 *
 * Without a configured public origin, requests match Host and transport
 * scheme exactly, as before. For reverse proxies, a configured public Origin
 * replaces Host as the sole trusted comparison. An untrusted forwarded Host
 * cannot grant access.
 * @param {string | undefined} origin
 * @param {string | undefined} host
 * @param {boolean} secure
 * @param {string | null | undefined} [publicOrigin]
 */
export function isSameOrigin(origin, host, secure, publicOrigin = null) {
  const url = parseOrigin(origin);
  if (!url || (secure && url.protocol !== 'https:')) return false;

  // If an administrator sets an invalid public Origin, do not accidentally
  // fall back to a potentially attacker-controlled Host.
  let configured = null;
  if (publicOrigin !== null && publicOrigin !== undefined && publicOrigin !== '') {
    configured = parseOrigin(publicOrigin);
    if (!configured || (secure && configured.protocol !== 'https:')) return false;
  }
  // When a public deployment Origin is configured, it is the sole authority:
  // never fall back to an untrusted Host header in that mode.
  if (configured) return url.origin === configured.origin;

  return typeof host === 'string' && host.length > 0 &&
    url.protocol === (secure ? 'https:' : 'http:') &&
    url.host.toLowerCase() === host.toLowerCase();
}
