import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  BrainCircuit, ShieldCheck, ShieldAlert, Play, AlertTriangle, Activity, Clock3, Cpu,
  ClipboardCheck, Database, LockKeyhole, CheckCircle2, Link2, Award,
  Sparkles, Check, ChevronDown, ChevronUp
} from 'lucide-react';
import { api } from '../lib/api';
import { TradingRehearsalPanel } from './trading-rehearsal-panel';
import { getConstituents } from '../data/universes';
import type { MarketType } from '../types/market';

type AgentStatus = {
  enabled: boolean;
  ready: boolean;
  model?: string | null;
  reason?: string | null;
  provider?: string;
  mode: string;
  teamPattern?: string;
  agentCount?: number;
  trustGatingEnabled?: boolean;
  starterAgents?: {
    id: string;
    name: string;
    role: string;
    capabilities: string[];
    tools: string[];
    specFile: string;
  }[];
};

type AiMetrics = {
  windowDays: number;
  bucketHours: number;
  totalRuns: number;
  buckets: {
    bucketStart: string;
    runCount: number;
    successCount: number;
    successRate: number | null;
    averageLatencyMs: number | null;
  }[];
};

type AgentEvent = {
  type: string;
  agent?: string;
  tool?: string;
  step?: number;
  failed?: boolean;
  durationMs?: number;
  status?: string;
};

type TrustBlock = {
  index: number;
  previousHash: string;
  agent: string;
  eventType: string;
  timestamp: string;
  payloadHash: string;
  blockHash: string;
  summary?: string;
};

type TrustGateCheck = {
  name: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  score?: number;
  maxScore?: number;
  detail: string;
};

type TrustGateData = {
  pattern: string;
  trustScore: number;
  trustTier: 'GOLD' | 'SILVER' | 'BRONZE';
  gateDecision: 'TRUST_APPROVED' | 'TRUST_FLAGGED' | 'TRUST_BLOCKED';
  threshold: number;
  evidenceGroundingPct: number;
  checks: TrustGateCheck[];
  chain: {
    verified: boolean;
    blocksCount: number;
    genesisHash: string;
    latestHash: string;
    blocks: TrustBlock[];
  };
};

type AgentRun = {
  status: string;
  answer: string | null;
  error: string | null;
  runId: string;
  model: string;
  steps: number;
  toolCalls: number;
  events: AgentEvent[];
  agents: { name: string; status: string; runId: string; steps: number; toolCalls: number; role?: string }[];
  trustGate?: TrustGateData;
  diagnostics?: { observations: number; annualizedVolatilityPct: number; maxObservedDrawdownPct: number; observedReturnPct: number; limitations: string };
  researchIntegrity?: { score: number; description: string; accepted: boolean };
  evidence: { market: string; symbol: string; source: string; asOf: string; bars: number };
  tradingEnabled: boolean;
  disclaimer: string;
};

