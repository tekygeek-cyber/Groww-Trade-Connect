import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Scale,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  RotateCcw,
  Sliders,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Clock,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  DollarSign,
  Activity,
  History,
  Check,
} from 'lucide-react';
import type { Candle, MarketType } from '../types/market';
import { deriveCompletedDailyTrend, type CompletedDailyTrend } from '../lib/market-integrity';
import type { PortfolioHolding } from '../types/portfolio';
import type {
  TargetAllocation,
  ScoreBreakdown,
  RebalancePlanProposal,
  ProposedRebalanceOrder,
  AuditSnapshot,
  RebalancePreset,
  AuditTriggerType,
} from '../types/rebalance';
import {
  calculatePortfolioScore,
  generatePresetTargets,
  adjustSliderTargets,
  planRebalanceOrders,
  reconcilePaperFills,
  createAuditSnapshot,
  DEFAULT_CASH_FLOOR_PCT,
  DRIFT_TOLERANCE_PCT,
  REBALANCE_RULE_VERSION,
  type MarketQuoteInfo,
} from '../lib/rebalance-engine';
import { usePortfolio } from '../lib/portfolio-context';
import { useMarketQuotes } from '../lib/quotes-context';
import { MARKETS } from '../data/universes';

const AUDIT_STORAGE_KEY = 'groww_rebalance_audit_snapshots_v2';

function canExecutePaperPlan(plan: RebalancePlanProposal): boolean {
  return plan.orders.length > 0 &&
    (plan.feasibility === 'FEASIBLE' || plan.feasibility === 'PARTIAL_FEASIBLE');
}


