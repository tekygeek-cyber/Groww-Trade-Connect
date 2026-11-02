import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import type { PortfolioHolding, PortfolioSummary, MarketOpportunity, PortfolioMixPlan } from '../types/portfolio';
import {
  INITIAL_HOLDINGS,
  computePortfolioSummary,
  computePortfolioMixPlan,
} from './portfolio-engine';
import { useMarketQuotes } from './quotes-context';
import { getConstituent } from '../data/universes';
import type { MarketType } from '../types/market';
import {
  type CashCurrency, type CurrencyLedger,
  migrateLegacyInrCash, updateCurrencyCash, validateCurrencyLedger,
} from './currency-ledger';

interface PortfolioContextValue {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
  mixPlan: PortfolioMixPlan;
  cashReserve: number; // backwards-compatible INR alias; never used as USD/USDT
  cashBalances: CurrencyLedger;
  setCashReserve: (amount: number) => void;
  setCurrencyCash: (currency: CashCurrency, amount: number) => void;
  addHolding: (holding: Omit<PortfolioHolding, 'id'>) => void;
  updateHolding: (id: string, updates: Partial<PortfolioHolding>) => void;
  removeHolding: (id: string) => void;
  resetToSampleHoldings: () => void;
  addOpportunityToPortfolio: (opp: MarketOpportunity) => void;
  importHoldings: (items: PortfolioHolding[]) => void;
}

const STORAGE_KEY = 'groww_portfolio_holdings_v1';
const CASH_STORAGE_KEY = 'groww_portfolio_cash_v1';
const LEDGER_STORAGE_KEY = 'groww_currency_ledger_v1';

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { market, getQuote, quotes } = useMarketQuotes();

  const [holdings, setHoldings] = useState<PortfolioHolding[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_HOLDINGS;
  });

  const [cashBalances, setCashBalances] = useState<CurrencyLedger>(() => {
    try {
      const storedLedger = localStorage.getItem(LEDGER_STORAGE_KEY);
      if (storedLedger !== null) return validateCurrencyLedger(JSON.parse(storedLedger));
    } catch {
      // Corrupt ledger: require a safe explicit reset rather than misassigning money.
    }
    try {
      const saved = localStorage.getItem(CASH_STORAGE_KEY);
      if (saved !== null && saved.trim() !== '') {
        return migrateLegacyInrCash(Number(saved));
      }
    } catch {
      // Fall back to documented demo cash only when there is no valid stored ledger.
    }
    return migrateLegacyInrCash(350000);
  });
  const cashReserve = cashBalances.INR;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  useEffect(() => {
    try {
      localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(cashBalances));
      localStorage.setItem(CASH_STORAGE_KEY, String(cashBalances.INR));
    } catch {
      // Browsers may deny storage; values continue in memory only.
    }
  }, [cashBalances]);

  function setCurrencyCash(currency: CashCurrency, amount: number) {
    setCashBalances(previous => updateCurrencyCash(previous, currency, amount));
  }

  function setCashReserve(amount: number) {
    setCurrencyCash('INR', amount);
  }

  function addHolding(item: Omit<PortfolioHolding, 'id'>) {
    const id = 'pos-' + Math.random().toString(36).substring(2, 9);
    setHoldings((prev) => [
      {
        ...item,
        id,
      },
      ...prev,
    ]);
  }

  function updateHolding(id: string, updates: Partial<PortfolioHolding>) {
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, ...updates } : h)));
  }

  function removeHolding(id: string) {
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }

  function resetToSampleHoldings() {
    setHoldings(INITIAL_HOLDINGS);
    // Demo reset must not retain unrelated USD or USDT cash from the prior ledger.
    setCashBalances(migrateLegacyInrCash(350000));
  }

  function addOpportunityToPortfolio(opp: MarketOpportunity) {
    // Check if position already exists
    const existing = holdings.find((h) => h.ticker === opp.ticker && h.market === opp.market);
    if (existing) {
      // Add shares based on target weight
      updateHolding(existing.id, {
        shares: existing.shares + Math.max(1, Math.round(10000 / opp.entryPrice)),
        notes: `${existing.notes || ''} [Added from Portfolio Mix: ${opp.opportunityType}]`,
      });
    } else {
      // Compute reasonable shares based on entry price
      const shares = Math.max(1, Math.round((opp.market === 'crypto' ? 1.5 : 25000) / opp.entryPrice));
      addHolding({
        ticker: opp.ticker,
        name: opp.name,
        market: opp.market,
        shares,
        averageBuyPrice: opp.entryPrice,
        buyDate: new Date().toISOString().split('T')[0],
        notes: `Selected from Portfolio Mix opportunity: ${opp.opportunityType}. Catalyst: ${opp.catalystReason}`,
      });
    }
  }

  function importHoldings(items: PortfolioHolding[]) {
    setHoldings(items);
  }

  // Live quotes map for all holdings
  const quotesMap = useMemo(() => {
    const map: Record<string, { price: number; change: number; changePct: number }> = {};
    for (const h of holdings) {
      const q = getQuote(h.ticker);
      if (q) {
        map[h.ticker] = {
          price: q.price,
          change: q.change,
          changePct: q.changePct,
        };
      }
    }
    return map;
  }, [holdings, getQuote, quotes]);

  // Compute summary and portfolio mix plan
  const summary = useMemo(() => {
    return computePortfolioSummary(holdings, quotesMap, cashReserve);
  }, [holdings, quotesMap, cashReserve]);

  const mixPlan = useMemo(() => {
    return computePortfolioMixPlan(holdings, summary, market);
  }, [holdings, summary, market]);

  return (
    <PortfolioContext.Provider
      value={{
        holdings,
        summary,
        mixPlan,
        cashReserve,
        cashBalances,
        setCashReserve,
        setCurrencyCash,
        addHolding,
        updateHolding,
        removeHolding,
        resetToSampleHoldings,
        addOpportunityToPortfolio,
        importHoldings,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}
