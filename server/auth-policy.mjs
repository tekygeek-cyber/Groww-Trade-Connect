/**
 * Authentication/session policy utilities. No I/O and no broker credentials.
 * 06:00 IST corresponds to 00:30 UTC, independently of host timezone.
 */
export function getNext6AmIst(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('A valid Date is required');
  }
  const todayCutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30, 0);
  return new Date(now.getTime() < todayCutoff ? todayCutoff : todayCutoff + 86_400_000);
}

/** Reject unsuccessful broker responses and missing/invalid access tokens. */
export function requireBrokerAccessToken(status, payload) {
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw new Error('Groww rejected authentication credentials');
  }
  const token = payload && typeof payload === 'object' ? payload.access_token : undefined;
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Groww did not return a valid access token');
  }
  return token.trim();
}
