import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHistoricalCandles } from '../server/market-data';

test('Nifty unavailable live feed is never silently replaced with synthetic candles', async () => {
  await assert.rejects(fetchHistoricalCandles('nifty','RELIANCE',false),/Verified Nifty|Verified nifty/);
});
test('explicit sample mode still returns clearly identified synthetic candles', async () => {
  const result=await fetchHistoricalCandles('nifty','RELIANCE',true);
  assert.ok(result.candles.length>=50);
  assert.equal(result.source,'Sample tape');
});

test('crypto candle providers use bounded HTTP timeouts and never substitute samples on failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    assert.ok(init?.signal instanceof AbortSignal, 'provider call must have a timeout signal');
    throw new Error('provider unavailable');
  }) as typeof fetch;
  try {
    await assert.rejects(fetchHistoricalCandles('crypto','BTC',false),/Verified crypto historical candles unavailable/);
    assert.equal(calls.length,2);
    assert.ok(calls[0].includes('kraken.com'));
    assert.ok(calls[1].includes('binance.com'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
