import type { Candle, SignalRow, SimResult } from '../types/market';

export const SIGNAL_GUIDE = [
  { signal: 'BUY' as const, text: 'Bullish cross, at least 58% of paths finish higher, and the median path is up.' },
  { signal: 'SELL' as const, text: 'Bearish cross, at most 42% of paths finish higher, and the median path is down.' },
  { signal: 'WATCH' as const, text: 'The cross is four sessions old or newer, but the simulated edge is still too small to act.' },
  { signal: 'HOLD' as const, text: 'A cross is on the board, yet the simulation does not support buying or selling.' },
];

export function adler32(str: string): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < str.length; i++) {
    a = (a + str.charCodeAt(i)) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

// Pseudo-random generator using Mulberry32 seeded from adler32
export function createRng(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window <= 1 || values.length < window) return out;

  let sum = 0;
  for (let i = 0; i < window; i++) {
    sum += values[i];
  }
  out[window - 1] = sum / window;

  for (let i = window; i < values.length; i++) {
    sum += values[i] - values[i - window];
    out[i] = sum / window;
  }
  return out;
}

export type CrossoverResult = {
  index: number;
  crossover_type: 'bullish' | 'bearish';
  crossover_date: string;
  close: number;
  sma_short: number;
  sma_long: number;
  bars_since: number;
};

export function latestCrossover(
  candles: Candle[],
  shortWindow: number,
  longWindow: number,
  lookbackDays: number,
  today?: Date,
): CrossoverResult | null {
  if (candles.length < longWindow + 2) return null;

  const closes = candles.map((c) => c.close);
  const shortArr = sma(closes, shortWindow);
  const longArr = sma(closes, longWindow);

  let found: CrossoverResult | null = null;

  for (let i = 1; i < closes.length; i++) {
    const sPrev = shortArr[i - 1];
    const lPrev = longArr[i - 1];
    const sCurr = shortArr[i];
    const lCurr = longArr[i];

    if (sPrev === null || lPrev === null || sCurr === null || lCurr === null) continue;

    const prevDiff = sPrev - lPrev;
    const currDiff = sCurr - lCurr;
    let kind: 'bullish' | 'bearish' | null = null;

    if (prevDiff <= 0 && currDiff > 0) {
      kind = 'bullish';
    } else if (prevDiff >= 0 && currDiff < 0) {
      kind = 'bearish';
    }

    if (!kind) continue;

    found = {
      index: i,
      crossover_type: kind,
      crossover_date: candles[i].date,
      close: Math.round(closes[closes.length - 1] * 100) / 100,
      sma_short: Math.round(sCurr * 100) / 100,
      sma_long: Math.round(lCurr * 100) / 100,
      bars_since: closes.length - 1 - i,
    };
  }

  if (!found) return null;

  const anchor = today || new Date();
  const cutoff = new Date(anchor.getTime() - lookbackDays * 86400000);
  const crossDate = new Date(found.crossover_date);

  if (crossDate < cutoff) return null;

  return found;
}

export function monteCarlo(
  ticker: string,
  candles: Candle[],
  crossover: CrossoverResult,
  paths: number = 1000,
  horizon: number = 21,
): SimResult {
  const closes = candles.map((c) => c.close).filter((c) => c > 0);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const ret = Math.log(closes[i] / closes[i - 1]);
    if (Number.isFinite(ret)) returns.push(ret);
  }

  if (returns.length < 20) {
    return labelResult(ticker, crossover, {
      p_up: 0.5,
      median: 0.0,
      p05: 0.0,
      p95: 0.0,
      paths,
      horizon,
      forced: 'HOLD',
      reason: 'Not enough daily history to simulate.',
    });
  }

  const seed = adler32(`${ticker}:${paths}:${horizon}:${returns.length}`);
  const rng = createRng(seed);

  const terminal: number[] = new Array(paths);
  for (let p = 0; p < paths; p++) {
    let sumLogRet = 0;
    for (let h = 0; h < horizon; h++) {
      const idx = Math.floor(rng() * returns.length);
      sumLogRet += returns[idx];
    }
    terminal[p] = Math.expm1(sumLogRet);
  }

  terminal.sort((a, b) => a - b);
  const upCount = terminal.filter((v) => v > 0).length;
  const p_up = upCount / paths;
  const median = terminal[Math.floor(paths * 0.5)];
  const p05 = terminal[Math.floor(paths * 0.05)];
  const p95 = terminal[Math.floor(paths * 0.95)];

  return labelResult(ticker, crossover, {
    p_up,
    median,
    p05,
    p95,
    paths,
    horizon,
  });
}

