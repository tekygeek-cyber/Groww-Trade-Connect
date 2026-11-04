import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityOwnerSessionHandler } from '../server/identity-owner-handler.mjs';

const owner = '11111111-2222-4333-8444-555555555555';
const stranger = '22222222-2222-4333-8444-555555555555';
const request = new Request('https://private.example.test/api/identity/session', {
  headers: { 'X-Owner-Id': owner, 'X-User-Email': 'owner@example.test' }
});

const handler = (getVerifiedUser, configuredId = owner) =>
  createIdentityOwnerSessionHandler({
    getVerifiedUser, getOwnerId: () => configuredId,
  });

test('trusted Netlify Identity user ID grants owner access without a Groww token', async () => {
  const result = await handler(async () => ({ id: owner, email: 'owner@example.test' }))(request);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('vary'), 'Cookie');
  const body = await result.json();
  assert.deepEqual(body, { authenticated: true, authorized: true, mode: 'identity_owner' });
  assert.equal(JSON.stringify(body).includes(owner), false);
});

test('anonymous callers and forged owner headers cannot access owner session', async () => {
  for (const user of [null, undefined, {}, { email: 'owner@example.test' }]) {
    const result = await handler(async () => user)(request);
    assert.equal(result.status, 401);
    assert.equal((await result.json()).code, 'AUTHENTICATION_REQUIRED');
  }
});

test('authenticated user with matching email but wrong immutable ID is denied', async () => {
  const result = await handler(async () => ({
    id: stranger, email: 'owner@example.test', roles: ['owner'],
  }))(request);
  assert.equal(result.status, 403);
  const body = await result.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.authorized, false);
  assert.equal(body.code, 'OWNER_ACCESS_DENIED');
});

test('missing owner configuration returns verified caller ID but never grants access', async () => {
  let calls = 0;
  const result = await handler(async () => { calls++; return { id: owner }; }, '')(request);
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), {
    authenticated: true, authorized: false,
    code: 'OWNER_NOT_CONFIGURED',
    identityId: owner,
    setting: 'OWNER_IDENTITY_USER_ID',
    detail: 'Configure the owner ID in the private Netlify Functions environment',
  });
  assert.equal(calls, 1);
});

test('unconfigured site never exposes setup ID to anonymous or forged callers', async () => {
  const response = await handler(async () => null, '')(request);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.authenticated, false);
  assert.equal(body.authorized, false);
  assert.equal(JSON.stringify(body).includes(owner), false);
  assert.equal(JSON.stringify(body).includes('identityId'), false);
});

test('Identity provider errors are unavailable, never trusted as authorized', async () => {
  const result = await handler(async () => { throw new Error('secret provider token'); })(request);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'IDENTITY_SERVICE_UNAVAILABLE');
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('owner endpoint rejects mutations, without consulting Identity', async () => {
  let called = false;
  const result = await handler(async () => { called = true; return { id: owner }; })(
    new Request(request.url, { method: 'POST' })
  );
  assert.equal(result.status, 405);
  assert.equal(result.headers.get('Allow'), 'GET');
  assert.equal(called, false);
});

test('handler cannot be created without a trusted Identity verifier', () => {
  assert.throws(() => createIdentityOwnerSessionHandler(), TypeError);
});
