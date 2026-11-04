import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeOwnerUser } from '../server/owner-access-policy.mjs';
import ownerSession, { config } from '../netlify/functions/owner-session.mjs';

const OWNER_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const verifiedOwner = { id: OWNER_ID, email: 'owner@example.test' };

test('owner policy fails closed when the required identity is not configured', () => {
  for (const value of [undefined, null, '', '  ', 'owner@example.test ', 'bad', 42]) {
    const decision = authorizeOwnerUser(verifiedOwner, value);
    assert.deepEqual(decision, { status: 503, code: 'OWNER_NOT_CONFIGURED' });
  }
});

test('no verified user, malformed user or email-only claim cannot authenticate', () => {
  for (const value of [null, undefined, {}, [], { email: verifiedOwner.email },
    { id: '' }, { id: null }, { id: 3 }]) {
    assert.deepEqual(authorizeOwnerUser(value, OWNER_ID),
      { status: 401, code: 'AUTHENTICATION_REQUIRED' });
  }
});

test('matching email or claimed owner role does not override the trusted ID', () => {
  const denied = authorizeOwnerUser({
    id: OTHER_ID, email: verifiedOwner.email, roles: ['owner'], isAdmin: true,
  }, OWNER_ID);
  assert.deepEqual(denied, { status: 403, code: 'OWNER_ACCESS_DENIED' });
});

test('verified owner identity is accepted independently of all broker credentials', () => {
  const decision = authorizeOwnerUser(verifiedOwner, OWNER_ID);
  assert.deepEqual(decision, { status: 200, code: 'OWNER_AUTHORIZED' });
  assert.equal(Object.isFrozen(decision), true);
});

test('owner-session endpoint is GET-only, fail-closed and never trusts forged HTTP headers', async () => {
  const saved = process.env.OWNER_NETLIFY_USER_ID;
  try {
    process.env.OWNER_NETLIFY_USER_ID = OWNER_ID;
    assert.equal(config.path, '/api/owner/session');

    const request = new Request('https://private.example.test/api/owner/session', {
      headers: { 'x-owner-id': OWNER_ID, 'x-user-email': verifiedOwner.email },
    });
    const anonymous = await ownerSession(request, { user: undefined });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get('cache-control'), 'no-store');
    assert.equal((await anonymous.json()).code, 'AUTHENTICATION_REQUIRED');

    const unauthorized = await ownerSession(request, {
      user: { id: OTHER_ID, email: verifiedOwner.email },
    });
    assert.equal(unauthorized.status, 403);

    const accepted = await ownerSession(request, { user: verifiedOwner });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), {
      authenticated: true, authorized: true, mode: 'owner_only',
    });

    const mutation = await ownerSession(new Request(request.url, { method: 'POST' }), {
      user: verifiedOwner,
    });
    assert.equal(mutation.status, 405);
    assert.equal(mutation.headers.get('allow'), 'GET');

    delete process.env.OWNER_NETLIFY_USER_ID;
    const unconfigured = await ownerSession(request, { user: verifiedOwner });
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).code, 'OWNER_NOT_CONFIGURED');
  } finally {
    if (saved === undefined) delete process.env.OWNER_NETLIFY_USER_ID;
    else process.env.OWNER_NETLIFY_USER_ID = saved;
  }
});
