import { authorizeOwnerUser } from '../../server/owner-access-policy.mjs';

/**
 * Netlify Functions v2.
 * context.user is verified by Netlify's private-project access layer.
 * This is NOT a Netlify Identity user or a Groww broker session.
 *
 * The endpoint is an isolated foundation for the forthcoming private-login
 * migration; existing Express APIs are intentionally unchanged for now.
 */
export const config = { path: '/api/owner/session' };

export default async function ownerSession(request, context) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };

  if (request.method !== 'GET') {
    return Response.json({ detail: 'Method not allowed' }, {
      status: 405,
      headers: { ...headers, Allow: 'GET' },
    });
  }

  // Never accept identity from request body, query, headers or cookies.
  const decision = authorizeOwnerUser(context?.user, process.env.OWNER_NETLIFY_USER_ID);

  if (decision.status !== 200) {
    const detail = decision.status === 503
      ? 'Owner authorization is not configured'
      : decision.status === 401
        ? 'Application sign-in required'
        : 'Owner access denied';

    return Response.json({ detail, code: decision.code }, {
      status: decision.status,
      headers,
    });
  }

  return Response.json({ authenticated: true, authorized: true, mode: 'owner_only' }, {
    status: 200,
    headers,
  });
}
