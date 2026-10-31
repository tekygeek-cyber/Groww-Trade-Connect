import { Activity } from 'lucide-react';
import type { MarketType } from '../types/market';
import { MARKETS } from '../data/universes';

export function Wordmark({ compact = false, market = 'nifty' }: { compact?: boolean; market?: MarketType }) {
  const mkt = MARKETS[market];
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-sm">
        <Activity className="size-5" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-wide text-fg">Groww Connect</span>
        {compact ? null : <span className="block text-xs text-muted">{mkt.label} desk</span>}
      </span>
    </div>
  );
}
