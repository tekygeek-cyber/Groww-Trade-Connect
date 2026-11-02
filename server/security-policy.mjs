/**
 * Temporary fail-closed API mutation policy.
 * These endpoints mutate shared state but have no caller-bound authorization.
 * Remove this gate only after per-user authentication and order integration tests.
 */
const UNSAFE_MUTATIONS = new Set([
  '/api/automation',
  '/api/brokers/configure',
  '/api/algo-orders/execute',
  '/api/algo-orders/cancel',
  '/api/algo-orders/gtt-state',
  '/api/algo-orders/live-gtt',
  '/api/adapter/failover/update',
  '/api/adapter/failover/simulate',
  '/api/adapter/failover/recover',
]);

export function isPrivilegedMutationBlocked(method, requestPath) {
  if (typeof method !== 'string' || method.toUpperCase() !== 'POST') return false;
  if (typeof requestPath !== 'string') return false;
  const normalizedPath = requestPath.toLowerCase().replace(/\/+$/, '');
  return UNSAFE_MUTATIONS.has(normalizedPath);
}
