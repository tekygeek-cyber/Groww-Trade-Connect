import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const originalFetch = globalThis.fetch;
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'groww-owner-session-'));
process.chdir(sandbox);
const {
  getNext6AmIst, loginGroww, clearSession, getPublicSessionStatus, readSession,
} = await import('../server/groww-service');
let ownerSessionId: string | undefined;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (ownerSessionId) clearSession(ownerSessionId);
  ownerSessionId = undefined;
});

const validCredentials = { apiKey: 'test', apiSecret: 'test' };
const mockSuccess = () => {
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ token: 'test_broker_token' }), { status: 200 }
  )) as typeof fetch;
};

test('expiry before 06:00 IST', () => {
  assert.equal(getNext6AmIst(new Date('2026-11-02T00:00:00Z')).toISOString(), '2026-11-02T00:30:00.000Z');
});
test('expiry after 06:00 IST', () => {
  assert.equal(getNext6AmIst(new Date('2026-11-02T00:31:00Z')).toISOString(), '2026-11-03T00:30:00.000Z');
});
test('incomplete credentials do not contact broker', async () => {
  globalThis.fetch = (async () => { throw new Error('should not fetch'); }) as typeof fetch;
  await assert.rejects(loginGroww({ apiSecret: 'secret' }), /API key/);
  assert.equal(getPublicSessionStatus().authenticated, false);
});
test('broker rejects invalid credentials', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
  await assert.rejects(loginGroww(validCredentials), /rejected/);
  assert.equal(getPublicSessionStatus().authenticated, false);
});
test('network outage rejects authentication', async () => {
  globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
  await assert.rejects(loginGroww(validCredentials), /unreachable/);
});
test('200 without access token is rejected', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  await assert.rejects(loginGroww(validCredentials), /valid access token/);
});
test('malformed JSON cannot create authenticated session', async () => {
  globalThis.fetch = (async () => new Response('<html>bad</html>', { status: 200 })) as typeof fetch;
  await assert.rejects(loginGroww(validCredentials), /Invalid Groww/);
});
test('login creates caller-bound session; other visitors remain unauthenticated', async () => {
  mockSuccess();
  const result = await loginGroww(validCredentials);
  ownerSessionId = result.sessionId;
  assert.equal(result.authenticated, true);
  assert.equal(result.sessionId.length, 43);
  assert.equal(getPublicSessionStatus().authenticated, false);
  assert.equal(getPublicSessionStatus('someone-else').authenticated, false);
  assert.equal(getPublicSessionStatus(result.sessionId).authenticated, true);
  assert.equal(readSession('someone-else'), null);
  const persisted = fs.readFileSync(path.join(sandbox, 'server', 'data', 'session.json'), 'utf8');
  assert.equal(persisted.includes(result.sessionId), false);
  assert.equal(persisted.includes('test_broker_token'), true);
});
test('unknown caller cannot log out active owner', async () => {
  mockSuccess();
  const result = await loginGroww(validCredentials);
  ownerSessionId = result.sessionId;
  assert.equal(clearSession('invalid'), false);
  assert.equal(clearSession(), false);
  assert.equal(getPublicSessionStatus(result.sessionId).authenticated, true);
});
test('second browser cannot take over single-owner server', async () => {
  mockSuccess();
  const first = await loginGroww(validCredentials);
  ownerSessionId = first.sessionId;
  await assert.rejects(loginGroww(validCredentials), /already has an active/);
  assert.equal(getPublicSessionStatus(first.sessionId).authenticated, true);
});
test('same owner can rotate browser session', async () => {
  mockSuccess();
  const old = await loginGroww(validCredentials);
  const next = await loginGroww(validCredentials, old.sessionId);
  ownerSessionId = next.sessionId;
  assert.notEqual(next.sessionId, old.sessionId);
  assert.equal(getPublicSessionStatus(old.sessionId).authenticated, false);
  assert.equal(getPublicSessionStatus(next.sessionId).authenticated, true);
});
test('legacy session without binding is ignored', async () => {
  const legacy = path.join(sandbox, 'server', 'data', 'session.json');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, JSON.stringify({
    accessToken: 'legacy', flow: 'approval', expiresAt: '2100-01-01T00:00:00Z'
  }));
  assert.equal(getPublicSessionStatus().authenticated, false);
  assert.equal(getPublicSessionStatus('any').authenticated, false);
});

test('Groww API-secret approval uses official checksum and endpoint, never raw secret in body',async()=>{
  let endpoint='';let headers:Headers|undefined;let payload:Record<string,string>={};
  globalThis.fetch=(async(url,options)=>{
    endpoint=String(url);
    headers=new Headers(options?.headers);
    payload=JSON.parse(String(options?.body));
    return new Response(JSON.stringify({token:'approved_broker_token'}),{status:200});
  }) as typeof fetch;
  const {sessionId}=await loginGroww(validCredentials);
  ownerSessionId=sessionId;
  assert.equal(endpoint,'https://api.groww.in/v1/token/api/access');
  assert.equal(headers?.get('Authorization'),'Bearer test');
  assert.equal(headers?.get('X-API-VERSION'),'1.0');
  assert.equal(payload.key_type,'approval');
  assert.equal(payload.checksum.length,64);
  assert.ok(/^\d{10}$/.test(payload.timestamp));
  assert.ok(!JSON.stringify(payload).includes('api_secret'));
  assert.ok(!JSON.stringify(payload).includes('test'));
});
test('Groww TOTP flow sends six-digit code but never repeats raw API key in request body',async()=>{
  let payload:Record<string,string>={};
  globalThis.fetch=(async(_url,options)=>{
    payload=JSON.parse(String(options?.body));
    return new Response(JSON.stringify({token:'totp_broker_token'}),{status:200});
  }) as typeof fetch;
  const {sessionId}=await loginGroww({apiKey:'user_key',requestToken:'123456'});
  ownerSessionId=sessionId;
  assert.deepEqual(payload,{key_type:'totp',totp:'123456'});
  assert.equal(getPublicSessionStatus(sessionId).authenticated,true);
});
test('invalid TOTP code fails before network request',async()=>{
  globalThis.fetch=(async()=>{throw new Error('should not call network');}) as typeof fetch;
  await assert.rejects(loginGroww({apiKey:'user_key',requestToken:'123'}),/six digits/);
});
test('legacy or malformed token payload cannot establish account session',async()=>{
  globalThis.fetch=(async()=>new Response(JSON.stringify({access_token:'legacy_broker_token'}),{status:200})) as typeof fetch;
  await assert.rejects(loginGroww(validCredentials),/valid access token/);
});
