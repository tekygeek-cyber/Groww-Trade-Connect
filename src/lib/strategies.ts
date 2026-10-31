import type { Candle, Strategy, Study, Trade } from '../types/market';
import { adler32, buildDemoCloses } from './engine';

export const CATALOG: Strategy[] = [
  {
    id: 'turtle',
    name: 'Turtle breakout',
    source: 'Richard Dennis and William Eckhardt, System 1',
    summary: 'Buy a 20-day high. Exit on a 10-day low.',
  },
  {
    id: 'golden',
    name: 'Golden cross',
    source: 'Classical technical analysis, 50-day and 200-day simple moving averages',
    summary: 'Buy when the 50-day average moves above the 200-day average. Sell on the reverse cross.',
  },
  {
    id: 'connors',
    name: 'Connors RSI-2',
    source: 'Larry Connors, published short-term mean reversion',
    summary: 'Buy when RSI(2) is under 10 and price is above the 200-day average. Sell when RSI(2) is over 70.',
  },
  {
    id: 'bollinger',
    name: 'Bollinger revert',
    source: 'John Bollinger bands, 20 days and 2 standard deviations',
    summary: 'Buy a close under the lower band. Sell when price is back at the middle band.',
  },
  {
    id: 'macd',
    name: 'MACD cross',
    source: 'Gerald Appel, 12 / 26 / 9',
    summary: 'Buy when the MACD line crosses above its signal line. Sell on the reverse cross.',
  },
  {
    id: 'momentum',
    name: 'Six-month momentum',
    source: 'Jegadeesh and Titman momentum, simplified for one stock',
    summary: 'Buy when the six-month return is positive and price is above the 200-day average. Sell when the six-month return turns negative.',
  },
];

const STRATEGY_IDS = new Set(CATALOG.map((s) => s.id));

export function isKnownStrategy(id: string): boolean {
  return STRATEGY_IDS.has(id);
}

function calcEma(values: number[], span: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < span || span < 1) return out;

  const alpha = 2.0 / (span + 1.0);
  let sum = 0;
  for (let i = 0; i < span; i++) sum += values[i];
  out[span - 1] = sum / span;

  for (let i = span; i < values.length; i++) {
    const prev = out[i - 1]!;
    out[i] = alpha * values[i] + (1.0 - alpha) * prev;
  }
  return out;
}

function calcEmaSkipNan(values: (number | null)[], span: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const buf: number[] = [];
  let started = false;
  let prev = 0.0;
  const alpha = 2.0 / (span + 1.0);

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val === null || !Number.isFinite(val)) continue;

    if (!started) {
      buf.push(val);
      if (buf.length === span) {
        prev = buf.reduce((a, b) => a + b, 0) / span;
        out[i] = prev;
        started = true;
      }
      continue;
    }

    prev = alpha * val + (1.0 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function calcRsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;

  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function calcPriorExtreme(values: number[], window: number, kind: 'max' | 'min'): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = window; i < values.length; i++) {
    const chunk = values.slice(i - window, i);
    out[i] = kind === 'max' ? Math.max(...chunk) : Math.min(...chunk);
  }
  return out;
}

function calcSma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (window <= 1 || values.length < window) return out;

  let sum = 0;
  for (let i = 0; i < window; i++) sum += values[i];
  out[window - 1] = sum / window;

  for (let i = window; i < values.length; i++) {
    sum += values[i] - values[i - window];
    out[i] = sum / window;
  }
  return out;
}