export function PortfolioRebalancePanel({
  initialMarket,
  selectedCurrency,
  formatCurrency,
}: {
  initialMarket: MarketType;
  selectedCurrency: 'INR' | 'USD' | 'USDT';
  formatCurrency: (amountINR: number) => string;
}) {
  const { holdings, cashReserve, setCashReserve, importHoldings } = usePortfolio();
  const { getQuote, market: globalMarket, sample } = useMarketQuotes();

  const [activeMarket, setActiveMarket] = useState<MarketType>(initialMarket);
  const executedProposals = useRef(new Set<string>());
  const [activePreset, setActivePreset] = useState<RebalancePreset>('equal_weight');
  const [targetCashPct, setTargetCashPct] = useState<number>(DEFAULT_CASH_FLOOR_PCT);
  const [targets, setTargets] = useState<TargetAllocation[]>([]);
  const [executionBanner, setExecutionBanner] = useState<{
    batchId: string;
    tradeCount: number;
    timestamp: number;
  } | null>(null);

  // Audit history stored in localStorage
  const [auditHistory, setAuditHistory] = useState<AuditSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditHistory.slice(0, 30)));
    } catch {}
  }, [auditHistory]);

  // Technical factors are computed from provider-sourced completed daily bars,
  // never from same-day percentage changes or simulated prices.
  const [dailyTrends, setDailyTrends] = useState<Record<string, CompletedDailyTrend>>({});
  const scopedSymbols = useMemo(() => {
    const symbols = new Set<string>([
      ...holdings.filter(h => h.market === activeMarket).map(h => h.ticker),
      ...targets.filter(t => t.market === activeMarket).map(t => t.ticker),
    ]);
    return [...symbols].sort().join(',');
  }, [holdings, targets, activeMarket]);

  useEffect(() => {
    const controller = new AbortController();
    setDailyTrends({});
    if (sample || activeMarket !== globalMarket) return () => controller.abort();
    const symbols = scopedSymbols.split(',').filter(Boolean).slice(0, 12);
    if (!symbols.length) return () => controller.abort();

    Promise.all(symbols.map(async ticker => {
      try {
        const response = await fetch(
          `/api/candles/${activeMarket}/${encodeURIComponent(ticker)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) return null;
        const body: { candles?: Candle[]; source?: string } = await response.json();
        const trend = deriveCompletedDailyTrend(
          body.candles || [], body.source || '', new Date(), activeMarket
        );
        return trend ? { ticker, trend } : null;
      } catch {
        return null; // Missing provider data yields N/A, never a synthesized score.
      }
    })).then(results => {
      if (controller.signal.aborted) return;
      const next: Record<string, CompletedDailyTrend> = {};
      for (const item of results) if (item) next[item.ticker] = item.trend;
      setDailyTrends(next);
    });
    return () => controller.abort();
  }, [activeMarket, globalMarket, sample, scopedSymbols]);

  // Construct quote map for holdings & targets
  const quotesMap = useMemo(() => {
    const map: Record<string, MarketQuoteInfo> = {};
    const relevantTickers = new Set([
      ...holdings.map((h) => h.ticker),
      ...targets.map((t) => t.ticker),
    ]);

    for (const ticker of Array.from(relevantTickers)) {
      const q = getQuote(ticker);
      if (q) {
        map[ticker] = {
          price: q.price,
          change: q.change,
          changePct: q.changePct,
          timestamp: q.timestamp,
          status: q.status,
          source: q.source,
          ...dailyTrends[ticker],
        };
      }
    }
    return map;
  }, [holdings, targets, getQuote, dailyTrends]);

  // Initialize or update targets when active market or preset changes
  useEffect(() => {
    if (activePreset === 'custom') return; // Preserve edited slider targets.
    const newTargets = generatePresetTargets(
      holdings,
      activeMarket,
      activePreset,
      quotesMap,
      targetCashPct
    );
    setTargets(newTargets);
  }, [activeMarket, activePreset, targetCashPct]);

  // Compute rebalance proposal
  const proposal: RebalancePlanProposal = useMemo(() => {
    return planRebalanceOrders(
      holdings,
      targets,
      quotesMap,
      cashReserve,
      activeMarket,
      targetCashPct
    );
  }, [holdings, targets, quotesMap, cashReserve, activeMarket, targetCashPct]);

  // Handle slider adjustment
  function handleSliderChange(ticker: string, newWeight: number) {
    setActivePreset('custom');
    const updated = adjustSliderTargets(targets, ticker, newWeight, targetCashPct);
    setTargets(updated);
  }

  // Toggle lock on an asset
  function toggleLock(ticker: string) {
    setTargets((prev) =>
      prev.map((t) => (t.ticker === ticker ? { ...t, isLocked: !t.isLocked } : t))
    );
  }

  // Reset to current preset
  function handleResetPreset() {
    const preset = activePreset === 'custom' ? 'equal_weight' : activePreset;
    setActivePreset(preset);
    const reset = generatePresetTargets(
      holdings,
      activeMarket,
      preset,
      quotesMap,
      targetCashPct
    );
    setTargets(reset);
  }

  // Execute paper rebalance batch
  function handleExecuteBatch() {
    if (!canExecutePaperPlan(proposal) || executedProposals.current.has(proposal.id)) return;

    const { updatedHoldings, updatedCash, batchExecution } = reconcilePaperFills(
      holdings,
      cashReserve,
      proposal.orders,
      proposal.requiredCashFloor
    );
    executedProposals.current.add(proposal.id);

    // Update global portfolio context (two independent state updates)
    importHoldings(updatedHoldings);
    setCashReserve(updatedCash);

    // Calculate post-rebalance reconciled score
    const newScore = calculatePortfolioScore(
      updatedHoldings.filter((h) => h.market === activeMarket),
      targets,
      quotesMap,
      updatedCash,
      activeMarket,
      targetCashPct
    );

    // Create audit snapshot
    const snapshot = createAuditSnapshot(
      newScore,
      activeMarket,
      proposal.projectedNavAfterCosts,
      updatedHoldings.length,
      'POST_REBALANCE_RECONCILED',
      false,
      `Executed Batch ${batchExecution.batchId} with ${batchExecution.filledOrders} orders.`
    );

    setAuditHistory((prev) => [snapshot, ...prev]);
    setExecutionBanner({
      batchId: batchExecution.batchId,
      tradeCount: batchExecution.filledOrders,
      timestamp: Date.now(),
    });

    // Auto-dismiss execution banner after 8 seconds
    setTimeout(() => {
      setExecutionBanner(null);
    }, 8000);
  }

  // Trigger manual score audit or simulated Friday/Monday review
  function triggerAudit(triggerType: AuditTriggerType, isSimulated: boolean = false) {
    const currentScore = proposal.currentScore;
    const snapshot = createAuditSnapshot(
      currentScore,
      activeMarket,
      proposal.currentNav,
      holdings.filter((h) => h.market === activeMarket).length,
      triggerType,
      isSimulated
    );
    setAuditHistory((prev) => [snapshot, ...prev]);
  }

  const mktConfig = MARKETS[activeMarket];
  const marketHoldings = holdings.filter((h) => h.market === activeMarket);

  return (
    <div className="space-y-6">
      {/* Top Banner / Environment Alert */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Scale className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-fg">Portfolio Rebalance & Multi-Factor Alignment</h2>
              <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-mono text-muted border border-border">
                {REBALANCE_RULE_VERSION}
              </span>
            </div>
            <p className="text-xs text-muted">
              Deterministic allocation modeling, 40/35/25 multi-factor scoring, and paper execution reconciliation.
            </p>
          </div>
        </div>

        {/* Market Selector for Rebalancing */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Active Scope:</span>
          <select
            value={activeMarket}
            onChange={(e) => setActiveMarket(e.target.value as MarketType)}
            className="h-8 rounded-lg border border-border bg-bg px-2.5 text-xs font-semibold text-fg outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="nifty">Nifty 100 (NSE)</option>
            <option value="crypto">Crypto Majors (Kraken)</option>
            <option value="nasdaq">NASDAQ-100 (eToro)</option>
            <option value="etfs">Liquid ETFs (Multi-Market)</option>
          </select>
        </div>
      </div>

      {/* Execution Confirmation Toast Banner */}
      {executionBanner && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <span>
              <strong>Batch {executionBanner.batchId} Reconciled:</strong> Successfully filled{' '}
              {executionBanner.tradeCount} orders. Portfolio holdings and cash reserve updated.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExecutionBanner(null)}
            className="text-emerald-400/80 hover:text-emerald-400 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary 4-Stat Grid: NAV, Cash, Drift D, Eligible non-cash */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Scope Portfolio NAV</p>
          <p className="num mt-2 text-2xl font-bold text-fg">
            {proposal.feasibility === 'INFEASIBLE_CONSTRAINTS' ? 'N/A' : formatCurrency(proposal.currentNav)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>Invested: {formatCurrency(proposal.currentNav - proposal.currentCash)}</span>
            <span className="num">Cash: {proposal.currentScore.cashWeight.toFixed(1)}%</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Available Cash Reserve</p>
          <p className="num mt-2 text-2xl font-bold text-fg">
            {proposal.feasibility === 'INFEASIBLE_CONSTRAINTS' ? 'N/A' : formatCurrency(proposal.currentCash)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>Policy Floor ({targetCashPct}%):</span>
            <span className="num font-medium text-fg">{formatCurrency(proposal.requiredCashFloor)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Total Allocation Drift (D)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={
                'num text-2xl font-bold ' +
                (proposal.currentScore.unroundedDriftD > 0.25
                  ? 'text-amber-400'
                  : proposal.currentScore.unroundedDriftD > 0.1
                  ? 'text-fg'
                  : 'text-emerald-400')
              }
            >
              {(proposal.currentScore.unroundedDriftD * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-muted">
              (Residual post-trade: {(proposal.residualDrift * 100).toFixed(1)}%)
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {proposal.currentScore.unroundedDriftD === 0
              ? 'Portfolio is perfectly aligned to model targets'
              : 'Cumulative reallocation required across assets'}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Feasibility Status</p>
          <div className="mt-2 flex items-center gap-1.5">
            {proposal.feasibility === 'FEASIBLE' ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-sm">
                <CheckCircle2 className="size-4" /> Ready to Execute
              </span>
            ) : proposal.feasibility === 'PARTIAL_FEASIBLE' ? (
              <span className="inline-flex items-center gap-1 text-amber-400 font-semibold text-sm">
                <Info className="size-4" /> Partial Feasible
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-sm">
                <AlertTriangle className="size-4" /> Cash Floor Invariant
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted truncate" title={proposal.feasibilityMessage}>
            {proposal.feasibilityMessage}
          </p>
        </div>
      </div>

      {/* Target Allocation Strategy & Interactive Sliders */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-base font-semibold text-fg">Target Allocation Model</h3>
            <p className="mt-0.5 text-xs text-muted">
              Equal Weight and custom allocations are available. Market Cap and Momentum require verified inputs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-bg p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActivePreset('equal_weight')}
                className={
                  'rounded px-3 py-1 transition-colors ' +
                  (activePreset === 'equal_weight'
                    ? 'bg-primary text-primary-fg font-semibold'
                    : 'text-muted hover:text-fg')
                }
              >
                Equal Weight
              </button>
              <button
                type="button"
                disabled
                title="Unavailable until verified constituent market capitalizations are integrated"
                className="rounded px-3 py-1 text-muted/50 cursor-not-allowed"
              >
                Market Cap
              </button>
              <button
                type="button"
                disabled
                title="Unavailable until validated momentum windows and lookback datasets are integrated"
                className="rounded px-3 py-1 text-muted/50 cursor-not-allowed"
              >
                Momentum / Alpha Tilt
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetPreset}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:text-fg transition-colors"
              title="Reset locked sliders back to model preset"
            >
              <RotateCcw className="size-3" />
              Reset Sliders
            </button>
          </div>
        </div>

        {/* Target Cash Floor Control */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-2/60 p-3 text-xs">
          <div className="flex items-center gap-2">
            <DollarSign className="size-4 text-primary" />
            <div>
              <span className="font-semibold text-fg">Target Cash Reserve Floor: </span>
              <span className="num font-bold text-primary">{targetCashPct.toFixed(1)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="2"
              max="25"
              step="0.5"
              value={targetCashPct}
              onChange={(e) => setTargetCashPct(parseFloat(e.target.value))}
              className="h-1.5 w-36 accent-primary"
            />
            <span className="text-muted">Risky Allocation Budget: {(100 - targetCashPct).toFixed(1)}%</span>
          </div>
        </div>

        {/* Interactive Asset Sliders Grid */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {targets.map((t) => {
            const holding = marketHoldings.find((h) => h.ticker === t.ticker);
            const currentWeightPct = proposal.currentNav > 0 && holding
              ? ((holding.shares * (quotesMap[t.ticker]?.price || holding.averageBuyPrice)) / proposal.currentNav) * 100
              : 0;
            const drift = currentWeightPct - t.targetWeightPct;

            return (
              <div
                key={t.ticker}
                className={`rounded-lg border p-3 transition-colors ${
                  t.isLocked ? 'border-primary/50 bg-primary/5' : 'border-border bg-bg/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-fg">{t.ticker}</span>
                    <button
                      type="button"
                      onClick={() => toggleLock(t.ticker)}
                      className="text-muted hover:text-fg"
                      title={t.isLocked ? 'Target is locked/pinned' : 'Click to lock/pin target weight'}
                    >
                      {t.isLocked ? (
                        <Lock className="size-3 text-primary" />
                      ) : (
                        <Unlock className="size-3 text-muted/60" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted">Cur: {currentWeightPct.toFixed(1)}%</span>
                    <span className="font-mono text-xs font-bold text-fg">
                      {t.targetWeightPct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={100 - targetCashPct}
                    step="0.5"
                    value={t.targetWeightPct}
                    onChange={(e) => handleSliderChange(t.ticker, parseFloat(e.target.value))}
                    className="h-1.5 w-full accent-primary"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                  <span className="truncate max-w-[130px]">{t.name}</span>
                  <span
                    className={
                      'font-mono ' +
                      (drift > 0.5
                        ? 'text-amber-400'
                        : drift < -0.5
                        ? 'text-blue-400'
                        : 'text-emerald-400')
                    }
                  >
                    {drift > 0 ? `+${drift.toFixed(1)}% overweight` : drift < 0 ? `${drift.toFixed(1)}% underweight` : 'Aligned'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dual Allocation Comparison Visualizer Bar */}
        <div className="mt-6 space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Current Asset Distribution</span>
            <span>Target Model Distribution (100.0%)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Current Allocation Bar */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted font-medium">Actual Holdings Breakdown:</span>
              <div className="flex h-3 w-full overflow-hidden rounded bg-surface-2">
                {targets.map((t, idx) => {
                  const holding = marketHoldings.find((h) => h.ticker === t.ticker);
                  const curW = proposal.currentNav > 0 && holding
                    ? ((holding.shares * (quotesMap[t.ticker]?.price || holding.averageBuyPrice)) / proposal.currentNav) * 100
                    : 0;
                  const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500'];
                  return (
                    <div
                      key={t.ticker}
                      style={{ width: `${curW}%` }}
                      className={`${colors[idx % colors.length]} transition-all`}
                      title={`${t.ticker}: ${curW.toFixed(1)}%`}
                    />
                  );
                })}
                <div
                  style={{ width: `${proposal.currentScore.cashWeight}%` }}
                  className="bg-zinc-600 transition-all"
                  title={`Cash: ${proposal.currentScore.cashWeight.toFixed(1)}%`}
                />
              </div>
            </div>

            {/* Target Allocation Bar */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted font-medium">Target Model Weights:</span>
              <div className="flex h-3 w-full overflow-hidden rounded bg-surface-2">
                {targets.map((t, idx) => {
                  const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500'];
                  return (
                    <div
                      key={t.ticker}
                      style={{ width: `${t.targetWeightPct}%` }}
                      className={`${colors[idx % colors.length]} transition-all`}
                      title={`${t.ticker}: ${t.targetWeightPct.toFixed(1)}%`}
                    />
                  );
                })}
                <div
                  style={{ width: `${targetCashPct}%` }}
                  className="bg-zinc-600 transition-all"
                  title={`Target Cash: ${targetCashPct.toFixed(1)}%`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Factor Scoreboard (40% Drift, 35% Technical, 25% Diversification) */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-fg">Portfolio Core Values Score (v3.0)</h3>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                Multi-Factor Matrix
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Composite index combining allocation adherence (40%), completed-bar SMA trend alignment (35%), and HHI concentration (25%).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-muted block">Current Composite</span>
              <span className="num text-2xl font-bold text-fg">
                {proposal.currentScore.compositeScore !== null
                  ? `${proposal.currentScore.compositeScore.toFixed(1)} / 100`
                  : 'N/A'}
              </span>
            </div>
            {proposal.projectedScore?.compositeScore !== null && (
              <div className="text-right border-l border-border pl-3">
                <span className="text-xs text-muted block">Projected Post-Trade</span>
                <span
                  className={
                    'num text-2xl font-bold ' +
                    ((proposal.projectedScore?.compositeScore || 0) >= (proposal.currentScore.compositeScore || 0)
                      ? 'text-emerald-400'
                      : 'text-amber-400')
                  }
                >
                  {proposal.projectedScore?.compositeScore?.toFixed(1)} / 100
                </span>
              </div>
            )}
          </div>
        </div>

        {proposal.currentScore.unavailableReasons.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400" role="status">
            Incomplete score: {proposal.currentScore.unavailableReasons.slice(0, 3).join('; ')}
          </div>
        )}
        {/* 3 Factor Breakdown Cards */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {/* Factor 1: Allocation Score */}
          <div className="rounded-lg border border-border bg-bg/60 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg">01. Allocation Drift</span>
              <span className="text-muted">40% Weight</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-xl font-bold text-fg">
                {proposal.currentScore.allocationScore !== null
                  ? proposal.currentScore.allocationScore.toFixed(1)
                  : 'N/A'}
              </span>
              <span className="text-xs text-muted">/ 100</span>
              {proposal.projectedScore?.allocationScore !== null && (
                <span className="text-xs text-emerald-400 font-mono ml-auto">
                  → {proposal.projectedScore?.allocationScore?.toFixed(1)}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Formula: 100 × (1 − D). Unrounded D = {proposal.currentScore.unroundedDriftD.toFixed(3)}.
            </p>
          </div>

          {/* Factor 2: Technical Signal Alignment */}
          <div className="rounded-lg border border-border bg-bg/60 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg">02. Signal Alignment</span>
              <span className="text-muted">35% Weight</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-xl font-bold text-fg">
                {proposal.currentScore.technicalScore !== null
                  ? proposal.currentScore.technicalScore.toFixed(1)
                  : 'N/A'}
              </span>
              <span className="text-xs text-muted">/ 100</span>
              {proposal.projectedScore?.technicalScore !== null && (
                <span className="text-xs text-muted font-mono ml-auto">
                  → {proposal.projectedScore?.technicalScore?.toFixed(1)}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              SMA 20/50 trend state on completed daily bars. Bullish=1.0, Neutral=0.5, Bearish=0.0.
            </p>
          </div>

          {/* Factor 3: HHI Diversification */}
          <div className="rounded-lg border border-border bg-bg/60 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg">03. Diversification (HHI)</span>
              <span className="text-muted">25% Weight</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-xl font-bold text-fg">
                {proposal.currentScore.diversificationScore !== null
                  ? proposal.currentScore.diversificationScore.toFixed(1)
                  : 'N/A'}
              </span>
              <span className="text-xs text-muted">/ 100</span>
              {proposal.projectedScore?.diversificationScore !== null && (
                <span className="text-xs text-muted font-mono ml-auto">
                  → {proposal.projectedScore?.diversificationScore?.toFixed(1)}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              HHI: {proposal.currentScore.hhi} across {proposal.currentScore.eligibleRiskyCount} assets. Concentrated targets can lower this factor.
            </p>
          </div>
        </div>
      </div>

      {/* Suggested Rebalance Trades Review Table */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-base font-semibold text-fg">Suggested Rebalance Orders</h3>
            <p className="mt-0.5 text-xs text-muted">
              Sells executed first at bid, followed by buys at ask while strictly preserving the {targetCashPct}% cash floor.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <span className="text-muted">Gross Sells: </span>
              <span className="num font-semibold text-rose-400">
                {formatCurrency(proposal.grossSalesProceeds)}
              </span>
              <span className="text-muted mx-1.5">|</span>
              <span className="text-muted">Gross Buys: </span>
              <span className="num font-semibold text-emerald-400">
                {formatCurrency(proposal.grossBuyExpenditure)}
              </span>
              <span className="text-muted mx-1.5">|</span>
              <span className="text-muted">Est. Fees: </span>
              <span className="num font-medium text-muted">
                {formatCurrency(proposal.totalEstimatedFees)}
              </span>
            </div>

            <button
              type="button"
              disabled={!canExecutePaperPlan(proposal)}
              onClick={handleExecuteBatch}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition-colors ${
                !canExecutePaperPlan(proposal)
                  ? 'border border-border bg-surface-2 text-muted cursor-not-allowed'
                  : 'bg-primary text-primary-fg hover:opacity-90 active:scale-95'
              }`}
            >
              <Play className="size-3.5 fill-current" />
              Authorize & Execute Paper Batch ({proposal.orders.length} Orders)
            </button>
          </div>
        </div>

        {proposal.orders.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">
            <CheckCircle2 className="size-6 text-emerald-400 mx-auto mb-2" />
            <p className="font-semibold text-fg">Portfolio In Alignment</p>
            <p className="mt-1">
              {proposal.feasibility === 'INFEASIBLE_CONSTRAINTS' ? proposal.feasibilityMessage
                : `No orders proposed; drift may be within ${DRIFT_TOLERANCE_PCT}% tolerance or constrained by lot sizing.`}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <th className="py-2.5 px-3">Asset</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3 text-right">Current Shares</th>
                  <th className="py-2.5 px-3 text-right">Target Shares</th>
                  <th className="py-2.5 px-3 text-right">Trade Qty</th>
                  <th className="py-2.5 px-3 text-right">Execution Price</th>
                  <th className="py-2.5 px-3 text-right">Order Notional</th>
                  <th className="py-2.5 px-3 text-right">Est. Fee</th>
                  <th className="py-2.5 px-3 text-right">Drift Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {proposal.orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans">
                      <span className="font-bold text-fg">{ord.ticker}</span>
                      <span className="block text-[11px] text-muted truncate max-w-[120px] font-sans">
                        {ord.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span
                        className={
                          'inline-flex items-center gap-1 font-semibold rounded px-2 py-0.5 text-[11px] ' +
                          (ord.side === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20')
                        }
                      >
                        {ord.side === 'BUY' ? 'BUY (Underweight)' : 'SELL (Overweight)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted">{ord.currentShares}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-fg">{ord.targetShares}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-fg">
                      {ord.side === 'BUY' ? `+${ord.quantityDelta}` : `-${ord.quantityDelta}`}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted">
                      {formatCurrency(ord.executionPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-fg">
                      {formatCurrency(ord.orderNotional)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted">
                      {formatCurrency(ord.estimatedFee)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={ord.driftPct > 0 ? 'text-amber-400' : 'text-blue-400'}>
                        {ord.driftPct > 0 ? `+${ord.driftPct.toFixed(1)}%` : `${ord.driftPct.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Friday Close / Monday Open Revision Schedule & Audit Trigger */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-base font-semibold text-fg">Audit Testing & Weekly Revision Schedule</h3>
            <p className="mt-0.5 text-xs text-muted">
              Core portfolio values are tested periodically with mandatory revisions during Friday Close and Monday Open.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => triggerAudit('MANUAL_REFRESH', false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors"
            >
              <RefreshCw className="size-3.5" />
              Manual Refresh Score
            </button>
            <button
              type="button"
              onClick={() => triggerAudit('FRIDAY_CLOSE_SIMULATED', true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors"
              title="Simulate Friday Close pre-weekend gap audit"
            >
              <Calendar className="size-3.5 text-amber-400" />
              Simulate Friday Close
            </button>
            <button
              type="button"
              onClick={() => triggerAudit('MONDAY_OPEN_SIMULATED', true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors"
              title="Simulate Monday Open opening-bell reassessment"
            >
              <Clock className="size-3.5 text-blue-400" />
              Simulate Monday Open
            </button>
          </div>
        </div>

        {/* Schedule Timing Information */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-bg/50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg">
              <Calendar className="size-4 text-amber-400" />
              <span>Friday Close Audit Window</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {activeMarket === 'nifty'
                ? 'NSE Trading Session Closes Friday at 15:30 IST'
                : activeMarket === 'nasdaq'
                ? 'US Regular Session Closes Friday at 16:00 ET'
                : activeMarket === 'crypto'
                ? 'Weekly Cutover Audit Friday 23:59 UTC'
                : 'ETF Trading Session Closes Friday 16:00 ET'}
            </p>
            <div className="mt-2 text-[11px] text-muted">
              Status: <span className="text-emerald-400 font-semibold">Active Monitoring</span> · Evaluates weekend gap exposure
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg/50 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg">
              <Clock className="size-4 text-blue-400" />
              <span>Monday Open Audit Window</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {activeMarket === 'nifty'
                ? 'NSE Opening Bell Monday at 09:15 IST'
                : activeMarket === 'nasdaq'
                ? 'US Opening Bell Monday at 09:30 ET'
                : activeMarket === 'crypto'
                ? 'Weekly Opening Reassessment Monday 00:00 UTC'
                : 'ETF Session Opens Monday 09:30 ET'}
            </p>
            <div className="mt-2 text-[11px] text-muted">
              Status: <span className="text-emerald-400 font-semibold">Active Monitoring</span> · Validates opening trend realignment
            </div>
          </div>
        </div>

        {/* Audit Snapshots Table */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted mb-2">
            <span className="flex items-center gap-1.5">
              <History className="size-3.5" />
              Audit Snapshot Log ({auditHistory.length} Recorded Runs)
            </span>
            {auditHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setAuditHistory([])}
                className="text-muted hover:text-fg font-normal"
              >
                Clear History
              </button>
            )}
          </div>

          {auditHistory.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">
              No audit snapshots recorded yet. Use the buttons above or execute a rebalance batch to record the first snapshot.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted uppercase">
                    <th className="py-2 px-2.5 font-sans">Timestamp</th>
                    <th className="py-2 px-2.5 font-sans">Trigger</th>
                    <th className="py-2 px-2.5 text-right font-sans">Composite</th>
                    <th className="py-2 px-2.5 text-right font-sans">Allocation</th>
                    <th className="py-2 px-2.5 text-right font-sans">Technical</th>
                    <th className="py-2 px-2.5 text-right font-sans">Diversification</th>
                    <th className="py-2 px-2.5 text-right font-sans">Drift (D)</th>
                    <th className="py-2 px-2.5 font-sans">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditHistory.slice(0, 10).map((snap) => (
                    <tr key={snap.id} className="hover:bg-surface-2/30">
                      <td className="py-1.5 px-2.5 text-muted text-[11px]">
                        {new Date(snap.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-1.5 px-2.5 font-sans">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg">
                          {snap.trigger.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-bold text-fg">
                        {snap.score.compositeScore !== null ? snap.score.compositeScore.toFixed(1) : 'N/A'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-muted">
                        {snap.score.allocationScore !== null ? snap.score.allocationScore.toFixed(1) : 'N/A'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-muted">
                        {snap.score.technicalScore !== null ? snap.score.technicalScore.toFixed(1) : 'N/A'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-muted">
                        {snap.score.diversificationScore !== null ? snap.score.diversificationScore.toFixed(1) : 'N/A'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right text-muted">
                        {(snap.score.unroundedDriftD * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2.5 font-sans text-muted truncate max-w-[180px] text-[11px]" title={snap.notes}>
                        {snap.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
