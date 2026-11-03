import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateResearchDiagnostics } from '../server/ai/research-diagnostics.mjs';

const candles = closes => closes.map((close, i) => ({ date: '2026-01-01', close, i }));

test('flat historical series has zero volatility, drawdown and return', () => {
  const r = calculateResearchDiagnostics(candles(Array(60).fill(100)));
  assert.equal(r.annualizedVolatilityPct, 0);
  assert.equal(r.maxObservedDrawdownPct, 0);
  assert.equal(r.observedReturnPct, 0);
  assert.equal(r.observations, 60);
});

test('drawdown is measured from running peak, not first price', () => {
  const r = calculateResearchDiagnostics(candles([...Array(55).fill(100), 150, 75]));
  assert.equal(r.maxObservedDrawdownPct, -50);
  assert.equal(r.observedReturnPct, -25);
  assert.ok(r.annualizedVolatilityPct > 0);
});

test('invalid, missing, or non-positive evidence fails closed', () => {
  assert.throws(() => calculateResearchDiagnostics(candles(Array(54).fill(100))), TypeError);
  assert.throws(() => calculateResearchDiagnostics(candles([...Array(59).fill(100), 0])), TypeError);
  assert.throws(() => calculateResearchDiagnostics(candles([...Array(59).fill(100), NaN])), TypeError);
});

test('crypto volatility is annualized over 365 daily candles rather than 252 equity sessions', () => {
  const series = candles(Array.from({length:60},(_,i)=>100 + i*0.75 + (i%2?3:0)));
  const equity = calculateResearchDiagnostics(series,{market:'nasdaq'});
  const crypto = calculateResearchDiagnostics(series,{market:'crypto'});
  assert.equal(equity.annualizationDays,252);
  assert.equal(crypto.annualizationDays,365);
  assert.ok(crypto.annualizedVolatilityPct > equity.annualizedVolatilityPct);
  assert.equal(equity.maxObservedDrawdownPct,crypto.maxObservedDrawdownPct);
});
