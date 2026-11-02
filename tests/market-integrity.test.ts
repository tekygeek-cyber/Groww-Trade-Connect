import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCompletedDailyTrend, isTrustedCompletedTrend, isTrustedMark } from '../src/lib/market-integrity';
import {
  validateCurrencyLedger, migrateLegacyInrCash, updateCurrencyCash, getInstrumentCurrency,
} from '../src/lib/currency-ledger';
import { calculatePortfolioScore } from '../src/lib/rebalance-engine';
import type { Candle } from '../src/types/market';

const testNow = new Date('2026-11-02T12:00:00.000Z');
const dayMs = 86_400_000;
const candles: Candle[] = Array.from({ length: 50 }, (_, index) => ({
  date: new Date(Date.UTC(2026,10,1) - (49 - index) * dayMs).toISOString().slice(0,10),
  open: 90 + index, high: 100 + index, low: 80 + index,
  close: 100 + index, volume: 5000,
}));

test('historical closing averages exactly match last 20 and 50 complete bars', () => {
  const trend = deriveCompletedDailyTrend(candles,'Daily candles: Stooq',testNow,'nasdaq');
  assert.ok(trend);
  assert.equal(trend!.sma50,124.5);
  assert.equal(trend!.sma20,139.5);
  assert.equal(trend!.smaAsOf,'2026-11-01');
  assert.equal(isTrustedCompletedTrend(trend!, testNow.getTime()),true);
});
test('sample, generated, and saved candles cannot produce a valid SMA', () => {
  for (const source of ['Sample tape','Saved Nifty tape','Showing the last saved tape','unknown']) {
    assert.equal(deriveCompletedDailyTrend(candles,source,testNow),null);
  }
});
test('less than 50 bars, duplicate dates or an in-progress date are rejected', () => {
  assert.equal(deriveCompletedDailyTrend(candles.slice(-49),'Daily candles: Stooq',testNow),null);
  assert.equal(deriveCompletedDailyTrend([...candles, {...candles[0]}],'Daily candles: Stooq',testNow),null);
  assert.equal(deriveCompletedDailyTrend([...candles.slice(0,-1),
    {...candles[49],date:'2026-11-02'}],'Daily candles: Stooq',testNow),null);
});
test('stale or invalid daily candles are rejected', () => {
  const stale = candles.map(c=>({...c,date:new Date(Date.parse(c.date+'T00:00:00Z')-14*dayMs).toISOString().slice(0,10)}));
  assert.equal(deriveCompletedDailyTrend(stale,'Daily candles: Stooq',testNow),null);
  const invalid = candles.map(c=>({...c}));
  invalid[8].date = '2026-02-30';
  assert.equal(deriveCompletedDailyTrend(invalid,'Daily candles: Stooq',testNow),null);
});
test('unsourced, future and synthetic quotes cannot generate orders', () => {
  const base = {price:100, source:'Daily candles: Stooq', status:'Delayed' as const, timestamp:testNow.getTime() };
  assert.equal(isTrustedMark(base,testNow.getTime()),true);
  assert.equal(isTrustedMark({...base,source:'Sample tape'},testNow.getTime()),false);
  assert.equal(isTrustedMark({...base,status:'Sample'},testNow.getTime()),false);
  assert.equal(isTrustedMark({...base,timestamp:undefined},testNow.getTime()),false);
  assert.equal(isTrustedMark({...base,timestamp:testNow.getTime()+120000},testNow.getTime()),false);
});
test('technical score cannot be invented from single-day percentage change or SMA without proof',()=>{
  const h=[{ id:'a',ticker:'ABC',name:'ABC',market:'nasdaq' as const,shares:1,
    averageBuyPrice:100,buyDate:'2026-01-01'}];
  const t=[{ticker:'ABC',name:'ABC',market:'nasdaq' as const,targetWeightPct:95}];
  const score=calculatePortfolioScore(h,t,{ABC:{price:100,change:10,changePct:10}},5,'nasdaq',5);
  assert.equal(score.technicalScore,null);
  assert.equal(score.compositeScore,null);
  const fake=calculatePortfolioScore(h,t,{ABC:{price:100,change:10,changePct:10,sma20:150,sma50:100}},5,'nasdaq',5);
  assert.equal(fake.technicalScore,null);
});
test('validated currency cash is never implicitly converted',()=>{
  const initial=migrateLegacyInrCash(2500);
  assert.deepEqual(initial,{INR:2500,USD:0,USDT:0});
  const next=updateCurrencyCash(initial,'USD',100);
  assert.deepEqual(next,{INR:2500,USD:100,USDT:0});
  assert.equal(initial.USD,0);
  assert.equal(getInstrumentCurrency('nifty','RELIANCE'),'INR');
  assert.equal(getInstrumentCurrency('nasdaq','AAPL'),'USD');
  assert.equal(getInstrumentCurrency('crypto','BTC'),'USDT');
});
test('invalid balances and unknown currencies are fail-closed',()=>{
  for(const value of [-5,Number.NaN,Infinity]){
    assert.throws(()=>migrateLegacyInrCash(value),TypeError);
    assert.throws(()=>updateCurrencyCash({INR:0,USD:0,USDT:0},'INR',value),TypeError);
  }
  assert.throws(()=>validateCurrencyLedger({INR:0,USD:0,USDT:0,EUR:1}),TypeError);
  assert.throws(()=>validateCurrencyLedger({INR:0,USD:'100',USDT:0}),TypeError);
});
