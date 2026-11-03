import { authorizeOwnerUser } from './owner-access-policy.mjs';

/**
 * Pure, testable owner-session handler for a verified Netlify Identity user.
 * getVerifiedUser is provided by the official server-side Identity SDK.
 * Never authorize from request headers, email, body or client-side session state.
 */
export function createIdentityOwnerSessionHandler({
  getVerifiedUser,
  getOwnerId = () => process.env.OWNER_IDENTITY_USER_ID,
} = {}) {
  if (typeof getVerifiedUser !== 'function' || typeof getOwnerId !== 'function') {
    throw new TypeError('Trusted Identity provider and owner configuration are required');
  }

  return async function identityOwnerSession(request) {
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Cookie',
    };

    if (request.method !== 'GET') {
      return Response.json({ detail: 'Method not allowed' }, {
        status: 405, headers: { ...headers, Allow: 'GET' },
      });
    }

    const ownerId = getOwnerId();
    const missingConfig = authorizeOwnerUser(null, ownerId);
    if (missingConfig.status === 503) {
      return Response.json({
        authenticated: false, authorized: false,
        code: missingConfig.code, detail: 'Application owner authorization is not configured',
      }, { status: 503, headers });
    }

    let user;
    try {
      user = await getVerifiedUser();
    } catch {
      // Do not leak token, SDK or backend error details.
      return Response.json({
        authenticated: false, authorized: false,
        code: 'IDENTITY_SERVICE_UNAVAILABLE', detail: 'Authentication verification unavailable',
      }, { status: 503, headers });
    }

    const decision = authorizeOwnerUser(user, ownerId);
    if (decision.status !== 200) {
      return Response.json({
        authenticated: decision.status === 403,
        authorized: false,
        code: decision.code,
        detail: decision.status === 401 ? 'Sign in required' : 'Owner access denied',
      }, { status: decision.status, headers });
    }

    return Response.json({
      authenticated: true, authorized: true, mode: 'identity_owner',
    }, { status: 200, headers });
  };
}
