/**
 * Deterministic, close-to-close historical diagnostics.
 * Descriptive only: no forward forecasts, portfolio assumptions, or orders.
 */
export function calculateResearchDiagnostics(candles, { market = 'nasdaq' } = {}) {
  if (!Array.isArray(candles) || candles.length < 55 ||
      candles.some(bar => !Number.isFinite(bar?.close) || bar.close <= 0)) {
    throw new TypeError('At least 55 valid positive historical closes required');
  }
  const closes = candles.map(bar => bar.close);
  const returns = closes.slice(1).map((close, i) => Math.log(close / closes[i]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  // Crypto trades seven days per week; equity and ETF annualization uses 252 sessions.
  const annualizationDays = market === 'crypto' ? 365 : 252;
  const annualizedVolatilityPct = Math.sqrt(variance * annualizationDays) * 100;
  let peak = closes[0], worst = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    worst = Math.min(worst, (close / peak - 1) * 100);
  }
  const pct = value => Number(value.toFixed(2));
  return Object.freeze({
    method: 'historical_close_to_close',
    observations: closes.length,
    annualizedVolatilityPct: pct(annualizedVolatilityPct),
    maxObservedDrawdownPct: pct(worst),
    observedReturnPct: pct((closes.at(-1) / closes[0] - 1) * 100),
    annualizationDays,
    limitations: 'Daily closing prices only; historical sample, not a forecast. No intraday risk, fees, or future performance inferred.'
  });
}
