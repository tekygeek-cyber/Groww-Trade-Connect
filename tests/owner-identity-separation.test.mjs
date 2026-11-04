import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getConfiguredOwnerIdentityId } from '../server/owner-identity-config.mjs';
import { createOwnerAppHandler } from '../server/owner-app-endpoints.mjs';
import { encryptBrokerCredential, decryptBrokerCredential } from '../server/broker-credential-envelope.mjs';

const OWNER = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const url = 'https://private.example.test/api/app/';

test('existing OWNER_IDENTITY_SUB is preferred and conflicting IDs fail closed', () => {
  assert.equal(getConfiguredOwnerIdentityId({ OWNER_IDENTITY_SUB: OWNER }), OWNER);
  assert.equal(getConfiguredOwnerIdentityId({ OWNER_IDENTITY_USER_ID: OWNER }), OWNER);
  assert.equal(getConfiguredOwnerIdentityId({
    OWNER_IDENTITY_SUB: OWNER, OWNER_IDENTITY_USER_ID: OWNER,
  }), OWNER);
  assert.equal(getConfiguredOwnerIdentityId({
    OWNER_IDENTITY_SUB: OWNER, OWNER_IDENTITY_USER_ID: OTHER,
  }), null);
  assert.equal(getConfiguredOwnerIdentityId({
    OWNER_EMAIL: 'owner@example.test',
  }), null);
});

test('owner-only app API cannot be unlocked with a broker token or forged headers', async () => {
  const h = createOwnerAppHandler({
    getVerifiedUser: async () => null,
    getOwnerId: () => OWNER,
  });
  const request = new Request(url + 'profile', {
    headers: { 'x-owner-id': OWNER, 'x-user-email': 'owner@example.test',
      Authorization: 'Bearer imaginary-broker-token' },
  });
  const response = await h(request);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTHENTICATION_REQUIRED');
});

test('wrong immutable Identity ID and missing server config deny private data', async () => {
  const request = new Request(url + 'connections');
  const badUser = createOwnerAppHandler({
    getVerifiedUser: async () => ({ id: OTHER, email: 'owner@example.test' }),
    getOwnerId: () => OWNER,
  });
  assert.equal((await badUser(request)).status, 403);
  const missingId = createOwnerAppHandler({
    getVerifiedUser: async () => ({ id: OWNER }),
    getOwnerId: () => undefined,
  });
  assert.equal((await missingId(request)).status, 503);
  const down = createOwnerAppHandler({
    getVerifiedUser: async () => { throw new Error('sensitive'); },
    getOwnerId: () => OWNER,
  });
  const response = await down(request);
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes('sensitive'), false);
});

test('authorized owner sees only safe read-only workspace resources', async () => {
  const h = createOwnerAppHandler({
    getVerifiedUser: async () => ({ id: OWNER, email: 'owner@example.test' }),
    getOwnerId: () => OWNER,
  });
  for (const route of ['profile', 'connections', 'capabilities']) {
    const res = await h(new Request(url + route));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /no-store/);
    const data = await res.json();
    assert.equal(JSON.stringify(data).includes(OWNER), false);
    assert.equal(JSON.stringify(data).includes('owner@example.test'), false);
    assert.equal(JSON.stringify(data).includes('private-token'), false);
    if (route === 'connections') {
      assert.equal(data.brokerCredentialIntakeEnabled, false);
      assert.ok(data.connections.every(c => c.state === 'not_migrated'));
    }
    if (route === 'capabilities') {
      assert.equal(data.liveOrdersEnabled, false);
      assert.equal(data.privateApiMigrationComplete, false);
    }
  }
  assert.equal((await h(new Request(url + 'unknown'))).status, 404);
  const post = await h(new Request(url + 'connections', { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
});

test('broker encryption uses randomized authenticated AES-GCM and owner/provider binding', () => {
  const key = randomBytes(32).toString('base64');
  const plaintext = 'private-test-broker-token';
  const a = encryptBrokerCredential(plaintext, { ownerId: OWNER, provider: 'groww', base64Key: key });
  const b = encryptBrokerCredential(plaintext, { ownerId: OWNER, provider: 'groww', base64Key: key });
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, plaintext);
  assert.equal(JSON.stringify(a).includes(plaintext), false);
  assert.equal(decryptBrokerCredential(a, { ownerId: OWNER, provider: 'groww', base64Key: key }), plaintext);
  assert.throws(() => decryptBrokerCredential(a, { ownerId: OTHER, provider: 'groww', base64Key: key }));
  assert.throws(() => decryptBrokerCredential(a, { ownerId: OWNER, provider: 'kraken', base64Key: key }));
  assert.throws(() => decryptBrokerCredential(a, { ownerId: OWNER, provider: 'groww', base64Key: randomBytes(32).toString('base64') }));
  assert.throws(() => decryptBrokerCredential({...a, tag: randomBytes(16).toString('base64')}, { ownerId: OWNER, provider: 'groww', base64Key: key }));
});

test('invalid master key and unrecognized providers fail closed', () => {
  const key = randomBytes(32).toString('base64');
  assert.throws(() => encryptBrokerCredential('abc', { ownerId: OWNER, provider: 'groww', base64Key: 'bad' }));
  assert.throws(() => encryptBrokerCredential('abc', { ownerId: OWNER, provider: 'invalid', base64Key: key }));
  assert.throws(() => encryptBrokerCredential('', { ownerId: OWNER, provider: 'groww', base64Key: key }));
});
