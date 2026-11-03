import test from 'node:test';
import assert from 'node:assert/strict';
import { makeIdentitySessionHandler } from '../server/identity-session-handler.mjs';
import { checkOwnerIdentity } from '../src/lib/identity-owner-client.mjs';

const ID = '11111111-2222-4333-8444-555555555555';
const OTHER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const req = new Request('https://private.example.test/api/identity/session', {
  headers: {
    'x-identity-user-id': ID,
    'x-user-email': 'owner@example.test',
    Authorization: 'Bearer forged',
    Cookie: 'gtc_session=forged',
  },
});
const handler = (verify, owner = ID) =>
  makeIdentitySessionHandler(verify, () => owner);

test('Identity endpoint allows only a verified matching immutable Identity ID', async () => {
  const response = await handler(async () => ({ id: ID, email: 'owner@example.test' }))(req);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true, authorized: true, mode: 'identity_owner_only',
  });
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('Vary'), 'Cookie');
});

test('fake browser claims cannot establish identity', async () => {
  const anonymous = await handler(async () => null)(req);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).code, 'AUTHENTICATION_REQUIRED');
  const wrong = await handler(async () => ({
    id: OTHER_ID, email: 'owner@example.test', roles: ['owner'],
  }))(req);
  assert.equal(wrong.status, 403);
  assert.equal((await wrong.json()).code, 'OWNER_ACCESS_DENIED');
});

test('missing owner config refuses all users, even valid identity users', async () => {
  const response = await handler(async () => ({ id: ID }), null)(req);
  // Null simulates missing owner configuration.
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'OWNER_NOT_CONFIGURED');
});

test('provider error fails closed without leaking error text', async () => {
  const response = await handler(async () => {
    throw new Error('sensitive provider token');
  })(req);
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes('sensitive'), false);
});

test('identity route refuses mutations before calling the provider', async () => {
  let calls = 0;
  const endpoint = handler(async () => { calls++; return { id: ID }; });
  const response = await endpoint(new Request(req.url, { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
  assert.equal(calls, 0);
});

test('client reads only verified server result and never submits claimed owner ID', async () => {
  const requests = [];
  const mkFetch = (status) => async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status });
  };
  assert.equal(await checkOwnerIdentity(mkFetch(200)), 'authorized');
  assert.equal(await checkOwnerIdentity(mkFetch(401)), 'unauthenticated');
  assert.equal(await checkOwnerIdentity(mkFetch(403)), 'forbidden');
  assert.equal(await checkOwnerIdentity(mkFetch(503)), 'unavailable');
  assert.equal(await checkOwnerIdentity(mkFetch(500)), 'unavailable');
  assert.deepEqual(requests.map(r => r.url), Array(5).fill('/api/identity/session'));
  assert.ok(requests.every(r => r.init.credentials === 'same-origin' &&
    r.init.method === 'GET' && r.init.cache === 'no-store' &&
    !('body' in r.init)));
});
