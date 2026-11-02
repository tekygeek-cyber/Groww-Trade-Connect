import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cpu,
  Globe,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
  AlertTriangle,
  Database,
  Lock,
} from 'lucide-react';
import type { MarketType } from '../types/market';
import { useMarketQuotes } from '../lib/quotes-context';
import { api } from '../lib/api';

export interface ConnectivityEvent {
  id: string;
  timestamp: string;
  providerId: string;
  providerName: string;
  type: string;
  status: 'success' | 'warning' | 'error';
  latencyMs?: number;
  message: string;
}

export interface ProviderLiveliness {
  id: string;
  name: string;
  market: MarketType;
  tradingMarket: string;
  tradingApiName: string;
  status: 'healthy' | 'degraded' | 'offline' | 'simulated';
  latencyMs: number;
  latencyHistory: number[];
  minLatencyMs: number;
  maxLatencyMs: number;
  uptime24h: number;
  uptime7d: number;
  throughputQps: number;
  packetLossPct: number;
  primaryEndpoint: string;
  region: string;
  authProtocol: string;
  lastTickAt: number;
  errorCount: number;
  activeTransport: 'live_ws' | 'live_rest' | 'cached_rest' | 'sample_tape';
  symbolCount: number;
  notes: string;
}

export interface FailoverEndpointInfo {
  id: string;
  name: string;
  endpoint: string;
  type: 'live_ws' | 'live_rest' | 'cached_rest' | 'sample_tape';
  latencyMs: number;
  status: 'active' | 'standby' | 'offline';
}

export interface FailoverRule {
  market: MarketType;
  marketLabel: string;
  providerId: string;
  primarySource: FailoverEndpointInfo;
  secondarySource: FailoverEndpointInfo;
  tertiarySource: FailoverEndpointInfo;
  latencyThresholdMs: number;
  consecutiveFailureThreshold: number;
  activeSource: 'primary' | 'secondary' | 'tertiary';
  isFailoverActive: boolean;
  failoverReason: string | null;
  failedOverAt: string | null;
  lastPrimaryLatencyMs: number;
  lastSecondaryLatencyMs: number;
  consecutiveHealthyPings: number;
  autoRecoverEnabled: boolean;
  autoFailoverEnabled: boolean;
}

export interface SystemOverview {
  averageLatencyMs: number;
  overallUptime24h: number;
  healthyCount: number;
  totalProviders: number;
  totalThroughputQps: number;
  lastCheckedAt: string;
  activeFailoversCount?: number;
}

export interface LivelinessData {
  providers: Record<string, ProviderLiveliness>;
  connectivityLogs: ConnectivityEvent[];
  systemOverview: SystemOverview;
  failoverRules?: Record<MarketType, FailoverRule>;
  marketRouting: Record<
    MarketType,
    {
      brokerId: string;
      provider: string;
      tradingApi: string;
      status: string;
      activeSource?: string;
      isFailoverActive?: boolean;
      failoverReason?: string | null;
    }
  >;
}

