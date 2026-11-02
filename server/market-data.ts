import type { Candle, Constituent, MarketType, Quote } from '../src/types/market';
import { getConstituents, NIFTY_100_CONSTITUENTS, CRYPTO_25_CONSTITUENTS, NASDAQ_100_CONSTITUENTS, ETFS_CONSTITUENTS } from '../src/data/universes';
import { buildDemoCloses } from '../src/lib/engine';

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  source: string;
};

// In-memory caches with appropriate TTLs
const candleCache = new Map<string, CacheEntry<Candle[]>>();
const quoteCache = new Map<string, CacheEntry<Record<string, Quote>>>();

const CANDLE_TTL_EQUITY = 15 * 60 * 1000; // 15 minutes
const CANDLE_TTL_CRYPTO = 60 * 1000;      // 1 minute

export async function fetchHistoricalCandles(
  market: MarketType,
  ticker: string,
  sample: boolean = false,
): Promise<{ candles: Candle[]; source: string }> {
  const cacheKey = `${market}:${ticker.toUpperCase()}`;

  if (sample) {
    return {
      candles: getSampleCandles(market, ticker),
      source: 'Sample tape',
    };
  }

  // Check cache
  const cached = candleCache.get(cacheKey);
  const ttl = market === 'crypto' ? CANDLE_TTL_CRYPTO : CANDLE_TTL_EQUITY;
  if (cached && Date.now() - cached.timestamp < ttl) {
    return { candles: cached.data, source: cached.source };
  }

  try {
    let result: { candles: Candle[]; source: string } | null = null;

    if (market === 'crypto') {
      try {
        result = await fetchKrakenCryptoCandles(ticker);
      } catch {
        result = await fetchBinanceCryptoCandles(ticker);
      }
    } else if (market === 'nasdaq' || market === 'etfs') {
      result = await fetchStooqOrYahooCandles(ticker);
    } else if (market === 'nifty') {
      // No verified NSE/Groww historical provider wired up yet.
      // Never misrepresent generated candles as an authenticated market feed.
      throw new Error('Verified Nifty candle feed unavailable; use explicit sample mode');

    }

    if (result && result.candles.length >= 25) {
      candleCache.set(cacheKey, {
        data: result.candles,
        timestamp: Date.now(),
        source: result.source,
      });
      return result;
    }
  } catch {
    // Fall back to existing cached copy if available
    if (cached && !/sample|saved nifty|synthetic/i.test(cached.source)) {
      return { candles: cached.data, source: 'Showing the last saved tape' };
    }
  }

  // Live mode fails closed. Synthetic candles exist only behind sample=true.
  throw new Error(`Verified ${market} historical candles unavailable for ${ticker}`);
}

async function fetchKrakenCryptoCandles(symbol: string): Promise<{ candles: Candle[]; source: string }> {
  const sym = symbol.toUpperCase();
  const krakenPair = sym === 'BTC' ? 'XBTUSD' : sym === 'DOGE' ? 'XDGUSD' : `${sym}USD`;
  const url = `https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=1440`;

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GrowwConnectDesk/1.0' } });
  if (!res.ok) throw new Error(`Kraken OHLC failed: ${res.status}`);

  const json: any = await res.json();
  if (json.error && json.error.length > 0) throw new Error(`Kraken API error: ${json.error.join(', ')}`);

  const result = json.result;
  const keys = Object.keys(result || {}).filter((k) => k !== 'last');
  if (keys.length === 0) throw new Error('No candle series found in Kraken result');

  const rawList: any[] = result[keys[0]];
  const candles: Candle[] = [];

  for (const item of rawList) {
    if (Array.isArray(item) && item.length >= 6) {
      const timeSec = Number(item[0]);
      const date = new Date(timeSec * 1000).toISOString().slice(0, 10);
      const open = parseFloat(item[1]);
      const high = parseFloat(item[2]);
      const low = parseFloat(item[3]);
      const close = parseFloat(item[4]);
      const volume = parseFloat(item[6]);

      if (date && close > 0) {
        candles.push({ date, open, high, low, close, volume });
      }
    }
  }

  candles.sort((a, b) => a.date.localeCompare(b.date));
  if (candles.length < 20) throw new Error('Insufficient Kraken candles returned');

  return { candles, source: 'Daily candles: Kraken public API' };
}

