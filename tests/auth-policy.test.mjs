import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { getNext6AmIst, requireBrokerAccessToken } from '../server/auth-policy.mjs';

test('before 06:00 IST the cutoff is 00:30 UTC today', () => {
  assert.equal(getNext6AmIst(new Date('2026-11-02T00:00:00Z')).toISOString(), '2026-11-02T00:30:00.000Z');
});
test('at 06:00 IST the cutoff is tomorrow', () => {
  assert.equal(getNext6AmIst(new Date('2026-11-02T00:30:00Z')).toISOString(), '2026-11-03T00:30:00.000Z');
});
test('date rollover works in leap year', () => {
  assert.equal(getNext6AmIst(new Date('2028-02-29T01:00:00Z')).toISOString(), '2028-03-01T00:30:00.000Z');
});
test('host timezone does not affect session cutoff', () => {
  const code = "import('./server/auth-policy.mjs').then(({getNext6AmIst})=>console.log(getNext6AmIst(new Date('2026-11-02T00:00:00Z')).toISOString()))";
  const output = ['UTC', 'Europe/Malta', 'Asia/Kolkata', 'America/New_York']
    .map(TZ => execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ }, encoding: 'utf8' }).trim());
  assert.ok(output.every(value => value === output[0]));
});
test('invalid date throws', () => assert.throws(() => getNext6AmIst(new Date(NaN)), TypeError));
test('valid response returns trimmed token', () => assert.equal(requireBrokerAccessToken(200, { access_token: ' secret ' }), 'secret'));
test('HTTP 401 rejects token', () => assert.throws(() => requireBrokerAccessToken(401, {access_token:'fake'}), /rejected/));
test('HTTP 502 rejects token', () => assert.throws(() => requireBrokerAccessToken(502, {access_token:'fake'}), /rejected/));
test('missing token rejects response', () => assert.throws(() => requireBrokerAccessToken(200, {}), /valid access token/));
test('invalid token types are rejected', () => {
  for (const token of ['', ' ', null, 123, [], {}]) {
    assert.throws(() => requireBrokerAccessToken(200, { access_token: token }), /valid access token/);
  }
});
