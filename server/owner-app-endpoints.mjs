import { authorizeOwnerUser } from './owner-access-policy.mjs';
import { getConfiguredOwnerIdentityId } from './owner-identity-config.mjs';

const HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Cookie',
});

const ALLOWED_PATHS = Object.freeze({
  '/api/app/profile': () => ({
    user_name: 'Private research owner',
    provider: 'netlify_identity',
    accountType: 'owner',
    brokerRequiredForLogin: false,
  }),
  '/api/app/connections': () => ({
    brokerCredentialIntakeEnabled: false,
    credentialVaultConfigured: false,
    connections: ['groww', 'kraken', 'etoro'].map(provider => ({
      provider,
      state: 'not_migrated',
      secretExposed: false,
      // Do not infer live connection state from the deprecated Node server.
    })),
  }),
  '/api/app/capabilities': () => ({
    mode: 'owner_only_read_only',
    liveOrdersEnabled: false,
    paperOrdersEnabled: false,
    brokerCredentialIntakeEnabled: false,
    privateApiMigrationComplete: false,
  }),
});

/** Pure request handler; the verifiedUser callback MUST come from the Netlify
 * Identity server SDK. Never accept a claimed owner ID from HTTP headers.
 */
export function createOwnerAppHandler({
  getVerifiedUser,
  getOwnerId = () => getConfiguredOwnerIdentityId(process.env),
} = {}) {
  if (typeof getVerifiedUser !== 'function' || typeof getOwnerId !== 'function') {
    throw new TypeError('Verified user provider and owner ID reader are required');
  }

  return async function ownerAppHandler(request) {
    if (request?.method !== 'GET') {
      return Response.json({ code: 'METHOD_NOT_ALLOWED' }, {
        status: 405, headers: { ...HEADERS, Allow: 'GET' },
      });
    }

    let path;
    try { path = new URL(request.url).pathname; }
    catch { return Response.json({ code: 'BAD_REQUEST' }, { status: 400, headers: HEADERS }); }

    // Authentication occurs before choosing a private resource. No public
    // endpoint or data-returning fallback exists in this function.
    let verifiedUser;
    try { verifiedUser = await getVerifiedUser(); }
    catch {
      return Response.json({ code: 'IDENTITY_SERVICE_UNAVAILABLE' }, {
        status: 503, headers: HEADERS,
      });
    }
    if (!verifiedUser || typeof verifiedUser.id !== 'string' || !verifiedUser.id) {
      return Response.json({ code: 'AUTHENTICATION_REQUIRED' }, {
        status: 401, headers: HEADERS,
      });
    }

    const decision = authorizeOwnerUser(verifiedUser, getOwnerId());
    if (decision.status !== 200) {
      return Response.json({ code: decision.code }, {
        status: decision.status, headers: HEADERS,
      });
    }

    const route = Object.prototype.hasOwnProperty.call(ALLOWED_PATHS, path)
      ? ALLOWED_PATHS[path] : null;
    if (!route) {
      return Response.json({ code: 'NOT_FOUND' }, { status: 404, headers: HEADERS });
    }
    return Response.json(route(), { status: 200, headers: HEADERS });
  };
}
