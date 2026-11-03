import { authorizeOwnerUser } from './owner-access-policy.mjs';

const SAFE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Cookie',
});

/**
 * Framework-independent handler for testing.
 *
 * getVerifiedUser MUST come from @netlify/identity's server-side getUser().
 * No request-supplied email, ID, headers, claims or Groww token are trusted.
 */
export function makeIdentitySessionHandler(getVerifiedUser, getOwnerId) {
  if (typeof getVerifiedUser !== 'function' || typeof getOwnerId !== 'function') {
    throw new TypeError('Trusted identity verifier and owner config reader required');
  }

  return async function identitySession(request) {
    if (request?.method !== 'GET') {
      return Response.json({ code: 'METHOD_NOT_ALLOWED' }, {
        status: 405, headers: { ...SAFE_HEADERS, Allow: 'GET' },
      });
    }

    let verifiedUser;
    try {
      verifiedUser = await getVerifiedUser();
    } catch {
      // Never leak provider errors, claims, cookies or tokens to clients.
      return Response.json({ code: 'IDENTITY_PROVIDER_UNAVAILABLE' }, {
        status: 503, headers: SAFE_HEADERS,
      });
    }

    const decision = authorizeOwnerUser(verifiedUser, getOwnerId());
    if (decision.status !== 200) {
      return Response.json({
        authenticated: false,
        authorized: false,
        code: decision.code,
      }, { status: decision.status, headers: SAFE_HEADERS });
    }

    return Response.json({
      authenticated: true,
      authorized: true,
      mode: 'identity_owner_only',
    }, { status: 200, headers: SAFE_HEADERS });
  };
}