async function fetchBinanceCryptoCandles(symbol: string): Promise<{ candles: Candle[]; source: string }> {
  const pair = `${symbol.toUpperCase()}USDT`;
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=365`;

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GrowwConnectDesk/1.0' } });
  if (!res.ok) throw new Error(`Binance klines failed: ${res.status}`);

  const raw: any[] = await res.json();
  const candles: Candle[] = [];

  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 6) {
      const openTime = Number(item[0]);
      const date = new Date(openTime).toISOString().slice(0, 10);
      const open = parseFloat(item[1]);
      const high = parseFloat(item[2]);
      const low = parseFloat(item[3]);
      const close = parseFloat(item[4]);
      const volume = parseFloat(item[5]);

      if (date && close > 0) {
        candles.push({ date, open, high, low, close, volume });
      }
    }
  }

  candles.sort((a, b) => a.date.localeCompare(b.date));
  return { candles, source: 'Daily candles: Binance public' };
}

async function fetchStooqOrYahooCandles(symbol: string): Promise<{ candles: Candle[]; source: string }> {
  // Try 1: Stooq daily CSV
  try {
    const stooqSymbol = `${symbol.toLowerCase()}.us`;
    const stooqUrl = `https://stooq.com/q/d/l/?s=${stooqSymbol}&i=d`;
    const res = await fetch(stooqUrl, { headers: { 'User-Agent': 'Mozilla/5.0 GrowwConnectDesk/1.0' } });

    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n');
      if (lines.length > 20 && lines[0].includes('Date')) {
        const candles: Candle[] = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length >= 6) {
            const date = parts[0].trim();
            const open = parseFloat(parts[1]);
            const high = parseFloat(parts[2]);
            const low = parseFloat(parts[3]);
            const close = parseFloat(parts[4]);
            const volume = parseFloat(parts[5]) || 0;

            if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && close > 0) {
              candles.push({ date, open, high, low, close, volume });
            }
          }
        }
        if (candles.length >= 40) {
          candles.sort((a, b) => a.date.localeCompare(b.date));
          return { candles, source: 'Daily candles: Stooq' };
        }
      }
    }
  } catch {
    // Continue to Yahoo chart
  }

  // Try 2: Yahoo Finance chart endpoint
  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const res = await fetch(yfUrl, { headers: { 'User-Agent': 'Mozilla/5.0 GrowwConnectDesk/1.0' } });

    if (res.ok) {
      const data: any = await res.json();
      const result = data?.chart?.result?.[0];
      const timestamps: number[] = result?.timestamp || [];
      const quotes = result?.indicators?.quote?.[0] || {};
      const opens = quotes.open || [];
      const highs = quotes.high || [];
      const lows = quotes.low || [];
      const closes = quotes.close || [];
      const volumes = quotes.volume || [];

      const candles: Candle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i];
        if (close != null && close > 0) {
          const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
          candles.push({
            date,
            open: opens[i] ?? close,
            high: highs[i] ?? close,
            low: lows[i] ?? close,
            close,
            volume: volumes[i] ?? 0,
          });
        }
      }

      if (candles.length >= 40) {
        candles.sort((a, b) => a.date.localeCompare(b.date));
        return { candles, source: 'Daily candles: Yahoo Finance' };
      }
    }
  } catch {
    // Fall back to sample tape
  }

  throw new Error('Public candle sources failed');
}

export function getSampleCandles(market: MarketType, symbol: string): Candle[] {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash << 5) - hash + symbol.charCodeAt(i);
    hash |= 0;
  }
  const kind = Math.abs(hash) % 2 === 0 ? 'bullish' : 'bearish';
  return buildDemoCloses(symbol, kind, 8, 'strong', 420);
}
