/** Public, non-account-specific endpoints. Default for /api is private. */
const PUBLIC_GET = new Set([
  '/api/health',
  '/api/auth/status',
  '/api/demo/profile',
  '/api/adapter/liveliness',
  '/api/adapter/heatmap',
  '/api/universe',
  '/api/strategies',
  '/api/scanner-data',
  '/api/ohlc-snapshot',
  '/api/news/market',
]);
const PUBLIC_POST = new Set([
  '/api/auth/login',
  '/api/demo/scan',
]);

export function isAnonymousApiAllowed(method, path) {
  if (typeof method !== 'string' || typeof path !== 'string') return false;
  const m = method.toUpperCase();
  const p = path.toLowerCase().replace(/\/+$/, '');
  if (m === 'GET') {
    return PUBLIC_GET.has(p) || p.startsWith('/api/universe/') ||
      p.startsWith('/api/quotes/') || p.startsWith('/api/candles/');
  }
  return m === 'POST' && PUBLIC_POST.has(p);
}
