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
