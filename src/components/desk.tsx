import { useEffect, useMemo, useState, useRef, lazy, Suspense, type KeyboardEvent } from 'react';
import { LogOut, Activity, Radio, Clock, ShieldCheck, CheckSquare, Square, Newspaper, Sparkles, Cpu, LayoutDashboard, AlertTriangle } from 'lucide-react';
import { MarketSelector } from './market-selector';
import { AccentSwitch } from './accent';
import { Wordmark } from './wordmark';





import { SignalNewsPanel } from './signal-news-panel';





import { useMarketQuotes } from '../lib/quotes-context';
import {
  api,
  expiryLabel,
  formatPrice,
  inr,
  pct,
  prettyDate,
  type Profile,
  type ScanJob,
  type ScanMeta,
  type ScanParams,
  type SessionStatus,
  type SignalRow,
  type SimResult,
} from '../lib/api';
import { MARKETS } from '../data/universes';

// Split high-cost workspaces into on-demand chunks.
const StrategiesPanel = lazy(() => import('./strategies-panel').then(m => ({ default: m.StrategiesPanel })));
const AlgoSignalsPanel = lazy(() => import('./algo-signals').then(m => ({ default: m.AlgoSignalsPanel })));
const GttPanel = lazy(() => import('./gtt-panel').then(m => ({ default: m.GttPanel })));
const AlertsPanel = lazy(() => import('./alerts-panel').then(m => ({ default: m.AlertsPanel })));
const PortfolioPanel = lazy(() => import('./portfolio-panel').then(m => ({ default: m.PortfolioPanel })));
const MarketHeatmap = lazy(() => import('./market-heatmap').then(m => ({ default: m.MarketHeatmap })));
const MarketHealth = lazy(() => import('./market-health').then(m => ({ default: m.MarketHealth })));
const MarketNewsPanel = lazy(() => import('./market-news-panel').then(m => ({ default: m.MarketNewsPanel })));
const BrokerStatusModal = lazy(() => import('./broker-status-modal').then(m => ({ default: m.BrokerStatusModal })));
const LivelinessModal = lazy(() => import('./liveliness-modal').then(m => ({ default: m.LivelinessModal })));

const TABS = ['signals','news','heatmap','health','portfolio','strategies','algo','gtt','alerts','user'] as const;
type DeskTab = typeof TABS[number];
const TAB_DETAILS: Record<DeskTab,{title:string;subtitle:string}> = {
  signals:{title:'Signal intelligence',subtitle:'Scan market setups and review signal evidence.'},
  news:{title:'Market news',subtitle:'Investigate catalysts and events before making decisions.'},
  heatmap:{title:'Market landscape',subtitle:'Explore market breadth and concentration.'},
  health:{title:'Data health',subtitle:'Review provider freshness and feed telemetry.'},
  portfolio:{title:'Portfolio workspace',subtitle:'Inspect indicative holdings and model allocations.'},
  strategies:{title:'Strategy lab',subtitle:'Research and backtest rule-based ideas.'},
  algo:{title:'Paper order lab',subtitle:'Review simulated triggers; live broker execution remains disabled.'},
  gtt:{title:'GTT simulations',subtitle:'Explore conditional orders without submitting trades.'},
  alerts:{title:'Alert center',subtitle:'Monitor configured research alerts.'},
  user:{title:'Workspace settings',subtitle:'View the active session and available services.'},
};

const fieldClass =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary';

const GUIDE = [
  { signal: 'BUY' as const, text: 'Bullish cross, at least 58% of paths finish higher, and the median path is up.' },
  { signal: 'SELL' as const, text: 'Bearish cross, at most 42% of paths finish higher, and the median path is down.' },
  { signal: 'WATCH' as const, text: 'The cross is four sessions old or newer, but the simulated edge is still too small to act.' },
  { signal: 'HOLD' as const, text: 'A cross is on the board, yet the simulation does not support buying or selling.' },
];

const PRODUCT_LABEL: Record<string, string> = {
  CASH: 'Cash equity',
  FNO: 'Futures & options',
  CNC: 'Delivery (CNC)',
  MIS: 'Intraday (MIS)',
  NRML: 'Normal (NRML)',
};