export function AiModePanel({ market, sample }: { market: MarketType; sample: boolean }) {
  const symbols = useMemo(() => getConstituents(market).slice(0, 50), [market]);
  const [symbol, setSymbol] = useState('');
  const [focus, setFocus] = useState('');
  const [state, setState] = useState<AgentStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentRun | null>(null);
  const [showChain, setShowChain] = useState(false);
  const [showStarterCatalog, setShowStarterCatalog] = useState(false);
  const [metrics, setMetrics] = useState<AiMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setSymbol(symbols[0]?.ticker || '');
    setResult(null);
    setError(null);
  }, [market, symbols]);

  async function refreshStatus() {
    setChecking(true);
    try {
      setState(await api<AgentStatus>('/api/ai/status'));
    } catch {
      setState({ enabled: false, ready: false, reason: 'Model service not reachable', mode: 'read_only' });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshMetrics() {
    setMetricsLoading(true);
    try {
      setMetrics(await api<AiMetrics>('/api/ai/metrics'));
      setMetricsError(null);
    } catch (err) {
      setMetrics(null);
      setMetricsError(err instanceof Error ? err.message : 'AI metrics are unavailable');
    } finally {
      setMetricsLoading(false);
    }
  }

  useEffect(() => {
    void refreshMetrics();
  }, []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  async function analyze() {
    if (sample || running || !state?.ready || !symbol || market === 'nifty') return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const output = await api<AgentRun>('/api/ai/research', {
        method: 'POST',
        body: JSON.stringify({ market, symbol, focus: focus.trim() })
      });
      setResult(output);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI research failed');
    } finally {
      setRunning(false);
      await refreshMetrics();
    }
  }

  const disabled = checking || running || sample || !state?.ready || !symbol || market === 'nifty';
  const chartData = metrics?.buckets.map(bucket => ({
    ...bucket,
    time: new Date(bucket.bucketStart).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
  })) || [];

  return (
    <section className="space-y-5" aria-label="AI research mode">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap justify-between gap-5">
          <div className="max-w-xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <BrainCircuit className="size-3.5" /> Trust-Gated Agent Team
              </span>
              <span className="rounded-md border border-border bg-bg/80 px-2 py-0.5 text-[10px] font-medium text-muted">
                awesome-ai-apps pattern
              </span>
            </div>
            <h2 className="text-xl font-semibold text-fg">AI Market Research Team (3-Tier Trust Gate)</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A collaborative 3-tier pipeline: <span className="font-medium text-fg">Analyst</span> collects verified daily evidence with bounded tools, <span className="font-medium text-fg">Risk Reviewer</span> critiques hypotheses, and <span className="font-medium text-fg">Trust Gatekeeper</span> enforces policy scores and cryptographic SHA-256 chain validation.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span role="status" aria-live="polite" className={'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ' + (checking ? 'border-border bg-surface-2 text-muted' : state?.ready ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400')}>
              <span className={'size-2 rounded-full ' + (checking ? 'bg-muted' : state?.ready ? 'bg-emerald-400' : 'bg-amber-400')} />
              {checking ? 'Checking local model…' : state?.ready ? 'Local LLM ready' : 'LLM offline'}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Cpu className="size-3.5" /> {state?.model || 'qwen3:4b'} / Ollama · 3 trust-gated agents
            </span>
            <button onClick={refreshStatus} type="button" className="text-xs font-medium text-primary hover:underline">
              Recheck model
            </button>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4 text-emerald-400" /> Read-Only Sandbox Quarantine
          </p>
          <p className="flex items-center gap-2 text-xs text-muted">
            <Clock3 className="size-4 text-primary" /> 3 Sequential Gated Tiers
          </p>
          <p className="flex items-center gap-2 text-xs text-muted">
            <Link2 className="size-4 text-primary" /> Cryptographic SHA-256 Audit Chain
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="ai-performance-heading">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="ai-performance-heading" className="text-sm font-semibold text-fg">AI research performance trends</h3>
            <p className="mt-1 text-xs text-muted">Latency and completed-run rate · rolling 7-day window, 6-hour buckets</p>
          </div>
          <span className="rounded-full border border-border bg-bg/70 px-2.5 py-1 text-[11px] text-muted">
            {metricsLoading ? 'Updating…' : metrics ? `${metrics.totalRuns} recorded runs` : 'Private run history'}
          </span>
        </div>
        {metricsError ? (
          <p className="rounded-lg border border-border bg-bg/70 p-3 text-xs text-muted" role="status">
            Sign in to view private research history.
          </p>
        ) : metricsLoading ? (
          <p className="py-8 text-center text-xs text-muted" role="status">Loading research metrics…</p>
        ) : !metrics?.totalRuns ? (
          <p className="rounded-lg border border-border bg-bg/70 p-3 text-xs text-muted" role="status">
            No research runs recorded in this server session yet. Completed and failed runs will appear here.
          </p>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-border/80 bg-bg/50 p-3" role="img" aria-label="Average AI research latency by six-hour interval in milliseconds">
              <h4 className="mb-2 text-xs font-medium text-muted">Average latency <span className="text-primary">(ms)</span></h4>
              <div className="h-44 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }} accessibilityLayer>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: 'var(--muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={46} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: 'var(--fg)' }}
                      formatter={(value) => [`${value ?? '—'} ms`, 'Average latency']}
                    />
                    <Line type="monotone" dataKey="averageLatencyMs" name="Average latency" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={650} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="min-w-0 rounded-xl border border-border/80 bg-bg/50 p-3" role="img" aria-label="AI research success rate by six-hour interval in percent">
              <h4 className="mb-2 text-xs font-medium text-muted">Success rate <span className="text-emerald-400">(%)</span></h4>
              <div className="h-44 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }} accessibilityLayer>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: 'var(--muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={46} tickFormatter={value => `${value}%`} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: 'var(--fg)' }}
                      formatter={(value) => [`${value ?? '—'}%`, 'Success rate']}
                    />
                    <Line type="monotone" dataKey="successRate" name="Success rate" stroke="var(--up)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={!reducedMotion} animationDuration={650} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
        {metrics?.totalRuns ? (
          <p className="mt-3 text-[11px] text-muted">Success means the full trust-gated research run completed; failed and incomplete runs count toward the rate. Metrics contain timestamps and durations only.</p>
        ) : null}
      </section>

      {/* Starter Agent Capability Matrix (awesome-ai-apps starter_ai_agents/*) */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <button
          type="button"
          onClick={() => setShowStarterCatalog(!showStarterCatalog)}
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-fg hover:text-primary transition-colors"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-primary">
              <Sparkles className="size-3.5" />
            </span>
            <span>Harnessed Starter Agent Capabilities (4 Starter Agents Integrated)</span>
            <span className="rounded bg-bg px-2 py-0.5 text-[10px] font-mono text-muted">starter_ai_agents/*</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="text-[11px]">agent.md specs</span>
            {showStarterCatalog ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </div>
        </button>

        {showStarterCatalog && (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <p className="text-xs text-muted leading-relaxed">
              These 4 starter agents from <code className="rounded bg-bg px-1 py-0.5 text-primary">awesome-ai-apps</code> are mixed into Groww Connect&apos;s capability harness under strict read-only and deterministic risk boundaries. Detailed contracts are formalized in <code className="rounded bg-bg px-1 py-0.5 text-fg">/agent.md</code>.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {[
                {
                  id: 'starter_ai_agents/ai_data_analysis_agent',
                  name: 'AI Data Analysis Agent',
                  role: 'Quantitative Time-Series & Statistical Engine',
                  tools: ['read_market_evidence', 'backtest_sma_rule'],
                  boundary: 'Verified historical candles only; minimum 55 bars'
                },
                {
                  id: 'starter_ai_agents/xai_finance_agent',
                  name: 'xAI Finance Agent',
                  role: 'Cross-Market Pricing & Risk Limits Inspector',
                  tools: ['check_hypothetical_risk', 'execution_capabilities'],
                  boundary: '30% max allocation, 1.5% max risk at stop'
                },
                {
                  id: 'starter_ai_agents/openai_research_agent',
                  name: 'OpenAI Research Agent',
                  role: 'Structured Thesis Synthesis & Independent Critic',
                  tools: ['Independent Risk Reviewer (Tool-free)'],
                  boundary: 'Evaluates verified JSON; cannot execute orders'
                },
                {
                  id: 'starter_ai_agents/web_scraping_ai_agent',
                  name: 'Governed Web Intelligence Agent',
                  role: 'Attributed Desk News & Search Ingestion',
                  tools: ['read_market_intelligence'],
                  boundary: 'Raw scraping quarantined; sanitized desk tape'
                }
              ].map(ag => (
                <div key={ag.id} className="rounded-xl border border-border/80 bg-bg/70 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-fg">{ag.name}</span>
                    <span className="text-[10px] font-mono text-muted">{ag.id.replace('starter_ai_agents/', '')}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-primary">{ag.role}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    <span className="font-medium text-fg">Bound tools:</span> {ag.tools.join(', ')}
                  </p>
                  <p className="mt-1 text-[10px] text-muted/80">
                    <span className="font-medium text-fg">Safety boundary:</span> {ag.boundary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {(!state?.ready || sample) && (

        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-400" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            {sample
              ? 'AI inference requires an authenticated research session. Sample mode lets you inspect the mode, but does not send anonymous requests to the local model.'
              : (state?.reason || 'The server cannot find the configured local LLM.')}
            {!sample && <p className="mt-2 text-xs">On the server, install Ollama, run <code className="rounded bg-bg px-1.5 py-0.5">ollama pull qwen3:4b</code>, then start the Ollama service.</p>}
          </div>
        </div>
      )}

      {market === 'nifty' && (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-400" role="status">
          Verified NIFTY historical market data are not configured on this server. AI research is unavailable for this market; sample data will not be presented as verified research.
        </p>
      )}

      {/* Input Form */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <label className="block text-xs font-semibold text-muted">
            Instrument
            <select
              aria-label="AI instrument"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg focus-visible:ring-2 focus-visible:ring-primary"
            >
              {symbols.map(item => (
                <option key={item.ticker} value={item.ticker}>
                  {item.ticker} — {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            <span className="flex items-center justify-between gap-3">
              <span>Research focus <span className="font-normal">(optional)</span></span>
              <span className="num font-normal text-muted">{focus.length}/160</span>
            </span>
            <input
              aria-label="AI research focus"
              maxLength={160}
              value={focus}
              onChange={e => setFocus(e.target.value)}
              placeholder="e.g. Does the 20/50-day cross justify watching?"
              className="mt-2 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            <LockKeyhole className="mr-1 inline size-3.5" /> Read-only research · zero execution permissions
          </p>
          <button
            type="button"
            onClick={analyze}
            disabled={disabled}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="size-4" /> {running ? 'Trust-gated team evaluating…' : 'Run Trust-Gated Research'}
          </button>
        </div>
        {running&&(
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted" role="status" aria-live="polite">
            <Activity className="mt-0.5 size-4 shrink-0 text-primary" />
            The analyst, risk reviewer, and trust gatekeeper are evaluating historical evidence. Results appear after all required checks finish.
          </p>
        )}
      </div>
      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400" role="alert">{error}</p>}

      {/* Results View */}
      {result && (
        <div className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6" role="status" aria-label="AI analysis results">
          {/* Header & Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-5 text-primary" />
                <h3 className="text-base font-semibold text-fg">Trust-Gated Synthesis Report</h3>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Session {result.runId.slice(0, 8)} · {result.evidence.market.toUpperCase()} / {result.evidence.symbol}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={'rounded-full border px-3 py-1 text-xs font-semibold ' + (
                result.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : result.status === 'trust_blocked' ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              )}>
                {result.status.replace(/_/g, ' ')}
              </span>
              {result.trustGate && (
                <span className={'rounded-full border px-3 py-1 text-xs font-semibold ' + (
                  result.trustGate.gateDecision === 'TRUST_APPROVED'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : result.trustGate.gateDecision === 'TRUST_FLAGGED'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                      : 'border-red-500/30 bg-red-500/10 text-red-400'
                )}>
                  {result.trustGate.gateDecision.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>

          <section className="space-y-3" aria-label="Historical research diagnostics">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-fg">Historical research diagnostics</h4>
              <span className="text-xs text-muted">Daily closes · {result.evidence.asOf} · {result.evidence.source}</span>
            </div>
            {result.diagnostics ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Observed return', result.diagnostics.observedReturnPct],
                  ['Annualized historical volatility', result.diagnostics.annualizedVolatilityPct],
                  ['Maximum observed drawdown', result.diagnostics.maxObservedDrawdownPct],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border bg-bg p-3">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{Number(value).toFixed(2)}%</p>
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-muted sm:col-span-3">{result.diagnostics.limitations}</p>
              </div>
            ) : <p className="text-xs text-muted">Historical diagnostics unavailable for this result.</p>}
            <p className="text-xs text-muted">Research integrity measures evidence and process checks, not forecast accuracy or investment confidence.
              {result.researchIntegrity && !result.researchIntegrity.accepted ? ' Research was not accepted by the deterministic gate.' : ''}
            </p>
            <p className="text-xs text-muted">News catalysts: no independently attributed article feed is available in this report. No news claim is treated as verified.</p>
          </section>

          {/* Trust-Gated Score Card & Verification Dashboard */}
          {result.trustGate && (
            <div className="rounded-xl border border-border bg-bg/60 p-4">
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                {/* Score Dial */}
                <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface p-3 text-center">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <Award className="size-4 text-primary" /> Research Integrity
                  </div>
                  <div className="mt-1 text-3xl font-bold tracking-tight text-fg">
                    {result.trustGate.trustScore}
                    <span className="text-xs font-normal text-muted">/100</span>
                  </div>
                  <span className={'mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ' + (
                    result.trustGate.trustTier === 'GOLD'
                      ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30'
                      : result.trustGate.trustTier === 'SILVER'
                        ? 'bg-slate-300/15 text-slate-200 border border-slate-300/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  )}>
                    <Sparkles className="size-3" /> {result.trustGate.trustTier} TIER
                  </span>
                  <span className="mt-1 text-[10px] text-muted">Threshold: {result.trustGate.threshold}/100</span>
                </div>

                {/* Verification Criteria Checks */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-fg">Trust-Gate Inspection Criteria</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {result.trustGate.checks.map((chk, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-border/80 bg-surface/80 p-2 text-xs">
                        {chk.status === 'PASSED' ? (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                        ) : chk.status === 'WARNING' ? (
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                        ) : (
                          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-rose-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-fg">{chk.name}</span>
                            {chk.score !== undefined && chk.maxScore !== undefined && (
                              <span className="text-[10px] text-muted">{chk.score}/{chk.maxScore}</span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-muted">{chk.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3-Agent Collaborative Pipeline */}
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Collaborative Agent Pipeline</p>
            <ol className="grid gap-2 sm:grid-cols-3" aria-label="Agent team runs">
              {result.agents.map((agent, idx) => (
                <li key={agent.runId || idx} className="flex flex-col justify-between rounded-lg border border-border bg-bg p-3 text-xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-fg">{agent.name}</span>
                      <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Tier {idx + 1}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      Role: {agent.role || (idx === 0 ? 'Evidence Collector' : idx === 1 ? 'Risk Critic' : 'Trust Gatekeeper')}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted">
                    <span>{agent.status.replace(/_/g, ' ')}</span>
                    <span>Steps: {agent.steps} · Tools: {agent.toolCalls}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Evidence Details */}
          <div className="grid gap-3 rounded-lg border border-border bg-bg/40 p-3 text-xs text-muted sm:grid-cols-3">
            <span className="flex items-center gap-1.5"><Database className="size-3.5" /> {result.evidence.source}</span>
            <span>As of: {result.evidence.asOf} ({result.evidence.bars} bars)</span>
            <span>Total Model Steps: {result.steps} · Tool Calls: {result.toolCalls}</span>
          </div>

          {/* Synthesized Answer */}
          {result.answer ? (
            <div className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Check className="size-4 text-emerald-400" /> Synthesized Research Verdict
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{result.answer}</p>
            </div>
          ) : (
            <p className="text-sm text-watch">{result.error || 'Agent did not complete an evidence-based assessment. No signal.'}</p>
          )}

          {/* Cryptographic SHA-256 Audit Trail */}
          {result.trustGate?.chain && (
            <div className="rounded-xl border border-border bg-bg p-3">
              <button
                type="button"
                onClick={() => setShowChain(!showChain)}
                className="flex w-full items-center justify-between text-xs font-semibold text-muted hover:text-fg"
              >
                <span className="flex items-center gap-2">
                  <Link2 className="size-3.5 text-primary" />
                  Cryptographic SHA-256 Audit Chain ({result.trustGate.chain.blocksCount} Blocks) ·
                  <span className={result.trustGate.chain.verified ? 'text-emerald-400' : 'text-rose-400'}> {result.trustGate.chain.verified ? 'Tamper-evident verified' : 'Verification failed'}</span>
                </span>
                {showChain ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>

              {showChain && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <p className="text-[11px] text-muted">
                    Each agent action is cryptographically hash-chained using SHA-256. Tampering with any historical block breaks subsequent links.
                  </p>
                  <div className="space-y-2">
                    {result.trustGate.chain.blocks.map(block => (
                      <div key={block.index} className="rounded border border-border/80 bg-surface/80 p-2 font-mono text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-fg font-medium">
                          <span>Block #{block.index}: {block.agent} [{block.eventType}]</span>
                          <span className="text-[10px] text-muted font-sans">{block.timestamp.slice(11, 19)} UTC</span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-sans text-muted">{block.summary}</p>
                        <div className="mt-1 grid gap-1 text-[10px] text-muted sm:grid-cols-2">
                          <div className="truncate">Prev Hash: <span className="text-muted/80">{block.previousHash.slice(0, 16)}…</span></div>
                          <div className="truncate">Block Hash: <span className="text-primary font-semibold">{block.blockHash.slice(0, 16)}…</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Harness Events Log */}
          <details className="rounded-xl border border-border bg-bg p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              Harness execution events · {result.events.length} events logged
            </summary>
            <ol className="mt-3 space-y-1.5 text-xs text-muted">
              {result.events.filter(e => ['tool_end', 'model_error', 'run_end'].includes(e.type)).map((event, i) => (
                <li key={i}>
                  <span className="font-medium text-fg">{event.agent || 'Agent'}</span> · {event.type} {event.tool || ''} {event.failed ? '(failed)' : ''} {event.durationMs !== undefined ? `${event.durationMs} ms` : ''}
                </li>
              ))}
            </ol>
          </details>

          <p className="flex items-start gap-2 text-xs text-watch">
            <ShieldCheck className="size-4 shrink-0 text-emerald-400" /> {result.disclaimer}
          </p>
        </div>
      )}

      <TradingRehearsalPanel market={market} symbol={symbol} sample={sample} />
      <p className="text-xs text-muted">
        The model can be inaccurate. Historical experiments do not establish future profitability. No autonomous order submission or code execution.
      </p>
    </section>
  );
}