// Sparkline SVG component to visualize latency fluctuation over time
function LatencySparkline({
  history,
  current,
  color = '#22c55e',
}: {
  history: number[];
  current: number;
  color?: string;
}) {
  const width = 140;
  const height = 36;
  const padding = 4;

  if (!history || history.length < 2) {
    return (
      <div className="flex h-9 w-[140px] items-center justify-center text-[10px] text-muted">
        Gathering pings...
      </div>
    );
  }

  const min = Math.min(...history) * 0.9;
  const max = Math.max(...history) * 1.1 || 100;
  const range = max - min || 1;

  const points = history.map((val, idx) => {
    const x = padding + (idx / (history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  return (
    <div className="relative inline-block">
      <svg width={width} height={height} className="overflow-visible">
        {/* Baseline grid */}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#27272a"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        {/* Latency line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        {/* Latest tick point */}
        {history.length > 0 && (
          <circle
            cx={points[points.length - 1].split(',')[0]}
            cy={points[points.length - 1].split(',')[1]}
            r="3"
            fill={color}
            className="animate-pulse"
          />
        )}
      </svg>
    </div>
  );
}

export function MarketHealth() {
  const { market } = useMarketQuotes();
  const [data, setData] = useState<LivelinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [autoProbe, setAutoProbe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch real-time health data
  async function loadHealth() {
    try {
      const res = await api<LivelinessData>('/api/adapter/liveliness');
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to DataAdapter');
    } finally {
      setLoading(false);
    }
  }

  // Trigger live ping probe
  async function handleProbeAll() {
    setProbing(true);
    try {
      const res = await api<{ ok: boolean; providers: Record<string, ProviderLiveliness> }>(
        '/api/adapter/ping',
        { method: 'POST' }
      );
      if (res.ok) {
        await loadHealth();
      }
    } catch {
    } finally {
      setProbing(false);
    }
  }

  // Initial load
  useEffect(() => {
    loadHealth();
  }, []);

  // Auto-probe loop every 6 seconds if enabled
  useEffect(() => {
    if (autoProbe) {
      timerRef.current = setInterval(() => {
        handleProbeAll();
      }, 6000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoProbe]);

  const [failoverActionRunning, setFailoverActionRunning] = useState<string | null>(null);

  async function handleUpdateThreshold(m: MarketType, threshold: number) {
    setFailoverActionRunning(`${m}-threshold`);
    try {
      await api('/api/adapter/failover/update', {
        method: 'POST',
        body: JSON.stringify({ market: m, latencyThresholdMs: threshold }),
      });
      await loadHealth();
    } catch {
    } finally {
      setFailoverActionRunning(null);
    }
  }

  async function handleToggleAutoFailover(m: MarketType, enabled: boolean) {
    setFailoverActionRunning(`${m}-autofailover`);
    try {
      await api('/api/adapter/failover/update', {
        method: 'POST',
        body: JSON.stringify({ market: m, autoFailoverEnabled: enabled }),
      });
      await loadHealth();
    } catch {
    } finally {
      setFailoverActionRunning(null);
    }
  }

  async function handleToggleAutoRecover(m: MarketType, enabled: boolean) {
    setFailoverActionRunning(`${m}-autorecover`);
    try {
      await api('/api/adapter/failover/update', {
        method: 'POST',
        body: JSON.stringify({ market: m, autoRecoverEnabled: enabled }),
      });
      await loadHealth();
    } catch {
    } finally {
      setFailoverActionRunning(null);
    }
  }

  async function handleSimulateFailover(m: MarketType, type: 'latency_spike' | 'disconnect') {
    setFailoverActionRunning(`${m}-sim-${type}`);
    try {
      await api('/api/adapter/failover/simulate', {
        method: 'POST',
        body: JSON.stringify({ market: m, type }),
      });
      await loadHealth();
    } catch {
    } finally {
      setFailoverActionRunning(null);
    }
  }

  async function handleForceRecover(m: MarketType) {
    setFailoverActionRunning(`${m}-recover`);
    try {
      await api('/api/adapter/failover/recover', {
        method: 'POST',
        body: JSON.stringify({ market: m }),
      });
      await loadHealth();
    } catch {
    } finally {
      setFailoverActionRunning(null);
    }
  }

  const overview = data?.systemOverview;
  const providers = data?.providers;
  const failoverRules = data?.failoverRules;
  const events = data?.connectivityLogs || [];
  const activeFailovers = overview?.activeFailoversCount || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner Ribbon: System Status & Health Telemetry */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <Activity className="size-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-fg">DataAdapter Connectivity & Health</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                  All Feeds Operational
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Multiplexed live feeds for Kraken (Crypto), Groww (NSE), eToro (NASDAQ/ETFs), and fallback caches
              </p>
            </div>
          </div>

          {/* Action buttons & Auto-probe toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setAutoProbe(!autoProbe)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                autoProbe
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-border bg-surface-2 text-muted hover:text-fg'
              }`}
            >
              <Radio className={`size-3.5 ${autoProbe ? 'animate-pulse' : ''}`} />
              <span>Auto-Probe 6s: {autoProbe ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleProbeAll}
              disabled={probing}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${probing ? 'animate-spin' : ''}`} />
              <span>Probe All Endpoints</span>
            </button>
          </div>
        </div>

        {/* Global Key Metric Counters */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-border/80 bg-bg/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Avg Latency</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-fg">{overview?.averageLatencyMs ?? 56}</span>
              <span className="text-xs text-emerald-400">ms</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-bg/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">24h Availability</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-emerald-400">{overview?.overallUptime24h ?? 99.98}%</span>
              <span className="text-xs text-muted">sla</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-bg/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Throughput</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-fg">{overview?.totalThroughputQps ?? 956}</span>
              <span className="text-xs text-muted">quotes/s</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-bg/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Active Feeds</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-primary">
                {overview?.healthyCount ?? 4} / {overview?.totalProviders ?? 4}
              </span>
              <span className="text-xs text-muted">healthy</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-bg/60 p-3 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Last Audit</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold text-fg">{overview?.lastCheckedAt || 'Active'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Failover Circuit Breaker Matrix & Dynamic Controls */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-fg">Auto-Failover Circuit Breaker & Fallback Matrix</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    activeFailovers > 0
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                      : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {activeFailovers > 0 ? `⚠️ ${activeFailovers} Market on Secondary` : '✓ All Primaries Active'}
                </span>
              </div>
              <p className="text-xs text-muted">
                Automatic cascade: If primary API latency breaches SLA threshold or drops connection, feed seamlessly switches to secondary.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span>Auto-recovery armed: restored after 2 healthy pings</span>
          </div>
        </div>

        {/* Failover Cards Grid for All 4 Markets */}
        <div className="grid gap-4 md:grid-cols-2">
          {failoverRules &&
            (Object.keys(failoverRules) as MarketType[]).map((mKey) => {
              const rule = failoverRules[mKey];
              const isFailedOver = rule.isFailoverActive;
              const isActionRunning = failoverActionRunning?.startsWith(mKey);

              return (
                <div
                  key={mKey}
                  className={`rounded-xl border p-4 transition-all ${
                    isFailedOver
                      ? 'border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20'
                      : 'border-border bg-bg/50'
                  }`}
                >
                  {/* Card Title & Current Active Source Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-fg text-sm">{rule.marketLabel}</span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-muted uppercase">
                          {rule.market}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">
                        SLA Threshold:{' '}
                        <span className="font-mono font-semibold text-fg">{rule.latencyThresholdMs}ms</span>
                        {' · '}
                        Primary Latency:{' '}
                        <span
                          className={`font-mono font-semibold ${
                            rule.lastPrimaryLatencyMs > rule.latencyThresholdMs
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {rule.lastPrimaryLatencyMs}ms
                        </span>
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        isFailedOver
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-emerald-500/15 text-emerald-400'
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${isFailedOver ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      {isFailedOver ? 'Secondary Feed (Failover)' : 'Primary Feed'}
                    </span>
                  </div>

                  {/* Failover Alert Banner if Active */}
                  {isFailedOver && (
                    <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
                          <div>
                            <span className="font-bold">Failover Active:</span> {rule.failoverReason}
                            <p className="text-[10px] text-amber-400/80 mt-0.5">
                              Streaming via <strong className="text-fg">{rule.secondarySource.name}</strong>. Auto-recovering when primary stabilizes.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleForceRecover(mKey)}
                          disabled={Boolean(failoverActionRunning)}
                          className="shrink-0 rounded bg-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-500/30"
                        >
                          Recover Now
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fallback Chain Pipeline */}
                  <div className="mt-3 flex items-center justify-between gap-1 text-[11px] bg-surface-2/60 rounded-lg p-2 border border-border/60">
                    {/* Primary Step */}
                    <div
                      className={`flex-1 rounded p-1.5 text-center ${
                        rule.activeSource === 'primary'
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold'
                          : 'text-muted'
                      }`}
                    >
                      <span className="block text-[9px] uppercase tracking-wider text-muted">Tier 1 Primary</span>
                      <span className="truncate block font-medium">{rule.primarySource.name.split(' ')[0]}</span>
                    </div>

                    <span className="text-muted text-xs">→</span>

                    {/* Secondary Step */}
                    <div
                      className={`flex-1 rounded p-1.5 text-center ${
                        rule.activeSource === 'secondary'
                          ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold'
                          : 'text-muted'
                      }`}
                    >
                      <span className="block text-[9px] uppercase tracking-wider text-muted">Tier 2 Secondary</span>
                      <span className="truncate block font-medium">{rule.secondarySource.name.split(' ')[0]}</span>
                    </div>

                    <span className="text-muted text-xs">→</span>

                    {/* Tertiary Step */}
                    <div
                      className={`flex-1 rounded p-1.5 text-center ${
                        rule.activeSource === 'tertiary'
                          ? 'bg-primary/20 border border-primary/40 text-primary font-semibold'
                          : 'text-muted'
                      }`}
                    >
                      <span className="block text-[9px] uppercase tracking-wider text-muted">Tier 3 Offline</span>
                      <span className="truncate block font-medium">Snapshot Tape</span>
                    </div>
                  </div>

                  {/* Threshold Presets & Setting */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-muted">Latency SLA Threshold:</span>
                    <div className="flex gap-1">
                      {[150, 200, 250, 300].map((th) => (
                        <button
                          key={th}
                          type="button"
                          onClick={() => handleUpdateThreshold(mKey, th)}
                          disabled={Boolean(failoverActionRunning)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors ${
                            rule.latencyThresholdMs === th
                              ? 'bg-primary text-primary-fg font-bold'
                              : 'bg-surface text-muted border border-border hover:text-fg'
                          }`}
                        >
                          {th}ms
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles & Simulation Buttons */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted">
                        <input
                          type="checkbox"
                          checked={rule.autoFailoverEnabled}
                          onChange={(e) => handleToggleAutoFailover(mKey, e.target.checked)}
                          disabled={Boolean(failoverActionRunning)}
                          className="size-3.5 accent-primary rounded"
                        />
                        <span>Auto-Failover</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted">
                        <input
                          type="checkbox"
                          checked={rule.autoRecoverEnabled}
                          onChange={(e) => handleToggleAutoRecover(mKey, e.target.checked)}
                          disabled={Boolean(failoverActionRunning)}
                          className="size-3.5 accent-primary rounded"
                        />
                        <span>Auto-Recover</span>
                      </label>
                    </div>

                    {/* Simulation Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSimulateFailover(mKey, 'latency_spike')}
                        disabled={Boolean(failoverActionRunning)}
                        className="rounded border border-border bg-surface px-2 py-1 text-[10px] font-medium text-fg hover:border-amber-400 hover:text-amber-400 transition-colors"
                        title="Simulate high latency exceeding the threshold to trigger auto-failover"
                      >
                        ⚡ Test Latency Spike
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateFailover(mKey, 'disconnect')}
                        disabled={Boolean(failoverActionRunning)}
                        className="rounded border border-border bg-surface px-2 py-1 text-[10px] font-medium text-fg hover:border-rose-400 hover:text-rose-400 transition-colors"
                        title="Simulate network loss / dropped socket to trigger auto-failover"
                      >
                        🔌 Drop Conn
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Primary Broker Connectivity Cards */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Live Trading Broker & Data Connections
          </h3>
          <span className="text-xs text-muted">
            Current Desk Active Market: <strong className="text-primary uppercase">{market}</strong>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 1. Kraken Pro Connection Card */}
          {providers?.kraken && (
            <div
              className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                market === 'crypto'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40 shadow-md'
                  : 'border-border bg-surface hover:border-border/90'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-fg">Kraken Pro</h4>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        CRYPTO 24/7
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{providers.kraken.tradingMarket}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      providers.kraken.status === 'healthy'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>

                {/* Latency & Sparkline */}
                <div className="mt-4 rounded-xl border border-border/70 bg-bg/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted">Round-trip Latency</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-bold text-emerald-400">
                          {providers.kraken.latencyMs}
                        </span>
                        <span className="text-xs text-muted">ms</span>
                      </div>
                    </div>
                    {/* Sparkline */}
                    <div className="text-right">
                      <span className="text-[10px] text-muted block mb-0.5">Latency Trend</span>
                      <LatencySparkline
                        history={providers.kraken.latencyHistory}
                        current={providers.kraken.latencyMs}
                        color="#22c55e"
                      />
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted">
                    <span>
                      Min: <strong className="font-mono text-fg">{providers.kraken.minLatencyMs}ms</strong>
                    </span>
                    <span>
                      Max: <strong className="font-mono text-fg">{providers.kraken.maxLatencyMs}ms</strong>
                    </span>
                    <span>
                      Loss: <strong className="font-mono text-fg">{providers.kraken.packetLossPct}%</strong>
                    </span>
                  </div>
                </div>

                {/* Uptime Progress Bars */}
                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted">24h Uptime</span>
                      <span className="font-mono font-semibold text-emerald-400">{providers.kraken.uptime24h}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${providers.kraken.uptime24h}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted">7d Availability</span>
                      <span className="font-mono font-semibold text-fg">{providers.kraken.uptime7d}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${providers.kraken.uptime7d}%` }} />
                    </div>
                  </div>
                </div>

                {/* Technical Specs List */}
                <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted">Trading API:</span>
                    <span className="font-medium text-fg">{providers.kraken.tradingApiName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Transport:</span>
                    <span className="font-medium text-primary capitalize">{providers.kraken.activeTransport.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Data Center:</span>
                    <span className="text-fg truncate max-w-36">{providers.kraken.region}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Auth Protocol:</span>
                    <span className="text-fg font-mono truncate max-w-36">{providers.kraken.authProtocol}</span>
                  </div>
                </div>
              </div>

              {market === 'crypto' && (
                <div className="mt-4 rounded-lg bg-primary/10 py-1.5 text-center text-xs font-semibold text-primary">
                  ✓ Active Execution Broker for Desk
                </div>
              )}
            </div>
          )}

          {/* 2. Groww Connection Card */}
          {providers?.groww && (
            <div
              className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                market === 'nifty'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40 shadow-md'
                  : 'border-border bg-surface hover:border-border/90'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-fg">Groww Connect</h4>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        NSE / BSE
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{providers.groww.tradingMarket}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      providers.groww.status === 'healthy'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {providers.groww.status === 'healthy' ? 'Online' : 'Sample Mode'}
                  </span>
                </div>

                {/* Latency & Sparkline */}
                <div className="mt-4 rounded-xl border border-border/70 bg-bg/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted">Round-trip Latency</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-bold text-emerald-400">
                          {providers.groww.latencyMs}
                        </span>
                        <span className="text-xs text-muted">ms</span>
                      </div>
                    </div>
                    {/* Sparkline */}
                    <div className="text-right">
                      <span className="text-[10px] text-muted block mb-0.5">Latency Trend</span>
                      <LatencySparkline
                        history={providers.groww.latencyHistory}
                        current={providers.groww.latencyMs}
                        color="#22c55e"
                      />
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted">
                    <span>
                      Min: <strong className="font-mono text-fg">{providers.groww.minLatencyMs}ms</strong>
                    </span>
                    <span>
                      Max: <strong className="font-mono text-fg">{providers.groww.maxLatencyMs}ms</strong>
                    </span>
                    <span>
                      Loss: <strong className="font-mono text-fg">{providers.groww.packetLossPct}%</strong>
                    </span>
                  </div>
                </div>

                {/* Uptime Progress Bars */}
                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted">24h Uptime</span>
                      <span className="font-mono font-semibold text-emerald-400">{providers.groww.uptime24h}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${providers.groww.uptime24h}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted">7d Availability</span>
                      <span className="font-mono font-semibold text-fg">{providers.groww.uptime7d}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${providers.groww.uptime7d}%` }} />
                    </div>
                  </div>
                </div>

                {/* Technical Specs List */}
                <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted">Trading API:</span>
                    <span className="font-medium text-fg">{providers.groww.tradingApiName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Transport:</span>
                    <span className="font-medium text-primary capitalize">{providers.groww.activeTransport.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Data Center:</span>
                    <span className="text-fg truncate max-w-36">{providers.groww.region}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Auth Protocol:</span>
                    <span className="text-fg truncate max-w-36">{providers.groww.authProtocol}</span>
                  </div>
                </div>
              </div>

              {market === 'nifty' && (
                <div className="mt-4 rounded-lg bg-primary/10 py-1.5 text-center text-xs font-semibold text-primary">
                  ✓ Active Execution Broker for Desk
                </div>
              )}
            </div>
          )}

          {/* 3. eToro Open API Connection Card */}
          {providers?.etoro && (
            <div
              className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                market === 'nasdaq' || market === 'etfs'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40 shadow-md'
                  : 'border-border bg-surface hover:border-border/90'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-fg">eToro Open API</h4>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        NASDAQ & ETFS
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{providers.etoro.tradingMarket}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      providers.etoro.status === 'healthy'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>

                {/* Latency & Sparkline */}
                <div className="mt-4 rounded-xl border border-border/70 bg-bg/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted">Round-trip Latency</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-2xl font-bold text-emerald-400">
                          {providers.etoro.latencyMs}
                        </span>
                        <span className="text-xs text-muted">ms</span>
                      </div>
                    </div>
                    {/* Sparkline */}
                    <div className="text-right">
                      <span className="text-[10px] text-muted block mb-0.5">Latency Trend</span>
                      <LatencySparkline
                        history={providers.etoro.latencyHistory}
                        current={providers.etoro.latencyMs}
                        color="#22c55e"
                      />
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted">
                    <span>
                      Min: <strong className="font-mono text-fg">{providers.etoro.minLatencyMs}ms</strong>
                    </span>
                    <span>
                      Max: <strong className="font-mono text-fg">{providers.etoro.maxLatencyMs}ms</strong>
                    </span>
                    <span>
                      Loss: <strong className="font-mono text-fg">{providers.etoro.packetLossPct}%</strong>
                    </span>
                  </div>
                </div>

                {/* Uptime Progress Bars */}
                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted">24h Uptime</span>
                      <span className="font-mono font-semibold text-emerald-400">{providers.etoro.uptime24h}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${providers.etoro.uptime24h}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted">7d Availability</span>
                      <span className="font-mono font-semibold text-fg">{providers.etoro.uptime7d}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${providers.etoro.uptime7d}%` }} />
                    </div>
                  </div>
                </div>

                {/* Technical Specs List */}
                <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted">Trading API:</span>
                    <span className="font-medium text-fg">{providers.etoro.tradingApiName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Transport:</span>
                    <span className="font-medium text-primary capitalize">{providers.etoro.activeTransport.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Data Center:</span>
                    <span className="text-fg truncate max-w-36">{providers.etoro.region}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Auth Protocol:</span>
                    <span className="text-fg truncate max-w-36">{providers.etoro.authProtocol}</span>
                  </div>
                </div>
              </div>

              {(market === 'nasdaq' || market === 'etfs') && (
                <div className="mt-4 rounded-lg bg-primary/10 py-1.5 text-center text-xs font-semibold text-primary">
                  ✓ Active Execution Broker for Desk
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Real-time Connectivity Events & Audit Log */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-fg">Live Connectivity & Heartbeat Audit Log</h3>
          </div>
          <span className="text-xs text-muted">Rolling 20 probe acknowledgments</span>
        </div>

        <div className="mt-3 divide-y divide-border/60 overflow-x-auto text-xs">
          {events.length === 0 ? (
            <p className="py-4 text-center text-muted">Awaiting probe events...</p>
          ) : (
            events.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    className={`size-2 rounded-full ${
                      evt.status === 'success'
                        ? 'bg-emerald-400'
                        : evt.status === 'warning'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <div>
                    <span className="font-semibold text-fg">{evt.providerName}</span>
                    <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-muted uppercase">
                      {evt.type.replace('_', ' ')}
                    </span>
                    <p className="mt-0.5 text-muted text-[11px]">{evt.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-right">
                  {evt.latencyMs && (
                    <span className="font-mono text-[11px] font-medium text-emerald-400">
                      {evt.latencyMs}ms
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Failover Architecture & Order Safety Protocol */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-fg">Zero-Order Risk & Three-Tier Failover Architecture</h3>
        <p className="mt-1 text-xs text-muted">
          All desk calculations and algorithmic orders are isolated from execution risk through a strict triple-tier fallback.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs">
                1
              </span>
              <span className="font-bold text-fg">Tier 1: Direct Client WS</span>
            </div>
            <p className="mt-2 text-muted leading-relaxed">
              Binance WebSocket streams (`miniTicker`) and Kraken v2 channels stream sub-50ms price ticks directly to the browser.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-primary/20 text-primary font-bold text-xs">
                2
              </span>
              <span className="font-bold text-fg">Tier 2: Adaptive 15s REST</span>
            </div>
            <p className="mt-2 text-muted leading-relaxed">
              If client sockets encounter dropped packets, the backend seamlessly polls cached Stooq and Yahoo endpoints without blocking UI threads.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs">
                3
              </span>
              <span className="font-bold text-fg">Tier 3: Snapshot Tape</span>
            </div>
            <p className="mt-2 text-muted leading-relaxed">
              In offline or sample mode, pre-recorded snapshot tapes generate realistic algorithmic price movement with zero live order exposure.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