export function Desk({ sample, onSignOut }: { sample: boolean; onSignOut: () => void }) {
  const { market, quoteStatus, dataSourceLabel, sessionClock } = useMarketQuotes();
  const [tab, setTab] = useState<DeskTab>('signals');
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [brokerModalOpen, setBrokerModalOpen] = useState(false);
  const [livelinessModalOpen, setLivelinessModalOpen] = useState(false);
  const [failoverCount, setFailoverCount] = useState(0);

  const mktConfig = MARKETS[market];
  const activeSection = TAB_DETAILS[tab];
  function onTabKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next]);
    document.getElementById(`tab-${TABS[next]}`)?.focus();
  }

  useEffect(() => {
    let cancel = false;
    const checkFailover = () => {
      api<any>('/api/adapter/liveliness')
        .then((res) => {
          if (!cancel && res?.systemOverview) {
            setFailoverCount(res.systemOverview.activeFailoversCount || 0);
          }
        })
        .catch(() => {});
    };
    checkFailover();
    const interval = setInterval(checkFailover, 5000);
    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    if (sample) {
      setSession({ authenticated: false, offline: true });
    } else {
      api<SessionStatus>('/api/auth/status')
        .then((status) => {
          if (!cancel) setSession(status);
        })
        .catch(() => {});
    }

    const path = sample ? '/api/demo/profile' : '/api/profile';
    api<Profile>(path)
      .then((next) => {
        if (!cancel) setProfile(next);
      })
      .catch((err: unknown) => {
        if (!cancel) {
          setProfileError(err instanceof Error ? err.message : 'Could not load profile.');
        }
      })
      .finally(() => {
        if (!cancel) setProfileLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [sample]);

  async function handleSignOut() {
    if (!sample) {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {}
    }
    onSignOut();
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Top Bar Header following strict one-row 3-zone contract */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Zone 1: Wordmark & Brand Title */}
          <div className="flex items-center gap-4">
            <Wordmark compact market={market} />
            <div className="hidden lg:block h-5 w-px bg-border" />
            {/* Market Selector */}
            <MarketSelector />
          </div>

          {/* Zone 2: Real-time Telemetry & Session Clock */}
          <div className="flex items-center gap-3 text-xs text-muted">
            <div className="hidden sm:flex items-center gap-1.5 font-medium">
              <Clock className="size-3.5" />
              <span className="num text-fg">{sessionClock}</span>
            </div>

            <span className="hidden sm:inline text-border">·</span>

            {/* Quote Status Badge */}
            <div className="flex items-center gap-1.5">
              <span
                className={
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ' +
                  (quoteStatus === 'Live'
                    ? 'tone-up'
                    : quoteStatus === 'Delayed'
                    ? 'tone-watch'
                    : quoteStatus === 'Sample'
                    ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                    : 'bg-surface-2 text-muted border border-border')
                }
              >
                <Radio className={'size-2.5 ' + (quoteStatus === 'Live' ? 'animate-pulse' : '')} />
                {quoteStatus}
              </span>
              <span className="hidden md:inline text-[11px] text-muted truncate max-w-48" title={dataSourceLabel}>
                {dataSourceLabel}
              </span>
            </div>

            {/* Liveliness & Stream Telemetry Button */}
            <button
              type="button"
              onClick={() => setLivelinessModalOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                failoverCount > 0
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 animate-pulse'
                  : 'border-border bg-surface text-fg hover:bg-surface-2'
              }`}
              title="Inspect live stream health, latencies, auto-failover, and market routing"
            >
              <Activity className={`size-3 ${failoverCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span className="hidden sm:inline">Liveliness:</span>
              <span className={`font-semibold ${failoverCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {failoverCount > 0 ? `⚠️ ${failoverCount} Feed Failed-Over` : 'Live & Routed'}
              </span>
            </button>

            {/* Broker API Manager Button */}
            <button
              type="button"
              onClick={() => setBrokerModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-fg hover:bg-surface-2 transition-colors"
              title="Inspect Groww, Kraken, and eToro Broker APIs"
            >
              <Cpu className="size-3 text-primary" />
              <span className="hidden sm:inline">Broker:</span>
              <span className="font-semibold text-primary">
                {market === 'nifty' ? 'Groww (NSE)' : market === 'crypto' ? 'Kraken (Crypto)' : 'eToro (NASDAQ)'}
              </span>
            </button>
          </div>

          {/* Zone 3: Actions & Accent Switcher */}
          <div className="flex items-center gap-3">
            <AccentSwitch />
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-fg hover:bg-surface-2 transition-colors"
            >
              <LogOut className="size-3.5" />
              {sample ? 'Exit sample' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {sample ? (
          <p className="note-watch mb-5 rounded-lg border bg-surface px-4 py-2.5 text-xs text-watch">
            Sample mode active. Quotes and indicators are calculated from realistic sample tapes without API keys.
          </p>
        ) : session?.expires_at ? (
          <p className="mb-5 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs text-muted">
            Groww token active on the server until <span className="text-fg font-medium">{expiryLabel(session.expires_at)}</span>
            {session.flow === 'totp' ? ' (TOTP)' : ' (API Secret)'}. Token is kept strictly server-side.
          </p>
        ) : null}

        {/* Tab Navigation */}
        <div role="tablist" aria-label="Desk tabs" className="flex flex-wrap gap-1.5 border-b border-border pb-3">
          <TabButton id="signals" selected={tab === 'signals'} onSelect={() => setTab('signals')} label="Signals" />
          <TabButton id="news" selected={tab === 'news'} onSelect={() => setTab('news')} label="Market News" />
          <TabButton id="heatmap" selected={tab === 'heatmap'} onSelect={() => setTab('heatmap')} label="Market Heatmap" />
          <TabButton id="health" selected={tab === 'health'} onSelect={() => setTab('health')} label="Market Health" />
          <TabButton id="portfolio" selected={tab === 'portfolio'} onSelect={() => setTab('portfolio')} label="Portfolio" />
          <TabButton id="strategies" selected={tab === 'strategies'} onSelect={() => setTab('strategies')} label="Strategies" />
          <TabButton id="algo" selected={tab === 'algo'} onSelect={() => setTab('algo')} label="Algo Signals" />
          <TabButton id="gtt" selected={tab === 'gtt'} onSelect={() => setTab('gtt')} label="GTT Placement" />
          <TabButton id="alerts" selected={tab === 'alerts'} onSelect={() => setTab('alerts')} label="Alerts" />
          <TabButton id="user" selected={tab === 'user'} onSelect={() => setTab('user')} label="User" />
        </div>

        {/* Tab Panels */}
        <div className="mt-6" role="tabpanel" id="panel-signals" hidden={tab !== 'signals'}>
          <SignalsPanel sample={sample} />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-news" hidden={tab !== 'news'}>
          <MarketNewsPanel market={market} />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-heatmap" hidden={tab !== 'heatmap'}>
          <MarketHeatmap />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-health" hidden={tab !== 'health'}>
          <MarketHealth />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-portfolio" hidden={tab !== 'portfolio'}>
          <PortfolioPanel />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-strategies" hidden={tab !== 'strategies'}>
          <StrategiesPanel />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-algo" hidden={tab !== 'algo'}>
          <AlgoSignalsPanel />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-gtt" hidden={tab !== 'gtt'}>
          <GttPanel />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-alerts" hidden={tab !== 'alerts'}>
          <AlertsPanel />
        </div>

        <div className="mt-6" role="tabpanel" id="panel-user" hidden={tab !== 'user'}>
          <UserPanel profile={profile} loading={profileLoading} error={profileError} />
        </div>

        {/* Broker Configuration and Liveliness Modals */}
        <BrokerStatusModal isOpen={brokerModalOpen} onClose={() => setBrokerModalOpen(false)} />
        <LivelinessModal
          isOpen={livelinessModalOpen}
          onClose={() => setLivelinessModalOpen(false)}
          currentMarket={market}
          onNavigateToHealthTab={() => setTab('health')}
        />
      </main>
    </div>
  );
}

function TabButton({
  id,
  label,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      className={
        'h-10 rounded-lg px-4 text-xs font-semibold whitespace-nowrap transition-colors ' +
        (selected
          ? 'bg-primary text-primary-fg shadow-sm'
          : 'border border-border bg-surface text-fg hover:bg-surface-2')
      }
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

function UserPanel({
  profile,
  loading,
  error,
}: {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <p className="text-sm text-muted">Loading profile…</p>;
  if (error) {
    return (
      <p className="note-down rounded-lg border bg-surface px-4 py-3 text-sm text-down" role="alert">
        {error}
      </p>
    );
  }
  if (!profile) return null;
  const products = profile.products.map((item) => PRODUCT_LABEL[item] ?? item);

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Account & Desk Configuration</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Groww session authentication status, active trading segments, and exchange permissions.
        {profile.ddpi_enabled === null
          ? ''
          : profile.ddpi_enabled
          ? ' DDPI is enabled on this account.'
          : ' DDPI is not enabled on this account.'}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Stat label="User Name" value={profile.user_name ?? 'Not provided by Groww'} muted={!profile.user_name} />
        <Stat label="Client / User ID" value={profile.user_id ?? '—'} mono />
        <Stat label="Products" value={products.length ? products.join(', ') : '—'} />
        <Stat label="Exchanges" value={profile.exchanges.length ? profile.exchanges.join(', ') : '—'} />
      </div>
    </section>
  );
}

function Stat({ label, value, mono = false, muted = false }: { label: string; value: string; mono?: boolean; muted?: boolean }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className={(mono ? 'num ' : '') + 'mt-2 text-lg font-medium ' + (muted ? 'text-muted' : 'text-fg')}>{value}</p>
    </article>
  );
}

function SignalsPanel({ sample }: { sample: boolean }) {
  const { market, getQuote } = useMarketQuotes();
  const [params, setParams] = useState<ScanParams>({
    short_window: 6,
    long_window: 30,
    lookback_days: 90,
    max_stocks: 25,
  });
  const [paths, setPaths] = useState(1000);
  const [horizon, setHorizon] = useState(21);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showNews, setShowNews] = useState(false);
  const [sim, setSim] = useState<Record<string, SimResult>>({});
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const mktConfig = MARKETS[market];

  // Poll scan job progress
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    let cancel = false;
    const timer = window.setInterval(() => {
      api<ScanJob>(`/api/signals/jobs/${job.id}`)
        .then((next) => {
          if (cancel) return;
          setJob(next);
          if (next.status !== 'running') {
            setScanning(false);
            if (next.status === 'error') setScanError(next.error || 'Scan failed.');
          }
        })
        .catch((err: unknown) => {
          if (cancel) return;
          setScanning(false);
          setScanError(err instanceof Error ? err.message : 'Scan failed.');
        });
    }, 600);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [job]);

  // Reset results when market changes
  useEffect(() => {
    setJob(null);
    setSelected([]);
    setSim({});
    setScanError(null);
  }, [market]);

  const rows = job?.results ?? [];
  const meta: ScanMeta | null = job?.meta ?? null;
  const shortLabel = meta?.short_window ?? params.short_window;
  const longLabel = meta?.long_window ?? params.long_window;
  const windowsMatch =
    !meta ||
    (meta.short_window === params.short_window &&
      meta.long_window === params.long_window &&
      meta.lookback_days === params.lookback_days);

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.ticker));

  function toggle(ticker: string) {
    setSelected((current) => (current.includes(ticker) ? current.filter((item) => item !== ticker) : [...current, ticker]));
  }

  async function generate() {
    setScanning(true);
    setScanError(null);
    setSim({});
    setSelected([]);
    setJob(null);
    try {
      const path = sample ? '/api/demo/scan' : '/api/signals/scan';
      const started = await api<{ id: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ ...params, market, sample }),
      });
      setJob({
        id: started.id,
        market,
        status: 'running',
        done: 0,
        total: 0,
        message: 'Starting scan…',
        results: null,
        meta: null,
        error: null,
      });
    } catch (err) {
      setScanning(false);
      setScanError(err instanceof Error ? err.message : 'Scan failed.');
    }
  }

  async function simulate() {
    if (!windowsMatch) {
      setSimError('Generate signals again so the moving averages match these inputs.');
      return;
    }
    setSimulating(true);
    setSimError(null);
    try {
      const payload = await api<{ results: SimResult[] }>('/api/signals/simulate', {
        method: 'POST',
        body: JSON.stringify({
          tickers: selected,
          short_window: params.short_window,
          long_window: params.long_window,
          lookback_days: params.lookback_days,
          paths,
          horizon_days: horizon,
          sample,
          market,
        }),
      });
      const next: Record<string, SimResult> = {};
      for (const row of payload.results) next[row.ticker] = row;
      setSim(next);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setSimulating(false);
    }
  }

  const progress = job && job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : scanning ? 10 : 0;
  const counts = useMemo(() => {
    const tally = { BUY: 0, SELL: 0, HOLD: 0, WATCH: 0 };
    for (const item of Object.values(sim)) tally[item.signal] += 1;
    return tally;
  }, [sim]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Signals & SMA Crossovers</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Scans the {mktConfig.label} universe. Detects when the short moving average crosses above or below the long moving
            average inside the lookback window. Ranked by newest crossover first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNews((v) => !v)}
            className={
              'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ' +
              (showNews
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-fg hover:bg-surface-2')
            }
          >
            <Newspaper className="size-3.5 text-primary" />
            {showNews ? 'Hide News' : `Market News & Catalysts${selected.length ? ` (${selected.length})` : ''}`}
          </button>
          <MarketSelector />
        </div>
      </div>

      {/* Scan Parameter Form */}
      <div className="mt-5 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <NumberField
          label="Short SMA"
          value={params.short_window}
          onChange={(value) => setParams({ ...params, short_window: value })}
        />
        <NumberField
          label="Long SMA"
          value={params.long_window}
          onChange={(value) => setParams({ ...params, long_window: value })}
        />
        <NumberField
          label="Lookback days"
          value={params.lookback_days}
          onChange={(value) => setParams({ ...params, lookback_days: value })}
        />
        <NumberField
          label="Max stocks"
          value={params.max_stocks}
          onChange={(value) => setParams({ ...params, max_stocks: value })}
        />
        <div className="flex items-end">
          <button
            type="button"
            disabled={scanning}
            onClick={() => void generate()}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? 'Scanning…' : `Scan ${mktConfig.label}`}
          </button>
        </div>
      </div>

      {scanning ? (
        <div className="mt-4" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {job?.message || 'Working'} {job?.total ? `· ${job.done}/${job.total}` : ''}
          </p>
        </div>
      ) : null}

      {scanError ? (
        <p className="note-down mt-4 rounded-lg border bg-surface px-4 py-3 text-sm text-down" role="alert">
          {scanError}
        </p>
      ) : null}

      {meta ? (
        <p className="mt-4 text-xs text-muted">
          {meta.with_crossover} names crossed inside {meta.lookback_days} days. Showing top {meta.shown} on {meta.source}.
          {meta.failed.length ? ` Failed to scan: ${meta.failed.join(', ')}.` : ''}
        </p>
      ) : null}

      {/* Signals Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-surface text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.ticker))}
                />
              </th>
              <th className="px-3 py-3 font-medium">Rank</th>
              <th className="px-3 py-3 font-medium">Symbol</th>
              <th className="px-3 py-3 font-medium">Name</th>
              {market === 'etfs' ? <th className="px-3 py-3 font-medium">Asset Tag</th> : null}
              <th className="px-3 py-3 font-medium">Crossover</th>
              <th className="px-3 py-3 font-medium">Cross Date</th>
              <th className="px-3 py-3 text-right font-medium">Live Price</th>
              <th className="px-3 py-3 text-right font-medium">Candle Close</th>
              <th className="px-3 py-3 text-right font-medium">SMA {shortLabel}</th>
              <th className="px-3 py-3 text-right font-medium">SMA {longLabel}</th>
              <th className="px-3 py-3 font-medium">Monte Carlo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={market === 'etfs' ? 12 : 11} className="px-4 py-12 text-center text-xs text-muted">
                  {scanning ? `Scanning the ${mktConfig.label} universe…` : 'Generate signals to populate crossover rankings.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const liveQ = getQuote(row.ticker);
                return (
                  <SignalTableRow
                    key={row.ticker}
                    row={row}
                    market={market}
                    livePrice={liveQ?.price}
                    checked={selected.includes(row.ticker)}
                    onToggle={() => toggle(row.ticker)}
                    onShowNews={() => {
                      setSelected([row.ticker]);
                      setShowNews(true);
                    }}
                    sim={sim[row.ticker]}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Signal Market News & Catalysts Section */}
      {showNews && (
        <div className="mt-6">
          <SignalNewsPanel
            selectedSymbols={selected}
            market={market}
            onClose={() => setShowNews(false)}
          />
        </div>
      )}

      {/* Monte Carlo Section */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Monte Carlo Simulation & Edge Stress-Test</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Select rows in the table above. Each simulated path resamples that symbol's own historical returns.
          Evaluates statistical probabilities for BUY, SELL, HOLD, or WATCH ratings.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Simulated Paths" value={paths} onChange={setPaths} />
          <NumberField label="Horizon Days" value={horizon} onChange={setHorizon} />
          <div className="flex items-end lg:col-span-2">
            <button
              type="button"
              disabled={simulating || selected.length === 0}
              onClick={() => void simulate()}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {simulating ? 'Simulating…' : `Run simulation${selected.length ? ` (${selected.length} selected)` : ' (Select symbols)'}`}
            </button>
          </div>
        </div>

        {!windowsMatch ? (
          <p className="mt-3 text-xs text-watch">Inputs changed. Generate signals again before simulating.</p>
        ) : null}

        {simError ? (
          <p className="mt-3 text-xs text-down" role="alert">
            {simError}
          </p>
        ) : null}

        {Object.keys(sim).length > 0 ? (
          <p className="num mt-3 text-xs text-muted">
            BUY {counts.BUY} · SELL {counts.SELL} · WATCH {counts.WATCH} · HOLD {counts.HOLD}
          </p>
        ) : null}

        <ul className="mt-4 grid gap-2 sm:grid-cols-2 border-t border-border pt-4">
          {GUIDE.map((item) => (
            <li key={item.signal} className="flex gap-2 text-xs text-muted">
              <SignalChip signal={item.signal} />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SignalTableRow({
  row,
  market,
  livePrice,
  checked,
  onToggle,
  onShowNews,
  sim,
}: {
  row: SignalRow;
  market: any;
  livePrice?: number;
  checked: boolean;
  onToggle: () => void;
  onShowNews?: () => void;
  sim?: SimResult;
}) {
  const bullish = row.crossover_type === 'bullish';
  const prevPriceRef = useRef(livePrice);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    if (livePrice != null && prevPriceRef.current != null) {
      if (livePrice > prevPriceRef.current) {
        setFlashClass('flash-price-up');
        setTimeout(() => setFlashClass(''), 1200);
      } else if (livePrice < prevPriceRef.current) {
        setFlashClass('flash-price-down');
        setTimeout(() => setFlashClass(''), 1200);
      }
    }
    prevPriceRef.current = livePrice;
  }, [livePrice]);

  return (
    <tr className={checked ? 'bg-surface-2' : 'hover:bg-surface transition-colors'}>
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          aria-label={`Select ${row.ticker}`}
          checked={checked}
          onChange={onToggle}
        />
      </td>
      <td className="num px-3 py-2.5 text-muted">{row.rank}</td>
      <td className="px-3 py-2.5 font-semibold text-fg">
        <div className="flex items-center gap-1.5">
          <span>{row.ticker}</span>
          {row.volume_sparse ? (
            <span className="rounded bg-amber-400/10 border border-amber-400/20 px-1 py-0.2 text-[10px] text-amber-400">
              Low Vol
            </span>
          ) : null}
          {onShowNews && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShowNews();
              }}
              className="rounded p-0.5 text-muted hover:text-primary hover:bg-surface-2 transition-colors ml-0.5"
              title={`Live News & Catalysts for ${row.ticker}`}
            >
              <Newspaper className="size-3" />
            </button>
          )}
        </div>
      </td>
      <td className="max-w-44 truncate px-3 py-2.5 text-muted" title={row.company}>
        {row.company}
      </td>
      {market === 'etfs' ? (
        <td className="px-3 py-2.5">
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted border border-border">
            {row.asset_tag || 'ETF'}
          </span>
        </td>
      ) : null}
      <td className="px-3 py-2.5">
        <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + (bullish ? 'tone-up' : 'tone-down')}>
          {bullish ? 'Bullish' : 'Bearish'}
        </span>
      </td>
      <td className="num px-3 py-2.5 whitespace-nowrap text-muted">{prettyDate(row.crossover_date)}</td>
      <td className={'num px-3 py-2.5 text-right font-medium text-fg ' + flashClass}>
        {formatPrice(livePrice ?? row.close, market, row.currency)}
      </td>
      <td className="num px-3 py-2.5 text-right text-muted">{formatPrice(row.close, market, row.currency)}</td>
      <td className="num px-3 py-2.5 text-right text-muted">{formatPrice(row.sma_short, market, row.currency)}</td>
      <td className="num px-3 py-2.5 text-right text-muted">{formatPrice(row.sma_long, market, row.currency)}</td>
      <td className="px-3 py-2.5">
        {sim ? (
          <div className="flex items-center gap-1.5" title={sim.reason}>
            <SignalChip signal={sim.signal} />
            <span className="num text-[11px] text-muted">
              ({Math.round(sim.p_up * 100)}% {sim.median_return > 0 ? '+' : ''}{(sim.median_return * 100).toFixed(0)}%)
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-muted italic">Not simulated</span>
        )}
      </td>
    </tr>
  );
}

function SignalChip({ signal }: { signal: 'BUY' | 'SELL' | 'HOLD' | 'WATCH' }) {
  const tone =
    signal === 'BUY'
      ? 'tone-up'
      : signal === 'SELL'
      ? 'tone-down'
      : signal === 'WATCH'
      ? 'tone-watch'
      : 'tone-hold';
  return <span className={'rounded px-1.5 py-0.5 text-[10px] font-bold ' + tone}>{signal}</span>;
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-muted">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
        className={fieldClass + ' mt-1'}
      />
    </div>
  );
}
