import React from 'react';
import type { MarketType } from '../types/market';
import { MARKETS } from '../data/universes';
import { useMarketQuotes } from '../lib/quotes-context';
import { Globe } from 'lucide-react';

export type MarketSelectorProps = {
  className?: string;
  variant?: 'segmented' | 'pills' | 'dropdown' | 'bar';
  showDetails?: boolean;
  onMarketChange?: (market: MarketType) => void;
};

export function MarketSelector({
  className = '',
  variant = 'segmented',
  showDetails = false,
  onMarketChange,
}: MarketSelectorProps) {
  const { market, setMarket, isSessionOpen } = useMarketQuotes();
  const marketList: MarketType[] = ['nifty', 'crypto', 'nasdaq', 'etfs'];

  const handleSelect = (m: MarketType) => {
    setMarket(m);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('groww_market', m);
        localStorage.setItem('groww_desk_market_v1', m);
      } catch {}
    }
    if (onMarketChange) {
      onMarketChange(m);
    }
  };

  if (variant === 'dropdown') {
    return (
      <div className={`relative inline-flex items-center ${className}`}>
        <select
          value={market}
          onChange={(e) => handleSelect(e.target.value as MarketType)}
          aria-label="Select market universe"
          className="h-9 rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold text-fg outline-none focus:ring-2 focus:ring-primary cursor-pointer pr-8"
        >
          {marketList.map((m) => {
            const cfg = MARKETS[m];
            return (
              <option key={m} value={m}>
                {cfg.label} ({cfg.currencySymbol})
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div
        className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-xs"
        role="group"
        aria-label="Market selection"
      >
        {marketList.map((m) => {
          const cfg = MARKETS[m];
          const isSelected = market === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleSelect(m)}
              className={
                'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150 ' +
                (isSelected
                  ? 'bg-primary text-primary-fg font-semibold shadow-xs'
                  : 'text-muted hover:text-fg hover:bg-surface-2')
              }
            >
              <span>{cfg.label}</span>
              <span
                className={
                  'num text-[11px] font-normal transition-opacity ' +
                  (isSelected ? 'opacity-90 font-medium' : 'opacity-60')
                }
              >
                ({cfg.currencySymbol})
              </span>
            </button>
          );
        })}
      </div>

      {showDetails ? (
        <div className="flex items-center justify-between px-1 text-[11px] text-muted">
          <div className="flex items-center gap-2">
            <Globe className="size-3 text-primary" />
            <span>
              Universe: <strong className="text-fg">{MARKETS[market].label}</strong>
            </span>
            <span>·</span>
            <span>Currency: <strong className="text-fg">{MARKETS[market].currency} ({MARKETS[market].currencySymbol})</strong></span>
          </div>
          <div>
            Session: <span className={isSessionOpen ? 'text-up' : 'text-muted'}>{MARKETS[market].session}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MarketSelector;
