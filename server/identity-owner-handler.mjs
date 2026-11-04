import { authorizeOwnerUser } from './owner-access-policy.mjs';
import { getConfiguredOwnerIdentityId } from './owner-identity-config.mjs';

/**
 * Pure, testable owner-session handler for a verified Netlify Identity user.
 * getVerifiedUser is provided by the official server-side Identity SDK.
 * Never authorize from request headers, email, body or client-side session state.
 */
export function createIdentityOwnerSessionHandler({
  getVerifiedUser,
  getOwnerId = () => getConfiguredOwnerIdentityId(process.env),
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

    // Verify the session before revealing any diagnostic about owner setup.
    // A request header or browser-supplied user ID can never establish identity.
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

    if (!user || typeof user !== 'object' ||
        Array.isArray(user) || typeof user.id !== 'string' || !user.id.trim()) {
      return Response.json({
        authenticated: false, authorized: false,
        code: 'AUTHENTICATION_REQUIRED', detail: 'Sign in required',
      }, { status: 401, headers });
    }

    const decision = authorizeOwnerUser(user, getOwnerId());
    if (decision.status === 503) {
      // An immutable Identity user ID is not a credential. Only a verified,
      // signed-in caller receives their own ID as a configuration hint.
      // Never authorize API access from this response or from first login.
      return Response.json({
        authenticated: true, authorized: false,
        code: 'OWNER_NOT_CONFIGURED',
        identityId: user.id,
        setting: 'OWNER_IDENTITY_USER_ID',
        detail: 'Configure the owner ID in the private Netlify Functions environment',
      }, { status: 503, headers });
    }

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
