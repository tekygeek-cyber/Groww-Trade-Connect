/** High-volume breakout and retest rule. */
import type { Candle, ScanHit, Setup } from '../types/market';

const VOLUME_LOOKBACK = 20;
const VOLUME_MULTIPLE = 3;
const PRICE_LOOKBACK = 20;
const MAX_AGE = 20;
const MIDPOINT_TOLERANCE = 1;

function dateText(value: unknown): string | null {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) {
    let n = Number(value);
    if (n > 10_000_000_000) n /= 1000;
    const day = new Date(n * 1000);
    if (Number.isNaN(day.getTime())) return null;
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function normalizeCandles(raw: unknown[]): Candle[] {
  const parsed: Candle[] = [];
  for (const row of raw) {
    let candle: Candle | null = null;
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const item = row as Record<string, unknown>;
      const date = dateText(item.date ?? item.timestamp ?? item.time);
      const open = Number(item.open);
      const high = Number(item.high);
      const low = Number(item.low);
      const close = Number(item.close);
      const volume = Number(item.volume ?? 0);
      if (date && [open, high, low, close, volume].every((n) => Number.isFinite(n))) {
        candle = { date, open, high, low, close, volume };
      }
    } else if (Array.isArray(row) && row.length >= 5) {
      const date = dateText(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = row.length > 5 && row[5] != null ? Number(row[5]) : 0;
      if (date && [open, high, low, close, volume].every((n) => Number.isFinite(n))) {
        candle = { date, open, high, low, close, volume };
      }
    }
    if (candle) parsed.push(candle);
  }
  parsed.sort((a, b) => a.date.localeCompare(b.date));
  const dedup = new Map<string, Candle>();
  for (const candle of parsed) dedup.set(candle.date, candle);
  return [...dedup.values()];
}

export interface ScanOptions {
  volumeMultiple?: number;
  midpointTolerance?: number;
  maxAge?: number;
}

export function scanStock(raw: unknown[], opts?: ScanOptions): Setup | null {
  const candles = normalizeCandles(raw);
  const count = candles.length;
  if (count < 25) return null;
  const latest = count - 1;
  const volMultTarget = opts?.volumeMultiple ?? 2.0;
  const midTolTarget = opts?.midpointTolerance ?? 2.0;
  const maxAgeTarget = opts?.maxAge ?? 25;
  const earliest = Math.max(PRICE_LOOKBACK, latest - maxAgeTarget);

  for (let index = count - 2; index >= earliest; index -= 1) {
    const window = candles.slice(index - PRICE_LOOKBACK, index);
    if (window.length < PRICE_LOOKBACK) continue;
    const average = window.reduce((sum, item) => sum + item.volume, 0) / PRICE_LOOKBACK;
    const previousHigh = Math.max(...window.map((item) => item.high));
    const candle = candles[index];

    if (!average) continue;
    if (!(candle.close > candle.open)) continue;
    if (!(candle.volume >= volMultTarget * average)) continue;
    if (!(candle.close > previousHigh)) continue;

    const after = candles.slice(index + 1);
    if (after.length === 0) continue;
    const maxAfter = Math.max(...after.map((item) => item.high));
    if (!(maxAfter > candle.high)) continue;

    const midpoint = (candle.high + candle.low) / 2;
    if (!midpoint) continue;

    const current = candles[latest].close;
    const distance = ((current - midpoint) / midpoint) * 100;
    const age = latest - index;
    if (Math.abs(distance) > midTolTarget || age > maxAgeTarget) continue;

    return {
      breakoutDate: candle.date,
      bIndex: index,
      daysSince: age,
      breakoutLow: round4(candle.low),
      breakoutHigh: round4(candle.high),
      midpoint: round4(midpoint),
      distanceFromMidpoint: round4(distance),
      volMultiple: round4(candle.volume / average),
      prevHigh: round4(previousHigh),
      maxPriceAfter: round4(maxAfter),
      returnFromCloseToSubHigh: round4(((maxAfter - candle.close) / candle.close) * 100),
      retracementHigh: round4(((current - maxAfter) / maxAfter) * 100),
      currentPrice: round4(current),
    };
  }
  return null;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function scanBook(
  stocks: Array<{
    trading_symbol: string;
    company_name?: string;
    exchange_token?: string;
    currency?: string;
    candles?: unknown[];
  }>,
  opts?: ScanOptions,
): { scanned: number; hits: ScanHit[] } {
  const hits: ScanHit[] = [];
  for (const stock of stocks) {
    const setup = scanStock(stock.candles ?? [], opts);
    if (!setup) continue;

    const normalized = normalizeCandles(stock.candles ?? []);
    const recentVolume = normalized.slice(-20).reduce((sum, c) => sum + c.volume, 0);
    const volumeSparse = recentVolume < 5000;

    hits.push({
      ...setup,
      symbol: stock.trading_symbol,
      companyName: stock.company_name ?? stock.trading_symbol,
      exchange_token: String(stock.exchange_token ?? ''),
      currency: stock.currency,
      candles: normalized,
      volume_sparse: volumeSparse,
    });
  }
  hits.sort((a, b) => a.daysSince - b.daysSince || Math.abs(a.distanceFromMidpoint) - Math.abs(b.distanceFromMidpoint));
  return { scanned: stocks.length, hits };
}

export type { Candle, ScanHit, Setup };
