import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSessionId, hashSessionId, matchesSessionId, readSessionCookie,
  makeSessionCookie, makeClearSessionCookie, isSameOrigin,
} from '../server/session-policy.mjs';
import { isAnonymousApiAllowed } from '../server/api-access.mjs';

test('256-bit random cookie handle is unique and bound to SHA-256 hash', () => {
  const a = generateSessionId(), b = generateSessionId();
  assert.notEqual(a, b);
  assert.equal(a.length, 43);
  assert.equal(matchesSessionId(a, hashSessionId(a)), true);
  assert.equal(matchesSessionId(b, hashSessionId(a)), false);
  assert.equal(matchesSessionId(undefined, hashSessionId(a)), false);
});
test('duplicate cookie names and malformed session values are rejected', () => {
  const token = generateSessionId();
  assert.equal(readSessionCookie(`x=1; gtc_session=${token}; z=2`), token);
  assert.equal(readSessionCookie(`gtc_session=${token}; gtc_session=${token}`), null);
  assert.equal(readSessionCookie('gtc_session=malformed'), null);
  assert.equal(readSessionCookie('gtc_session=' + 'x'.repeat(9000)), null);
});
test('cookies have HttpOnly and SameSite Strict; production uses Secure', () => {
  const sessionId = generateSessionId();
  const cookie = makeSessionCookie(sessionId, new Date(Date.now() + 20_000), true);
  for (const marker of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/api', 'Max-Age=']) {
    assert.ok(cookie.includes(marker), marker);
  }
  assert.ok(makeClearSessionCookie(true).includes('Max-Age=0'));
});
test('same origin accepts exact host/scheme and rejects cross site/missing origin', () => {
  assert.equal(isSameOrigin('https://trade.example.com', 'trade.example.com', true), true);
  assert.equal(isSameOrigin('https://evil.example.com', 'trade.example.com', true), false);
  assert.equal(isSameOrigin('http://trade.example.com', 'trade.example.com', true), false);
  assert.equal(isSameOrigin(undefined, 'trade.example.com', true), false);
  assert.equal(isSameOrigin('https://trade.example.com.evil.org', 'trade.example.com', true), false);
  assert.equal(isSameOrigin('http://localhost:3000', 'localhost:3000', false), true);
});
test('sensitive API routes are private by default', () => {
  for (const path of ['/api/profile', '/api/automation', '/api/brokers/status', '/api/algo-orders/list', '/api/adapter/failover']) {
    assert.equal(isAnonymousApiAllowed('GET', path), false, path);
  }
  assert.equal(isAnonymousApiAllowed('POST', '/api/algo-orders/execute'), false);
  assert.equal(isAnonymousApiAllowed('GET', '/api/auth/status'), true);
  assert.equal(isAnonymousApiAllowed('POST', '/api/demo/scan'), true);
  assert.equal(isAnonymousApiAllowed('GET', '/api/quotes/nifty'), true);
});
