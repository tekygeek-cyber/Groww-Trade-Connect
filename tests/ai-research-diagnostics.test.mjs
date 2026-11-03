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
