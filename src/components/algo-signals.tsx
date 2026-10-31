import { useEffect, useState } from 'react';
import { Play, AlertCircle, Info, Cpu, CheckCircle, SlidersHorizontal, ArrowUpRight, ShieldCheck, Trash2, ExternalLink } from 'lucide-react';
import { api, formatPrice, signed } from '../lib/api';
import { useMarketQuotes } from '../lib/quotes-context';
import { scanBook, type ScanHit, type ScanOptions } from '../lib/breakout';
import { MARKETS } from '../data/universes';
import { MarketSelector } from './market-selector';
import { BrokerStatusModal } from './broker-status-modal';

export interface AlgoOrderRow {
  id: string;
  brokerId: 'groww' | 'kraken' | 'etoro';
  market: string;
  symbol: string;
  companyName: string;
  entryPrice: number;
  stoploss: number;
  targetPrice: number;
  currentPrice: number;
  quantity: number;
  orderType: string;
  status: 'active' | 'triggered' | 'cancelled' | 'filled';
  mode: 'live' | 'paper';
  createdAt: string;
  message?: string;
}

export function AlgoSignalsPanel() {
  const { market, sample, quoteStatus, getQuote } = useMarketQuotes();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState('Loading scanner data…');
  const [stocks, setStocks] = useState<any[]>([]);
  const [selected, setSelected] = useState<ScanHit | null>(null);
  const [running, setRunning] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeOrders, setActiveOrders] = useState<AlgoOrderRow[]>([]);
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const [scanSensitivity, setScanSensitivity] = useState<'balanced' | 'strict'>('balanced');

  const mktConfig = MARKETS[market];

  // Active broker mapping
  const brokerName =
    market === 'nifty'
      ? 'Groww (NSE)'
      : market === 'crypto'
      ? 'Kraken (Crypto)'
      : market === 'nasdaq'
      ? 'eToro (NASDAQ)'
      : 'eToro (Global ETFs)';

  const brokerId = market === 'nifty' ? 'groww' : market === 'crypto' ? 'kraken' : 'etoro';

  const scanOpts: ScanOptions =
    scanSensitivity === 'strict'
      ? { volumeMultiple: 3.0, midpointTolerance: 1.0, maxAge: 20 }
      : { volumeMultiple: 1.8, midpointTolerance: 2.2, maxAge: 25 };

  const loadData = async (refresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const query = `?sample=${sample ? 'true' : 'false'}&market=${market}${refresh ? '&refresh=true' : ''}`;
      const payload = await api<{ metadata: { live_status?: string }; stocks: any[] }>(`/api/scanner-data${query}`);
      setStocks(payload.stocks ?? []);
      setLiveStatus(payload.metadata?.live_status || 'Scanner cache loaded');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not load scanner.');
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const res = await api<{ orders: AlgoOrderRow[] }>(`/api/algo-orders/list?market=${market}`);
      setActiveOrders(res.orders ?? []);
    } catch {}
  };

  useEffect(() => {
    loadData(false);
    loadOrders();
    setSelected(null);
    setSuccessMessage(null);
  }, [market, sample]);

  const book = scanBook(stocks, scanOpts);

  // Run algo triggers for the active broker
  const runAlgoOrders = async () => {
    if (book.hits.length === 0) return;
    setRunning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const candidates = book.hits.slice(0, 5).map((hit) => {
        const liveQ = getQuote(hit.symbol);
        const entry = hit.breakoutLow || hit.currentPrice;
        return {
          symbol: hit.symbol,
          companyName: hit.companyName,
          buy_price: entry,
          last_price: liveQ?.price ?? hit.currentPrice,
          stoploss: Math.round(entry * 0.95 * 100) / 100,
          targetPrice: Math.round(entry * 1.12 * 100) / 100,
          tick_size: market === 'crypto' ? 0.01 : 0.05,
        };
      });

      const res = await api<{ orders: AlgoOrderRow[]; broker: any }>('/api/algo-orders/execute', {
        method: 'POST',
        body: JSON.stringify({
          market,
          candidates,
        }),
      });

      setSuccessMessage(
        `Successfully placed ${res.orders.length} algo triggers with ${res.broker.name} (${res.broker.mode.toUpperCase()} mode).`,
      );
      await loadOrders();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Algo execution failed.');
    } finally {
      setRunning(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await api('/api/algo-orders/cancel', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
      await loadOrders();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order.');
    }
  };

  return (
    <section className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Algo Signals</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Cpu className="size-3.5" />
              {brokerName}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            High-volume breakout and retest scanner for {mktConfig.label}. Generates automated conditional bracket triggers
            routed to {brokerName}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <MarketSelector />

          <button
            type="button"
            onClick={() => setIsBrokerModalOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors"
          >
            <SlidersHorizontal className="size-3.5 text-primary" />
            Broker Settings
          </button>

          <button
            type="button"
            disabled={running || loading || book.hits.length === 0}
            onClick={() => void runAlgoOrders()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
          >
            <Play className="size-3.5 fill-current" />
            {running ? 'Executing…' : `Run Algo (${brokerId.toUpperCase()})`}
          </button>
        </div>
      </div>

      {/* Broker & Market Routing Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary shrink-0" />
          <span>
            Market: <strong className="text-fg">{mktConfig.label}</strong> ({mktConfig.currency}) · Execution Venue:{' '}
            <strong className="text-primary">{brokerName}</strong> · Feed: {liveStatus}
          </span>
        </div>

        {/* Scan Sensitivity Toggle */}
        <div className="flex items-center gap-1.5 bg-bg border border-border rounded-lg p-1">
          <button
            onClick={() => setScanSensitivity('balanced')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              scanSensitivity === 'balanced' ? 'bg-primary text-primary-fg font-semibold' : 'text-muted hover:text-fg'
            }`}
          >
            Balanced (1.8x Vol, 2% Retest)
          </button>
          <button
            onClick={() => setScanSensitivity('strict')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              scanSensitivity === 'strict' ? 'bg-primary text-primary-fg font-semibold' : 'text-muted hover:text-fg'
            }`}
          >
            Strict (3.0x Vol, 1% Retest)
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <p className="note-down rounded-lg border bg-surface px-4 py-3 text-sm text-down" role="alert">
          {error}
        </p>
      )}

      {/* Triggered Breakouts Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-fg">Triggered Breakouts</h2>
            <p className="text-xs text-muted">
              {book.hits.length} setups identified across {book.scanned} scanned symbols · Quotes: {quoteStatus}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-surface tracking-wide text-muted uppercase text-[11px]">
              <tr>
                {[
                  'Rank',
                  'Symbol',
                  'Current Price',
                  'Breakout Date',
                  'Age',
                  'Volume Surge',
                  'Retest Distance',
                  'Peak Gains',
                  'Retracement',
                  'Broker Trigger State',
                  'Action',
                ].map((label) => (
                  <th key={label} className="px-3 py-2.5 font-medium whitespace-nowrap">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-muted">
                    Scanning {mktConfig.label} volume profile and price action…
                  </td>
                </tr>
              ) : book.hits.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-muted">
                    No breakout retest setups match the current {scanSensitivity} parameters in {mktConfig.label}. Try
                    switching to Balanced sensitivity.
                  </td>
                </tr>
              ) : (
                book.hits.map((hit, index) => {
                  const liveQ = getQuote(hit.symbol);
                  const price = liveQ?.price ?? hit.currentPrice;
                  const isSelected = selected?.symbol === hit.symbol;

                  return (
                    <tr
                      key={hit.symbol}
                      onClick={() => setSelected(hit)}
                      className={'cursor-pointer transition-colors ' + (isSelected ? 'bg-surface-2' : 'hover:bg-surface')}
                    >
                      <td className="num px-3 py-2 text-muted">{index + 1}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-fg">
                        {hit.symbol}
                        <span className="ml-1.5 text-[11px] font-normal text-muted truncate max-w-28 inline-block align-middle">
                          {hit.companyName}
                        </span>
                      </td>
                      <td className="num px-3 py-2 font-medium text-fg">{formatPrice(price, market)}</td>
                      <td className="num px-3 py-2 text-muted">{hit.breakoutDate}</td>
                      <td className="num px-3 py-2 text-muted">{hit.daysSince} bars</td>
                      <td className="num px-3 py-2 text-primary font-medium">{hit.volMultiple.toFixed(2)}x</td>
                      <td className="num px-3 py-2 font-medium text-fg">{signed(hit.distanceFromMidpoint)}</td>
                      <td className="num px-3 py-2 text-up">{signed(hit.returnFromCloseToSubHigh)}</td>
                      <td className="num px-3 py-2 text-down">{signed(hit.retracementHigh)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400 font-medium">
                          Ready ({brokerId === 'groww' ? 'GTT' : brokerId === 'kraken' ? 'Kraken Stop' : 'eToro Bracket'})
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(hit);
                          }}
                          className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-fg hover:bg-surface-2"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Setup & Order Preview Card */}
      {selected && (
        <div className="rounded-xl border border-primary/30 bg-surface-2/40 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wide text-primary font-semibold">Breakout Inspector & Order Config</span>
              <h3 className="text-lg font-semibold text-fg flex items-center gap-2">
                {selected.symbol} · {selected.companyName}
              </h3>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-muted hover:text-fg underline"
            >
              Close Inspector
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg border border-border bg-bg p-3">
              <span className="text-muted block text-[11px]">Breakout Midpoint</span>
              <span className="text-fg font-medium text-sm">{formatPrice(selected.midpoint, market)}</span>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <span className="text-muted block text-[11px]">Buy Trigger Price</span>
              <span className="text-emerald-400 font-medium text-sm">
                {formatPrice(selected.breakoutLow || selected.currentPrice, market)}
              </span>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <span className="text-muted block text-[11px]">Suggested Stop-Loss (-5%)</span>
              <span className="text-red-400 font-medium text-sm">
                {formatPrice((selected.breakoutLow || selected.currentPrice) * 0.95, market)}
              </span>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <span className="text-muted block text-[11px]">Target Objective (+12%)</span>
              <span className="text-sky-400 font-medium text-sm">
                {formatPrice((selected.breakoutLow || selected.currentPrice) * 1.12, market)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-muted flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-400" />
              <span>
                Routing destination: <strong className="text-fg">{brokerName}</strong> conditional order engine.
              </span>
            </div>

            <button
              onClick={() => void runAlgoOrders()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-fg hover:opacity-90"
            >
              Arm {brokerId.toUpperCase()} Trigger Now
            </button>
          </div>
        </div>
      )}

      {/* Active Algo Orders & Triggers Ledger */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-fg">Active Algo Triggers & Orders</h2>
            <p className="text-xs text-muted">
              Live and paper orders routed to {brokerName} for {mktConfig.label}
            </p>
          </div>
          <button
            onClick={loadOrders}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Refresh Ledger
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-surface tracking-wide text-muted uppercase text-[11px]">
              <tr>
                {[
                  'Order ID',
                  'Broker',
                  'Symbol',
                  'Order Type',
                  'Trigger Entry',
                  'Stop Loss',
                  'Target Price',
                  'Status',
                  'Mode',
                  'Created',
                  'Actions',
                ].map((label) => (
                  <th key={label} className="px-3 py-2.5 font-medium whitespace-nowrap">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeOrders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-xs text-muted">
                    No active algo triggers for {mktConfig.label}. Click "Run Algo" to generate orders.
                  </td>
                </tr>
              ) : (
                activeOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-surface/50">
                    <td className="num px-3 py-2 font-mono text-[11px] text-muted">{ord.id}</td>
                    <td className="px-3 py-2 font-semibold text-fg uppercase">{ord.brokerId}</td>
                    <td className="px-3 py-2 font-semibold text-fg">{ord.symbol}</td>
                    <td className="px-3 py-2 text-muted">{ord.orderType}</td>
                    <td className="num px-3 py-2 font-medium text-fg">{formatPrice(ord.entryPrice, market)}</td>
                    <td className="num px-3 py-2 text-down font-medium">{formatPrice(ord.stoploss, market)}</td>
                    <td className="num px-3 py-2 text-up font-medium">{formatPrice(ord.targetPrice, market)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium capitalize ${
                          ord.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : ord.status === 'cancelled'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-surface-2 text-muted'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted uppercase">
                        {ord.mode}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-muted">{new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2">
                      {ord.status === 'active' && (
                        <button
                          onClick={() => cancelOrder(ord.id)}
                          className="text-red-400 hover:text-red-300 p-1"
                          title="Cancel Order"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Broker Manager Modal */}
      <BrokerStatusModal
        isOpen={isBrokerModalOpen}
        onClose={() => setIsBrokerModalOpen(false)}
        onUpdate={loadOrders}
      />
    </section>
  );
}