function labelResult(
  ticker: string,
  crossover: CrossoverResult,
  data: {
    p_up: number;
    median: number;
    p05: number;
    p95: number;
    paths: number;
    horizon: number;
    forced?: 'BUY' | 'SELL' | 'HOLD' | 'WATCH';
    reason?: string;
  },
): SimResult {
  const { p_up, median, p05, p95, paths, horizon, forced } = data;
  const kind = crossover.crossover_type;
  const fresh = crossover.bars_since <= 4;

  let signal: 'BUY' | 'SELL' | 'HOLD' | 'WATCH';
  if (forced) {
    signal = forced;
  } else if (kind === 'bullish' && p_up >= 0.58 && median > 0) {
    signal = 'BUY';
  } else if (kind === 'bearish' && p_up <= 0.42 && median < 0) {
    signal = 'SELL';
  } else if (fresh) {
    signal = 'WATCH';
  } else {
    signal = 'HOLD';
  }

  let reason = data.reason;
  if (!reason) {
    const pctStr = `${Math.round(p_up * 100)}%`;
    const sign = median > 0 ? '+' : '';
    const medStr = `${sign}${(median * 100).toFixed(1)}%`;
    if (signal === 'BUY') {
      reason = `${pctStr} of paths ended higher (median ${medStr}).`;
    } else if (signal === 'SELL') {
      reason = `Only ${pctStr} of paths ended higher (median ${medStr}).`;
    } else if (signal === 'WATCH') {
      reason = `Cross is ${crossover.bars_since} session(s) old and the edge is thin (${pctStr} up, median ${medStr}).`;
    } else {
      reason = `No strong edge (${pctStr} up, median ${medStr}).`;
    }
  }

  return {
    ticker,
    signal,
    p_up: Math.round(p_up * 10000) / 10000,
    median_return: Math.round(median * 10000) / 10000,
    p05: Math.round(p05 * 10000) / 10000,
    p95: Math.round(p95 * 10000) / 10000,
    paths,
    horizon_days: horizon,
    reason,
  };
}

export function buildDemoCloses(
  symbol: string,
  kind: 'bullish' | 'bearish',
  daysAgo: number = 8,
  strength: 'strong' | 'mild' = 'strong',
  n: number = 180,
): Candle[] {
  const drift = strength === 'strong' ? (kind === 'bullish' ? 0.0045 : -0.0045) : 0.0;
  const dip = kind === 'bullish' ? 0.9 : 1.12;
  const dipLen = 12;
  const crossAt = Math.max(dipLen + 2, n - 1 - Math.max(0, daysAgo));

  const levels: number[] = new Array(n);
  let price = 100.0;
  for (let i = 0; i < n; i++) {
    price *= Math.exp(drift);
    levels[i] = price;
  }

  for (let i = crossAt - dipLen; i < crossAt; i++) {
    if (i >= 0 && i < n) levels[i] *= dip;
  }

  const hash = adler32(symbol);
  const scale = 0.65 + (hash % 280) / 100.0;
  for (let i = 0; i < n; i++) {
    levels[i] *= scale;
  }

  const days: string[] = [];
  const cursor = new Date();
  while (days.length < n) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  days.reverse();

  return days.map((date, idx) => {
    const c = Math.round(levels[idx] * 100) / 100;
    const vol = Math.floor(100000 + (hash % 500000) * (0.8 + 0.4 * Math.sin(idx)));
    return {
      date,
      open: Math.round((c * (1 - 0.002)) * 100) / 100,
      high: Math.round((c * (1 + 0.008)) * 100) / 100,
      low: Math.round((c * (1 - 0.008)) * 100) / 100,
      close: c,
      volume: vol,
    };
  });
}

export function rankRows(rows: SignalRow[], maxStocks: number): SignalRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.crossover_date !== a.crossover_date) {
      return b.crossover_date.localeCompare(a.crossover_date);
    }
    return a.ticker.localeCompare(b.ticker);
  });

  const trimmed = sorted.slice(0, maxStocks);
  trimmed.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return trimmed;
}
