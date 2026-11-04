/**
 * One-owner authorization, independent from any broker login.
 *
 * SECURITY CONTRACT
 * - `verifiedUser` MUST be supplied by a trusted identity provider/server SDK.
 * - Never pass a user object copied from request headers, body or localStorage.
 * - Missing owner configuration fails closed.
 * - The stable identity ID, not email or a claimed role, establishes ownership.
 */
const OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export function authorizeOwnerUser(verifiedUser, configuredOwnerId) {
  if (typeof configuredOwnerId !== 'string' || !OWNER_ID_PATTERN.test(configuredOwnerId)) {
    return Object.freeze({ status: 503, code: 'OWNER_NOT_CONFIGURED' });
  }

  if (!verifiedUser || typeof verifiedUser !== 'object' ||
      Array.isArray(verifiedUser) || typeof verifiedUser.id !== 'string' ||
      !verifiedUser.id.trim()) {
    return Object.freeze({ status: 401, code: 'AUTHENTICATION_REQUIRED' });
  }

  if (verifiedUser.id !== configuredOwnerId) {
    return Object.freeze({ status: 403, code: 'OWNER_ACCESS_DENIED' });
  }

  return Object.freeze({ status: 200, code: 'OWNER_AUTHORIZED' });
}