function generateSignals(strategyId: string, closes: number[]): { enter: boolean[]; leave: boolean[] } {
  const n = closes.length;
  const enter = new Array<boolean>(n).fill(false);
  const leave = new Array<boolean>(n).fill(false);

  if (strategyId === 'turtle') {
    const hi = calcPriorExtreme(closes, 20, 'max');
    const lo = calcPriorExtreme(closes, 10, 'min');
    for (let i = 0; i < n; i++) {
      if (hi[i] !== null && closes[i] > hi[i]!) enter[i] = true;
      if (lo[i] !== null && closes[i] < lo[i]!) leave[i] = true;
    }
  } else if (strategyId === 'golden') {
    const fast = calcSma(closes, 50);
    const slow = calcSma(closes, 200);
    for (let i = 0; i < n; i++) {
      if (fast[i] !== null && slow[i] !== null) {
        if (fast[i]! > slow[i]!) enter[i] = true;
        if (fast[i]! < slow[i]!) leave[i] = true;
      }
    }
  } else if (strategyId === 'connors') {
    const strength = calcRsi(closes, 2);
    const trend = calcSma(closes, 200);
    for (let i = 0; i < n; i++) {
      if (strength[i] !== null && trend[i] !== null) {
        if (strength[i]! < 10 && closes[i] > trend[i]!) enter[i] = true;
        if (strength[i]! > 70) leave[i] = true;
      }
    }
  } else if (strategyId === 'bollinger') {
    const mid = calcSma(closes, 20);
    for (let i = 19; i < n; i++) {
      const slice = closes.slice(i - 19, i + 1);
      const mean = mid[i]!;
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / 20;
      const sigma = Math.sqrt(variance);
      const lower = mean - 2.0 * sigma;
      if (closes[i] < lower) enter[i] = true;
      if (closes[i] >= mean) leave[i] = true;
    }
  } else if (strategyId === 'macd') {
    const ema12 = calcEma(closes, 12);
    const ema26 = calcEma(closes, 26);
    const line: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (ema12[i] !== null && ema26[i] !== null) {
        line[i] = ema12[i]! - ema26[i]!;
      }
    }
    const signal = calcEmaSkipNan(line, 9);
    for (let i = 1; i < n; i++) {
      if (line[i] !== null && signal[i] !== null && line[i - 1] !== null && signal[i - 1] !== null) {
        if (line[i - 1]! <= signal[i - 1]! && line[i]! > signal[i]!) {
          enter[i] = true;
        } else if (line[i - 1]! >= signal[i - 1]! && line[i]! < signal[i]!) {
          leave[i] = true;
        }
      }
    }
  } else if (strategyId === 'momentum') {
    const trend = calcSma(closes, 200);
    for (let i = 126; i < n; i++) {
      const base = closes[i - 126];
      if (base <= 0 || trend[i] === null) continue;
      const gain = closes[i] / base - 1.0;
      if (gain > 0 && closes[i] > trend[i]!) enter[i] = true;
      if (gain < 0) leave[i] = true;
    }
  }

  return { enter, leave };
}

export function backtest(
  strategyId: string,
  candles: Candle[],
  ticker: string = 'ASSET',
  market: 'nifty' | 'crypto' | 'nasdaq' | 'etfs' = 'nifty',
  source: string = 'Live tape',
  sample: boolean = false,
): Study {
  if (!isKnownStrategy(strategyId)) {
    throw new Error(`Unknown strategy: ${strategyId}`);
  }

  const rows = [...candles].filter((c) => c && c.close > 0);
  rows.sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length < 40) {
    throw new Error('Not enough daily history. Need at least 40 closes.');
  }

  const closes = rows.map((c) => c.close);
  const dates = rows.map((c) => c.date);
  const { enter, leave } = generateSignals(strategyId, closes);

  let inPos = false;
  let entryPrice = 0.0;
  let entryDate = '';
  const trades: Trade[] = [];
  let equity = 1.0;
  let peak = 1.0;
  let maxDd = 0.0;

  for (let i = 0; i < closes.length; i++) {
    const price = closes[i];
    if (price <= 0) continue;

    if (inPos && leave[i]) {
      const ret = price / entryPrice - 1.0;
      equity *= 1.0 + ret;
      trades.push({
        entry_date: entryDate,
        exit_date: dates[i],
        return: Math.round(ret * 10000) / 10000,
      });
      inPos = false;
    } else if (!inPos && enter[i] && !leave[i]) {
      inPos = true;
      entryPrice = price;
      entryDate = dates[i];
    }

    const marked = inPos && entryPrice ? equity * (price / entryPrice) : equity;
    peak = Math.max(peak, marked);
    if (peak > 0) {
      maxDd = Math.min(maxDd, marked / peak - 1.0);
    }
  }

  const marked = inPos && entryPrice ? equity * (closes[closes.length - 1] / entryPrice) : equity;
  const wins = trades.filter((t) => t.return > 0).length;
  const shown = trades.slice(-5).map((t) => ({ ...t, open: false }));

  if (inPos && entryPrice) {
    const openRow: Trade = {
      entry_date: entryDate,
      exit_date: null,
      return: Math.round((closes[closes.length - 1] / entryPrice - 1.0) * 10000) / 10000,
      open: true,
    };
    shown.push(openRow as any);
    if (shown.length > 5) shown.shift();
  }

  return {
    ticker,
    market,
    strategy: strategyId,
    bars: rows.length,
    from: dates[0],
    to: dates[dates.length - 1],
    trades: trades.length,
    win_rate: trades.length ? Math.round((wins / trades.length) * 10000) / 10000 : null,
    total_return: Math.round((marked - 1.0) * 10000) / 10000,
    max_drawdown: Math.round(maxDd * 10000) / 10000,
    open: inPos,
    stance: inPos ? 'LONG' : 'FLAT',
    last_close: Math.round(closes[closes.length - 1] * 100) / 100,
    sample,
    source,
    recent_trades: shown,
  };
}

export function sampleHistory(symbol: string): Candle[] {
  const hash = adler32(symbol);
  const kind = hash % 2 === 0 ? 'bullish' : 'bearish';
  return buildDemoCloses(symbol, kind, 8, 'strong', 420);
}
