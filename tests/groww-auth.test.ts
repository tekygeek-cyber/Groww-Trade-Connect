import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const origFetch = globalThis.fetch;
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'groww-auth-'));
process.chdir(testRoot);
const { getNext6AmIst, loginGroww, clearSession, getPublicSessionStatus } = await import('../server/groww-service');
afterEach(() => {
  globalThis.fetch = origFetch;
  clearSession();
});

test('expiry 06:00 IST before boundary', () => {
  assert.equal(getNext6AmIst(new Date('2026-11-02T00:00:00Z')).toISOString(), '2026-11-02T00:30:00.000Z');
});
test('expiry 06:00 IST after boundary', () => {
  assert.equal(getNext6AmIst(new Date('2026-11-02T00:31:00Z')).toISOString(), '2026-11-03T00:30:00.000Z');
});
test('rejects missing credentials without contacting provider', async () => {
  globalThis.fetch = (async () => { throw new Error('fetch must not run'); }) as typeof fetch;
  await assert.rejects(loginGroww({ apiSecret: 'incomplete' }), /API key/);
  assert.equal(getPublicSessionStatus().authenticated, false);
});
test('broker HTTP 401 never creates a session', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
  await assert.rejects(loginGroww({ apiKey:'invalid', apiSecret:'invalid' }), /rejected/);
  assert.equal(getPublicSessionStatus().authenticated, false);
});
test('network error never creates a session', async () => {
  globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
  await assert.rejects(loginGroww({ apiKey:'invalid', apiSecret:'invalid' }), /unreachable/);
  assert.equal(getPublicSessionStatus().authenticated, false);
});
test('broker HTTP 200 without access token never creates a session', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  await assert.rejects(loginGroww({ apiKey:'invalid', apiSecret:'invalid' }), /access token/);
  assert.equal(getPublicSessionStatus().authenticated, false);
});
test('successful broker token exchange creates server-side session', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({access_token:'test_broker_token'}), { status: 200 })) as typeof fetch;
  const result = await loginGroww({ apiKey:'test', apiSecret:'test' });
  assert.equal(result.authenticated, true);
  assert.equal(getPublicSessionStatus().authenticated, true);
  assert.equal(fs.existsSync(path.join(testRoot,'server','data','session.json')), true);
});
test('malformed JSON never creates a session', async () => {
  globalThis.fetch = (async () => new Response('<html>error</html>', { status: 200 })) as typeof fetch;
  await assert.rejects(loginGroww({ apiKey:'invalid', apiSecret:'invalid' }), /Invalid Groww/);
  assert.equal(getPublicSessionStatus().authenticated, false);
});
