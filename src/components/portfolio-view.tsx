import { useState, useMemo } from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  PieChart,
  Layers,
  ArrowUpRight,
  ExternalLink,
  Edit2,
  Newspaper,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  Upload,
  Info,
  Check,
  Scale,
} from 'lucide-react';
import { usePortfolio } from '../lib/portfolio-context';
import { useMarketQuotes } from '../lib/quotes-context';
import { getConstituents, MARKETS } from '../data/universes';
import type { MarketType } from '../types/market';
import type { PortfolioHolding, MarketOpportunity } from '../types/portfolio';
import { SignalNewsPanel } from './signal-news-panel';
import { GoogleSheetsModal } from './google-sheets-modal';
import { PortfolioRebalancePanel } from './portfolio-rebalance-panel';
import { FX_USD_TO_INR, convertToINR, convertToUSD } from '../lib/portfolio-engine';

export function PortfolioView() {
  const {
    holdings,
    summary,
    mixPlan,
    cashReserve,
    setCashReserve,
    addHolding,
    updateHolding,
    removeHolding,
    resetToSampleHoldings,
    addOpportunityToPortfolio,
  } = usePortfolio();

  const { getQuote, market: deskMarket } = useMarketQuotes();

  const [activeTab, setActiveTab] = useState<'holdings' | 'mix' | 'rebalance'>('holdings');
  // Currency selection: INR (₹), USD ($), or USDT (₮)
  const [selectedCurrency, setSelectedCurrency] = useState<'INR' | 'USD' | 'USDT'>('INR');
  const [marketFilter, setMarketFilter] = useState<'all' | MarketType>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [selectedForNews, setSelectedForNews] = useState<{ symbol: string; market: MarketType } | null>(null);
  const [addedOppIds, setAddedOppIds] = useState<Set<string>>(new Set());

  // Filtered holdings
  const filteredHoldings = holdings.filter(
    (h) => marketFilter === 'all' || h.market === marketFilter
  );

  // Set of tickers currently held in portfolio
  const heldTickerSet = useMemo(() => {
    return new Set(holdings.map((h) => `${h.market}:${h.ticker}`));
  }, [holdings]);

  // Identify opportunities that are NOT currently in the portfolio
  const notHeldOpportunities = useMemo(() => {
    return mixPlan.opportunities.filter((opp) => !heldTickerSet.has(`${opp.market}:${opp.ticker}`));
  }, [mixPlan.opportunities, heldTickerSet]);

  /**
   * Format any INR amount into the user-selected currency (INR ₹, USD $, or USDT ₮)
   */
  function formatVal(amountINR: number): string {
    if (selectedCurrency === 'USD') {
      const usd = amountINR / FX_USD_TO_INR;
      return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (selectedCurrency === 'USDT') {
      const usdt = amountINR / FX_USD_TO_INR;
      return `₮${usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `₹${amountINR.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function handleAddOpportunity(opp: MarketOpportunity) {
    addOpportunityToPortfolio(opp);
    setAddedOppIds((prev) => new Set(prev).add(opp.id));
  }

  return (
    <section className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Multi-Market Stock Portfolio</h1>
            <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted border border-border">
              {holdings.length} Active Positions
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Unified institutional portfolio tracking across Nifty 100, NASDAQ, Crypto, and liquid ETFs with real-time
            pricing, asset allocation metrics, and opportunity mix rebalancing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selected Market Currency Toggle */}
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setSelectedCurrency('INR')}
              className={
                'rounded px-2.5 py-1 transition-colors ' +
                (selectedCurrency === 'INR' ? 'bg-primary text-primary-fg font-semibold' : 'text-muted hover:text-fg')
              }
              title="Display values in Indian Rupee (INR ₹)"
            >
              INR (₹)
            </button>
            <button
              type="button"
              onClick={() => setSelectedCurrency('USD')}
              className={
                'rounded px-2.5 py-1 transition-colors ' +
                (selectedCurrency === 'USD' ? 'bg-primary text-primary-fg font-semibold' : 'text-muted hover:text-fg')
              }
              title="Display values in US Dollar (USD $)"
            >
              USD ($)
            </button>
            <button
              type="button"
              onClick={() => setSelectedCurrency('USDT')}
              className={
                'rounded px-2.5 py-1 transition-colors ' +
                (selectedCurrency === 'USDT' ? 'bg-primary text-primary-fg font-semibold' : 'text-muted hover:text-fg')
              }
              title="Display values in Tether (USDT ₮)"
            >
              USDT (₮)
            </button>
          </div>

          {/* Google Sheets Sync Button */}
          <button
            type="button"
            onClick={() => setShowSheetsModal(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            title="Sync portfolio and opportunity mix with Google Sheets"
          >
            <FileSpreadsheet className="size-3.5 text-emerald-400" />
            Google Sheets
          </button>

          {/* Reset Sample Button */}
          <button
            type="button"
            onClick={resetToSampleHoldings}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-muted hover:text-fg hover:bg-surface-2 transition-colors"
            title="Reset portfolio to curated sample starter holdings"
          >
            <RotateCcw className="size-3.5" />
            Reset Sample
          </button>

          {/* Add Position Button */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-fg hover:opacity-90 transition-opacity"
          >
            <Plus className="size-3.5" />
            Add Position
          </button>
        </div>
      </div>

      {/* Primary KPI Metric Cards (Calculated in Selected Currency) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Portfolio Valuation in Selected Currency */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Total Portfolio Value ({selectedCurrency})
          </p>
          <p className="num mt-2 text-2xl font-bold text-fg">{formatVal(summary.totalDeskValue)}</p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>Invested: {formatVal(summary.totalInvested)}</span>
            <span className="num">Cash: {formatVal(summary.cashReserve)}</span>
          </div>
        </div>

        {/* Total Unrealized P&L in Selected Currency */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Total Unrealized Return</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={
                'num text-2xl font-bold ' +
                (summary.unrealizedPnL >= 0 ? 'text-up' : 'text-down')
              }
            >
              {summary.unrealizedPnL >= 0 ? '+' : ''}
              {formatVal(summary.unrealizedPnL)}
            </span>
            <span
              className={
                'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ' +
                (summary.unrealizedPnL >= 0 ? 'tone-up' : 'tone-down')
              }
            >
              {summary.unrealizedPnL >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {summary.unrealizedPnLPct >= 0 ? '+' : ''}
              {summary.unrealizedPnLPct.toFixed(2)}%
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">Across all {holdings.length} active holdings</p>
        </div>

        {/* Day P&L in Selected Currency */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Today's P&L (Live Session)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={
                'num text-2xl font-bold ' +
                (summary.dayPnL >= 0 ? 'text-up' : 'text-down')
              }
            >
              {summary.dayPnL >= 0 ? '+' : ''}
              {formatVal(summary.dayPnL)}
            </span>
            <span
              className={
                'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ' +
                (summary.dayPnL >= 0 ? 'tone-up' : 'tone-down')
              }
            >
              {summary.dayPnL >= 0 ? '+' : ''}
              {summary.dayPnLPct.toFixed(2)}%
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">Calculated from streaming real-time prices</p>
        </div>

        {/* Mix Efficiency & Risk Ratio */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Opportunity Mix Sharpe</p>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              Optimal
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num text-2xl font-bold text-fg">{mixPlan.projectedSharpeRatio.toFixed(2)}</span>
            <span className="text-xs text-muted">Projected Sharpe</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>Exp Return: +{mixPlan.projectedReturnPct}%</span>
            <span>Max DD: -{mixPlan.maxDrawdownBufferPct}%</span>
          </div>
        </div>
      </div>

      {/* Asset Allocation Breakdown Bar */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Asset Allocation Breakdown</span>
          <span className="num text-xs text-muted">
            100% Capital Deployed (Equities, Tech, Crypto, ETFs, Cash Buffer)
          </span>
        </div>

        {/* Segmented Bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-md bg-surface-2">
          <div
            style={{ width: `${summary.byMarket.nifty.weight}%` }}
            className="bg-emerald-500 transition-all"
            title={`Nifty 100: ${summary.byMarket.nifty.weight}%`}
          />
          <div
            style={{ width: `${summary.byMarket.nasdaq.weight}%` }}
            className="bg-blue-500 transition-all"
            title={`NASDAQ: ${summary.byMarket.nasdaq.weight}%`}
          />
          <div
            style={{ width: `${summary.byMarket.crypto.weight}%` }}
            className="bg-amber-500 transition-all"
            title={`Crypto: ${summary.byMarket.crypto.weight}%`}
          />
          <div
            style={{ width: `${summary.byMarket.etfs.weight}%` }}
            className="bg-purple-500 transition-all"
            title={`ETFs: ${summary.byMarket.etfs.weight}%`}
          />
          <div
            style={{
              width: `${Math.round((summary.cashReserve / (summary.totalDeskValue || 1)) * 1000) / 10}%`,
            }}
            className="bg-zinc-600 transition-all"
            title="Cash Reserve"
          />
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-muted">Nifty 100:</span>
            <span className="num font-medium text-fg">{summary.byMarket.nifty.weight}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-500" />
            <span className="text-muted">NASDAQ:</span>
            <span className="num font-medium text-fg">{summary.byMarket.nasdaq.weight}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" />
            <span className="text-muted">Crypto:</span>
            <span className="num font-medium text-fg">{summary.byMarket.crypto.weight}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-purple-500" />
            <span className="text-muted">ETFs:</span>
            <span className="num font-medium text-fg">{summary.byMarket.etfs.weight}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-zinc-500" />
            <span className="text-muted">Cash Buffer:</span>
            <span className="num font-medium text-fg">
              {(Math.round((summary.cashReserve / (summary.totalDeskValue || 1)) * 1000) / 10).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Holdings vs Opportunity Mix */}
      <div className="border-b border-border flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('holdings')}
            className={
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ' +
              (activeTab === 'holdings'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-fg')
            }
          >
            <Briefcase className="size-4" />
            Stock Holdings ({holdings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mix')}
            className={
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ' +
              (activeTab === 'mix'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-fg')
            }
          >
            <Sparkles className="size-4 text-primary" />
            Opportunity Mix ({notHeldOpportunities.length} Unheld High-Probability)
            <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] text-primary">
              +{mixPlan.projectedReturnPct}% Edge
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rebalance')}
            className={
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ' +
              (activeTab === 'rebalance'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-fg')
            }
          >
            <Scale className="size-4 text-primary" />
            Rebalance Portfolio
            <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] text-primary">
              v2.0 Audited
            </span>
          </button>
        </div>

        {activeTab === 'holdings' && (
          <div className="flex items-center gap-1.5 text-xs pb-2">
            <span className="text-muted hidden sm:inline">Universe:</span>
            {(['all', 'nifty', 'nasdaq', 'crypto', 'etfs'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMarketFilter(m)}
                className={
                  'rounded px-2 py-1 text-xs font-medium transition-colors ' +
                  (marketFilter === m
                    ? 'bg-surface-2 text-fg border border-border'
                    : 'text-muted hover:text-fg')
                }
              >
                {m === 'all' ? 'All' : MARKETS[m].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TAB 1: Stock Holdings Table */}
      {activeTab === 'holdings' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-3 font-medium">Asset & Ticker</th>
                  <th className="px-3 py-3 font-medium">Market</th>
                  <th className="px-3 py-3 text-right font-medium">Shares / Units</th>
                  <th className="px-3 py-3 text-right font-medium">Avg Buy Cost</th>
                  <th className="px-3 py-3 text-right font-medium">Live Price</th>
                  <th className="px-3 py-3 text-right font-medium">Market Value ({selectedCurrency})</th>
                  <th className="px-3 py-3 text-right font-medium">Unrealized Return</th>
                  <th className="px-3 py-3 text-right font-medium">Weight</th>
                  <th className="px-3 py-3 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-xs text-muted">
                      No holdings in this filter. Click "Add Position" or reset to sample portfolio.
                    </td>
                  </tr>
                ) : (
                  filteredHoldings.map((h) => {
                    const q = getQuote(h.ticker);
                    const livePrice = q?.price ?? h.averageBuyPrice;
                    const nativeInvested = h.shares * h.averageBuyPrice;
                    const nativeValue = h.shares * livePrice;
                    const nativePnL = nativeValue - nativeInvested;
                    const pnlPct = nativeInvested > 0 ? (nativePnL / nativeInvested) * 100 : 0;

                    const inrValue = convertToINR(nativeValue, h.market);
                    const weightPct =
                      summary.totalDeskValue > 0
                        ? (inrValue / summary.totalDeskValue) * 100
                        : 0;

                    const mktConfig = MARKETS[h.market];
                    const isPositive = nativePnL >= 0;

                    return (
                      <tr key={h.id} className="hover:bg-surface-2/60 transition-colors">
                        {/* Asset */}
                        <td className="px-3 py-3.5">
                          <div className="font-semibold text-fg num">{h.ticker}</div>
                          <div className="text-[11px] text-muted truncate max-w-44">{h.name}</div>
                        </td>

                        {/* Market */}
                        <td className="px-3 py-3.5">
                          <span
                            className={
                              'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border ' +
                              (h.market === 'nifty'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : h.market === 'nasdaq'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : h.market === 'crypto'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-purple-500/10 text-purple-400 border-purple-500/20')
                            }
                          >
                            {mktConfig.label}
                          </span>
                        </td>

                        {/* Shares */}
                        <td className="px-3 py-3.5 text-right font-medium num text-fg">
                          {h.shares < 1 ? h.shares.toFixed(4) : h.shares.toLocaleString()}
                        </td>

                        {/* Avg Buy */}
                        <td className="px-3 py-3.5 text-right num text-muted">
                          {mktConfig.currencySymbol}
                          {h.averageBuyPrice.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>

                        {/* Live Price */}
                        <td className="px-3 py-3.5 text-right num font-medium text-fg">
                          {mktConfig.currencySymbol}
                          {livePrice.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>

                        {/* Market Value in Selected Currency */}
                        <td className="px-3 py-3.5 text-right num font-semibold text-fg">
                          {formatVal(inrValue)}
                        </td>

                        {/* Unrealized Return */}
                        <td className="px-3 py-3.5 text-right">
                          <div className={'num font-semibold ' + (isPositive ? 'text-up' : 'text-down')}>
                            {isPositive ? '+' : ''}
                            {formatVal(convertToINR(nativePnL, h.market))}
                          </div>
                          <div className={'num text-[11px] ' + (isPositive ? 'text-up' : 'text-down')}>
                            {isPositive ? '+' : ''}
                            {pnlPct.toFixed(2)}%
                          </div>
                        </td>

                        {/* Weight */}
                        <td className="px-3 py-3.5 text-right num font-medium text-fg">
                          {weightPct.toFixed(1)}%
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedForNews({ symbol: h.ticker, market: h.market })}
                              className="rounded p-1 text-muted hover:text-primary hover:bg-surface-2 transition-colors"
                              title="Search live market news & catalysts for this holding"
                            >
                              <Newspaper className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingHolding(h)}
                              className="rounded p-1 text-muted hover:text-fg hover:bg-surface-2 transition-colors"
                              title="Edit position"
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeHolding(h.id)}
                              className="rounded p-1 text-muted hover:text-down hover:bg-surface-2 transition-colors"
                              title="Remove holding"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Dedicated Signal News Drawer for selected holding */}
          {selectedForNews && (
            <div className="mt-4">
              <SignalNewsPanel
                selectedSymbols={[selectedForNews.symbol]}
                market={selectedForNews.market}
                onClose={() => setSelectedForNews(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Opportunity Mix Section */}
      {activeTab === 'mix' && (
        <div className="space-y-6">
          {/* Opportunity Mix Strategy Banner */}
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-fg">Opportunity Mix Engine</h2>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary border border-primary/20">
                    Active Quant Edge Model
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-xs text-muted">
                  Scans across Nifty 100, NASDAQ, Crypto, and ETFs to detect high-probability technical setups
                  (Monte Carlo BUY edges, 20D volume breakouts, and SMA crossovers) that are not currently in your
                  holdings.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowSheetsModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  <FileSpreadsheet className="size-3.5" />
                  Export Mix to Sheets
                </button>
                <div className="h-8 w-px bg-border hidden sm:block" />
                <div className="text-right">
                  <p className="text-[11px] text-muted">Projected Return</p>
                  <p className="num text-sm font-semibold text-primary">+{mixPlan.projectedReturnPct}%</p>
                </div>
              </div>
            </div>

            {/* Target Allocations Grid */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {mixPlan.allocations.map((alloc) => {
                const diff = alloc.variance;
                const isUnder = diff > 0;
                return (
                  <div key={alloc.category} className="rounded-lg border border-border bg-bg p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-fg">{alloc.category}</span>
                      <span
                        className={
                          'num text-[11px] font-medium ' +
                          (Math.abs(diff) <= 2
                            ? 'text-muted'
                            : isUnder
                            ? 'text-up'
                            : 'text-watch')
                        }
                      >
                        {isUnder ? `+${diff}% Need` : `${diff}% Trim`}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between text-xs">
                      <span className="text-muted">Current:</span>
                      <span className="num font-semibold text-fg">{alloc.currentWeight}%</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between text-xs">
                      <span className="text-muted">Target Mix:</span>
                      <span className="num font-semibold text-primary">{alloc.targetWeight}%</span>
                    </div>

                    {/* Mini progress bar */}
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        style={{ width: `${Math.min(100, (alloc.currentWeight / alloc.targetWeight) * 100)}%` }}
                        className="h-full bg-primary"
                      />
                    </div>

                    <p className="mt-2 text-[11px] text-muted leading-tight">{alloc.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Assets with Strong Technical Signals Not Currently in Portfolio */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-fg">
                    Unheld Technical Opportunities ({notHeldOpportunities.length})
                  </h3>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                    Not in Portfolio
                  </span>
                </div>
                <p className="text-xs text-muted">
                  High-probability setups flagged by Monte Carlo simulation, breakout algorithms, and momentum models.
                </p>
              </div>
              <span className="text-xs text-muted">1-Click "Add to Portfolio" to initiate tactical allocation</span>
            </div>

            {notHeldOpportunities.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface p-8 text-center text-xs text-muted">
                All identified high-conviction opportunities are currently held in your portfolio! Check back as new
                breakout scans execute.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {notHeldOpportunities.map((opp) => {
                  const isAdded = addedOppIds.has(opp.id);
                  const mktConfig = MARKETS[opp.market];

                  return (
                    <div
                      key={opp.id}
                      className="rounded-lg border border-border bg-surface p-4 flex flex-col justify-between hover:border-border/90 transition-colors"
                    >
                      <div>
                        {/* Top Row: Symbol, Market, & Opportunity Type */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="num font-bold text-base text-fg">{opp.ticker}</span>
                            <span
                              className={
                                'rounded px-1.5 py-0.5 text-[10px] font-medium border ' +
                                (opp.market === 'nifty'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : opp.market === 'nasdaq'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : opp.market === 'crypto'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-purple-500/10 text-purple-400 border-purple-500/20')
                              }
                            >
                              {mktConfig.label}
                            </span>
                          </div>

                          <span
                            className={
                              'rounded px-2 py-0.5 text-[10px] font-semibold ' +
                              (opp.opportunityType === 'Monte Carlo BUY'
                                ? 'tone-up'
                                : opp.opportunityType === 'Algo Breakout'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : 'bg-surface-2 text-muted border border-border')
                            }
                          >
                            {opp.opportunityType}
                          </span>
                        </div>

                        <p className="text-xs text-muted truncate mt-0.5">{opp.name}</p>

                        {/* Technical Specs */}
                        <div className="mt-3.5 grid grid-cols-3 gap-2 rounded bg-bg p-2 text-xs">
                          <div>
                            <p className="text-[10px] text-muted">Entry</p>
                            <p className="num font-medium text-fg">
                              {mktConfig.currencySymbol}
                              {opp.entryPrice}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">Target</p>
                            <p className="num font-medium text-up">
                              {mktConfig.currencySymbol}
                              {opp.targetPrice}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted">Stop Loss</p>
                            <p className="num font-medium text-down">
                              {mktConfig.currencySymbol}
                              {opp.stopLoss}
                            </p>
                          </div>
                        </div>

                        {/* Edge & Confidence */}
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="text-muted">Stat Edge:</span>
                          <span className="num font-semibold text-up">+{opp.expectedEdgePct}%</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="text-muted">Desk Confidence:</span>
                          <span className="num font-semibold text-fg">{opp.confidenceScore}%</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="text-muted">Target Weight:</span>
                          <span className="num font-semibold text-primary">{opp.recommendedWeightPct}%</span>
                        </div>

                        <p className="mt-3 text-xs text-muted leading-relaxed border-t border-border/50 pt-2.5">
                          {opp.catalystReason}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted">{opp.timeframe}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedForNews({ symbol: opp.ticker, market: opp.market })}
                            className="text-[11px] text-muted hover:text-primary transition-colors flex items-center gap-1"
                            title="Search catalysts & news"
                          >
                            <Newspaper className="size-3" />
                            News
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddOpportunity(opp)}
                          disabled={isAdded}
                          className={
                            'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ' +
                            (isAdded
                              ? 'bg-surface-2 text-up border border-up/30 cursor-default'
                              : 'bg-primary text-primary-fg hover:opacity-90')
                          }
                        >
                          {isAdded ? (
                            <>
                              <CheckCircle2 className="size-3.5" />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus className="size-3.5" />
                              Add to Portfolio
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Rebalance Portfolio Section */}
      {activeTab === 'rebalance' && (
        <PortfolioRebalancePanel
          initialMarket={deskMarket}
          selectedCurrency={selectedCurrency}
          formatCurrency={formatVal}
        />
      )}

      {/* Google Sheets Modal */}
      <GoogleSheetsModal
        isOpen={showSheetsModal}
        onClose={() => setShowSheetsModal(false)}
        currency={selectedCurrency === 'USDT' ? 'USD' : selectedCurrency}
      />

      {/* Add / Edit Position Modal */}
      {(showAddModal || editingHolding) && (
        <PositionModal
          holding={editingHolding}
          defaultMarket={deskMarket}
          onClose={() => {
            setShowAddModal(false);
            setEditingHolding(null);
          }}
          onSave={(data) => {
            if (editingHolding) {
              updateHolding(editingHolding.id, data);
            } else {
              addHolding(data);
            }
            setShowAddModal(false);
            setEditingHolding(null);
          }}
        />
      )}
    </section>
  );
}

function PositionModal({
  holding,
  defaultMarket,
  onClose,
  onSave,
}: {
  holding: PortfolioHolding | null;
  defaultMarket: MarketType;
  onClose: () => void;
  onSave: (data: Omit<PortfolioHolding, 'id'>) => void;
}) {
  const [market, setMarket] = useState<MarketType>(holding?.market || defaultMarket);
  const [ticker, setTicker] = useState(holding?.ticker || '');
  const [name, setName] = useState(holding?.name || '');
  const [shares, setShares] = useState(holding ? String(holding.shares) : '10');
  const [buyPrice, setBuyPrice] = useState(holding ? String(holding.averageBuyPrice) : '100');
  const [buyDate, setBuyDate] = useState(holding?.buyDate || new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState(holding?.notes || '');

  const constituents = getConstituents(market);

  function handleTickerChange(val: string) {
    const up = val.toUpperCase();
    setTicker(up);
    const match = constituents.find((c) => c.ticker === up);
    if (match) {
      setName(match.name);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;

    onSave({
      ticker: ticker.trim().toUpperCase(),
      name: name.trim() || ticker.trim().toUpperCase(),
      market,
      shares: Math.max(0.0001, parseFloat(shares) || 1),
      averageBuyPrice: Math.max(0.01, parseFloat(buyPrice) || 1),
      buyDate,
      notes: notes.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-base font-semibold text-fg">
            {holding ? `Edit Position: ${holding.ticker}` : 'Add New Portfolio Position'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted hover:text-fg rounded p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Market Universe */}
          <div>
            <label className="block text-xs font-medium text-muted uppercase">Market Universe</label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value as MarketType)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
            >
              {(Object.keys(MARKETS) as MarketType[]).map((m) => (
                <option key={m} value={m}>
                  {MARKETS[m].label} ({MARKETS[m].currency})
                </option>
              ))}
            </select>
          </div>

          {/* Symbol */}
          <div>
            <label className="block text-xs font-medium text-muted uppercase">Symbol / Ticker</label>
            <input
              type="text"
              required
              placeholder="e.g. RELIANCE, NVDA, BTC, NIFTYBEES"
              value={ticker}
              onChange={(e) => handleTickerChange(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg uppercase font-mono outline-none focus:border-primary"
            />
            {/* Quick Pick Pills from Universe */}
            <div className="mt-1.5 flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {constituents.slice(0, 10).map((c) => (
                <button
                  key={c.ticker}
                  type="button"
                  onClick={() => {
                    setTicker(c.ticker);
                    setName(c.name);
                  }}
                  className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted hover:text-fg hover:bg-border transition-colors font-mono"
                >
                  {c.ticker}
                </button>
              ))}
            </div>
          </div>

          {/* Asset Name */}
          <div>
            <label className="block text-xs font-medium text-muted uppercase">Asset Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
            />
          </div>

          {/* Shares & Buy Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase">Shares / Units</label>
              <input
                type="number"
                step="any"
                required
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg num outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase">
                Avg Buy Price ({MARKETS[market].currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                required
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg num outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Buy Date & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase">Purchase Date</label>
              <input
                type="date"
                value={buyDate}
                onChange={(e) => setBuyDate(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase">Notes / Thesis</label>
              <input
                type="text"
                placeholder="e.g. Core long-term holding"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-bg px-3.5 py-2 text-xs font-medium text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-fg hover:opacity-90"
            >
              {holding ? 'Update Position' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
