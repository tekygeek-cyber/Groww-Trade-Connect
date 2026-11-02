import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivilegedMutationBlocked } from '../server/security-policy.mjs';

const paths = [
  '/api/automation', '/api/brokers/configure',
  '/api/algo-orders/execute', '/api/algo-orders/cancel',
  '/api/algo-orders/gtt-state', '/api/algo-orders/live-gtt',
  '/api/adapter/failover/update', '/api/adapter/failover/simulate',
  '/api/adapter/failover/recover',
];

test('all privileged mutations are blocked', () => {
  for (const path of paths) assert.equal(isPrivilegedMutationBlocked('POST', path), true, path);
});
test('mixed case and trailing slashes cannot bypass policy', () => {
  assert.equal(isPrivilegedMutationBlocked('post', '/API/ALGO-ORDERS/EXECUTE/'), true);
});
test('non-privileged and read-only requests remain permitted', () => {
  for (const path of paths) assert.equal(isPrivilegedMutationBlocked('GET', path), false, path);
  assert.equal(isPrivilegedMutationBlocked('POST', '/api/auth/login'), false);
  assert.equal(isPrivilegedMutationBlocked('POST', '/api/demo/scan'), false);
});
test('invalid arguments do not throw', () => {
  assert.equal(isPrivilegedMutationBlocked(null, null), false);
});
