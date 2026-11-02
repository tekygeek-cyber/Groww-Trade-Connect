import type { MarketType } from '../types/market';
import { getConstituent } from '../data/universes';

export type CashCurrency = 'INR' | 'USD' | 'USDT';
export type CurrencyLedger = Readonly<Record<CashCurrency, number>>;
const EMPTY_LEDGER: CurrencyLedger = Object.freeze({ INR: 0, USD: 0, USDT: 0 });

/** Native-currency cash is isolated; exchange conversions are never implicit. */
export function validateCurrencyLedger(value: unknown): CurrencyLedger {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Currency cash ledger must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !['INR', 'USD', 'USDT'].includes(key))) {
    throw new TypeError('Unsupported cash ledger currency');
  }
  const result = { ...EMPTY_LEDGER };
  for (const currency of ['INR', 'USD', 'USDT'] as const) {
    const amount = record[currency];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new TypeError(`Invalid cash balance for ${currency}`);
    }
    result[currency] = Math.round(amount * 100) / 100;
  }
  return Object.freeze(result);
}

/** Keep the legacy INR cash value, but never migrate it into USD/USDT. */
export function migrateLegacyInrCash(previous: unknown): CurrencyLedger {
  if (typeof previous !== 'number' || !Number.isFinite(previous) || previous < 0) {
    throw new TypeError('Invalid legacy INR balance');
  }
  return validateCurrencyLedger({ INR: previous, USD: 0, USDT: 0 });
}

export function updateCurrencyCash(ledger: CurrencyLedger, currency: CashCurrency, amount: number): CurrencyLedger {
  if (!['INR', 'USD', 'USDT'].includes(currency)) throw new TypeError('Unknown currency');
  return validateCurrencyLedger({ ...ledger, [currency]: amount });
}

/** Multi-currency ETFs must be checked by their constituent; no implicit USD defaults. */
export function getInstrumentCurrency(market: MarketType, ticker: string): CashCurrency | null {
  if (market === 'nifty') return 'INR';
  if (market === 'nasdaq') return 'USD';
  if (market === 'crypto') return 'USDT';
  if (market === 'etfs') {
    const constituent = getConstituent(market, ticker);
    return constituent?.currency || null;
  }
  return null;
}
