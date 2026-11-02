import type { Candle, MarketType } from '../types/market';

const VERIFIED_SOURCES = [
  'Daily candles: Kraken public API',
  'Daily candles: Binance public',
  'Daily candles: Stooq',
  'Daily candles: Yahoo Finance',
] as const;

export type CompletedDailyTrend = {
  sma20: number;
  sma50: number;
  smaAsOf: string;
  smaSource: 'completed_daily_candles';
};

/**
 * Strictly require at least 50 unique completed provider-sourced daily closes.
 * Never turn a price change, synthetic tape, or an in-progress candle into SMA data.
 */
export function deriveCompletedDailyTrend(
  candles: Candle[],
  source: string,
  now: Date = new Date(),
  market: MarketType = 'nasdaq'
): CompletedDailyTrend | null {
  if (!Array.isArray(candles) || !VERIFIED_SOURCES.includes(source as typeof VERIFIED_SOURCES[number]) ||
      !Number.isFinite(now.getTime())) return null;
  const today = now.toISOString().slice(0, 10);
  const byDate = new Map<string, number>();
  for (const c of candles) {
    if (!c || typeof c.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(c.date) || c.date >= today ||
        !Number.isFinite(c.close) || c.close <= 0 ||
        new Date(c.date + 'T00:00:00.000Z').toISOString().slice(0, 10) !== c.date ||
        byDate.has(c.date)) return null;
    byDate.set(c.date, c.close);
  }
  if (byDate.size < 50) return null;
  const series = [...byDate].sort(([a], [b]) => a.localeCompare(b));
  const lastDate = series[series.length - 1][0];
  const ageMs = now.getTime() - Date.parse(lastDate + 'T00:00:00.000Z');
  const allowedDays = market === 'crypto' ? 3 : 8;
  if (ageMs < 0 || ageMs > allowedDays * 86_400_000) return null;
  const last50 = series.slice(-50).map(([, close]) => close);
  return {
    sma20: last50.slice(-20).reduce((sum, price) => sum + price, 0) / 20,
    sma50: last50.reduce((sum, price) => sum + price, 0) / 50,
    smaAsOf: lastDate,
    smaSource: 'completed_daily_candles',
  };
}

export function isTrustedMark(
  mark: { price: number; timestamp?: number; status?: string; source?: string } | undefined,
  now = Date.now()
): boolean {
  if (!mark || !Number.isFinite(mark.price) || mark.price <= 0 ||
      !Number.isFinite(mark.timestamp) || mark.timestamp! > now + 60_000 ||
      typeof mark.source !== 'string' || !mark.source.trim() ||
      mark.status === 'Sample') return false;
  const source = mark.source.toLowerCase();
  if (/sample|synthetic|dummy|placeholder|saved nifty tape|mock|fallback/.test(source)) return false;
  // A recent real stream or last verified daily quote (with explicit source).
  return now - mark.timestamp! <= 8 * 86_400_000;
}

export function isTrustedCompletedTrend(
  quote: { sma20?: number; sma50?: number; smaAsOf?: string; smaSource?: string },
  now = Date.now()
): boolean {
  if (quote.smaSource !== 'completed_daily_candles' ||
      !Number.isFinite(quote.sma20) || quote.sma20! <= 0 ||
      !Number.isFinite(quote.sma50) || quote.sma50! <= 0 ||
      typeof quote.smaAsOf !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(quote.smaAsOf)) return false;
  const age = now - Date.parse(quote.smaAsOf + 'T00:00:00.000Z');
  return Number.isFinite(age) && age >= 0 && age <= 8 * 86_400_000;
}
