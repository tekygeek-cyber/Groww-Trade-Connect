import { useEffect, useState } from 'react';
import { api, formatPrice, inr } from '../lib/api';
import { useMarketQuotes } from '../lib/quotes-context';
import type { GttRow } from '../types/market';
import { Info, ShieldAlert } from 'lucide-react';

function money(value: number | null): string {
  return value == null ? '—' : `₹${inr(value)}`;
}

export function GttPanel() {
  const { market, setMarket, sample, getQuote } = useMarketQuotes();
  const [rows, setRows] = useState<GttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    api<{ stocks: any[] }>(`/api/scanner-data?sample=${sample ? 'true' : 'false'}&market=nifty`)
      .then(async (payload) => {
        if (cancel) return;
        const candidates = (payload.stocks || []).slice(0, 10).map((s) => ({
          symbol: s.trading_symbol,
          buy_price: s.candles?.[s.candles.length - 1]?.low || 100,
          last_price: s.candles?.[s.candles.length - 1]?.close || 100,
          tick_size: 0.05,
        }));

        const state = await api<{ rows: GttRow[] }>('/api/algo-orders/gtt-state', {
          method: 'POST',
          body: JSON.stringify({ sample, market: 'nifty', candidates }),
        });
        if (!cancel) setRows(state.rows || []);
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'Could not load GTT orders');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [sample]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">GTT Order Placement</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Read-only status from Algo Signals · Qty 1 · Buy GTT at breakout candle low · Stoploss 5% below buy · State
            from Groww orders, positions, holdings, and GTTs.
          </p>
        </div>

        {market !== 'nifty' ? (
          <button
            type="button"
            onClick={() => setMarket('nifty')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-fg hover:bg-surface-2"
          >
            Switch to Nifty 100 for GTT
          </button>
        ) : null}
      </div>

      {market !== 'nifty' ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted">
          <ShieldAlert className="size-4 text-watch shrink-0" />
          <span>
            <strong>Notice:</strong> GTT order placement is strictly restricted to Nifty 100. For Crypto, NASDAQ, and
            ETFs, orders are not available and cannot be transmitted. Displaying Nifty 100 dummy records below.
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="note-down mt-4 rounded-lg border bg-surface px-4 py-3 text-sm text-down" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-fg">Groww GTT Placement</h2>
          <p className="text-xs text-muted">
            Simulation only. Run Live writes a local DUMMY- record and never transmits an order to Groww or any exchange.
          </p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-surface tracking-wide text-muted uppercase text-[11px]">
            <tr>
              {[
                'Rank',
                'Symbol',
                'Qty',
                'Buy Price',
                'Stoploss',
                'Last Price',
                'Account State',
                'Buy Status',
                'Buy Trigger',
                'Day Buy Order',
                'Position Qty',
                'Stoploss Status',
                'Stoploss Trigger',
                'Message',
              ].map((label) => (
                <th key={label} className="px-2.5 py-2 font-medium whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-sm text-muted">
                  Loading GTT state…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-sm text-muted">
                  No GTT setups generated. Run Live on the Algo Signals tab to create dummy GTT records.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const liveQ = getQuote(row.symbol);
                const last = liveQ?.price ?? row.last_price;
                return (
                  <tr key={row.symbol} className="hover:bg-surface transition-colors">
                    <td className="num px-2.5 py-2 text-muted">{index + 1}</td>
                    <td className="px-2.5 py-2 text-sm font-semibold text-fg">{row.symbol}</td>
                    <td className="num px-2.5 py-2">{row.quantity}</td>
                    <td className="num px-2.5 py-2">{money(row.buy_price)}</td>
                    <td className="num px-2.5 py-2">{money(row.stoploss)}</td>
                    <td className="num px-2.5 py-2 font-medium text-fg">
                      {last == null ? 'Waiting' : formatPrice(last, 'nifty')}
                    </td>
                    <td className="px-2.5 py-2 text-muted">{row.account_state}</td>
                    <td className="px-2.5 py-2 font-medium text-primary">{row.buy_status}</td>
                    <td className="num px-2.5 py-2 text-muted">{row.buy_trigger_id ?? '—'}</td>
                    <td className="num px-2.5 py-2 text-muted">{row.day_buy_order_id ?? '—'}</td>
                    <td className="num px-2.5 py-2">{row.position_quantity}</td>
                    <td className="px-2.5 py-2 text-muted">{row.stoploss_status ?? '—'}</td>
                    <td className="num px-2.5 py-2 text-muted">{row.stoploss_trigger_id ?? '—'}</td>
                    <td className="max-w-[18rem] px-2.5 py-2 text-muted truncate" title={row.message}>
                      {row.message}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
