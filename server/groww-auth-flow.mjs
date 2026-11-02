import { createHash } from 'node:crypto';

/** Groww's documented timestamped SHA256(secret + epochSeconds) approval flow. */
export function makeGrowwApprovalPayload(apiSecret, epochSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof apiSecret !== 'string' || !apiSecret.trim() || !Number.isSafeInteger(epochSeconds) ||
      epochSeconds < 1_000_000_000 || epochSeconds > 9_999_999_999)
    throw new TypeError('Invalid Groww API secret or timestamp');
  const timestamp = String(epochSeconds);
  return {
    key_type: 'approval',
    checksum: createHash('sha256').update(apiSecret + timestamp, 'utf8').digest('hex'),
    timestamp,
  };
}
export function makeGrowwTotpPayload(totp) {
  if (typeof totp !== 'string' || !/^\d{6}$/.test(totp))
    throw new TypeError('Groww TOTP must be exactly six digits');
  return { key_type:'totp',totp };
}
export function extractGrowwAccessToken(status, data) {
  if (!Number.isInteger(status) || status < 200 || status >= 300 ||
      !data || typeof data !== 'object' || data.status === 'FAILURE') {
    throw new Error('Groww rejected authentication');
  }
  const token = typeof data.token === 'string' ? data.token : data.payload?.token;
  if (typeof token !== 'string' || !token.trim()) throw new Error('Groww did not return a valid access token');
  return token.trim();
}
export const GROWW_TOKEN_URL = 'https://api.groww.in/v1/token/api/access';
