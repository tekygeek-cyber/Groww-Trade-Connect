import React, { useEffect, useState, useMemo } from 'react';
import {
  Newspaper,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ShieldCheck,
  Search,
  Globe,
  Radio,
  Clock,
  ArrowUpRight,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import type { MarketType } from '../types/market';
import { MARKETS } from '../data/universes';
import { api } from '../lib/api';

export interface GroundingSource {
  title: string;
  url: string;
  domain?: string;
}

export interface AssetNewsItem {
  symbol: string;
  name?: string;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  keyCatalyst: string;
  newsBullets: string[];
  impact: 'High' | 'Medium' | 'Low';
}

export interface MarketNewsResponse {
  headline: string;
  summary: string;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral' | 'Mixed';
  impactScore: number; // -100 to +100
  market: MarketType;
  symbols: string[];
  assets: AssetNewsItem[];
  sources: GroundingSource[];
  searchQueries?: string[];
  provider: string;
  timestamp: number;
}

export function MarketNewsPanel({ market }: { market: MarketType }) {
  const [data, setData] = useState<MarketNewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'Bullish' | 'Bearish' | 'Neutral'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const mktConfig = MARKETS[market];

  async function loadNews(forceRefresh: boolean = false) {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await api<MarketNewsResponse>(`/api/news/market?market=${market}${forceRefresh ? '&refresh=true' : ''}`);
      setData(res);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not fetch market news.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Reload when market changes
  useEffect(() => {
    loadNews(false);
  }, [market]);

  // Filtered assets
  const filteredAssets = useMemo(() => {
    if (!data?.assets) return [];
    return data.assets.filter((item) => {
      if (sentimentFilter !== 'all' && item.sentiment !== sentimentFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSym = item.symbol.toLowerCase().includes(q);
        const matchesName = item.name?.toLowerCase().includes(q);
        const matchesCat = item.keyCatalyst.toLowerCase().includes(q);
        return matchesSym || matchesName || matchesCat;
      }
      return true;
    });
  }, [data?.assets, sentimentFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header & Telemetry Bar */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Newspaper className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-fg">
                  {mktConfig.label} Market Intelligence
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <Sparkles className="size-3" />
                  Google Search Grounded
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Real-time financial web search and analyst catalyst tracking for {mktConfig.label} ({mktConfig.session})
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {data?.timestamp && (
              <span className="text-[11px] text-muted flex items-center gap-1">
                <Clock className="size-3" />
                Updated {new Date(data.timestamp).toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => loadNews(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Live News</span>
            </button>
          </div>
        </div>

        {/* Search Grounding Metadata Queries */}
        {data?.searchQueries && data.searchQueries.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3 text-xs">
            <span className="text-[11px] text-muted font-medium flex items-center gap-1">
              <Search className="size-3 text-primary" />
              Google Searches:
            </span>
            {data.searchQueries.map((q, idx) => (
              <span
                key={idx}
                className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-fg border border-border/50 font-mono"
              >
                "{q}"
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface text-muted">
          <RefreshCw className="size-7 animate-spin text-primary" />
          <p className="text-sm font-medium">Conducting real-time Google Search for {mktConfig.label} news...</p>
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
          <p className="text-sm font-bold text-rose-400">Failed to fetch live market news</p>
          <p className="text-xs text-muted max-w-md">{error}</p>
          <button
            type="button"
            onClick={() => loadNews(true)}
            className="rounded-lg bg-surface px-4 py-1.5 text-xs font-medium text-fg border border-border hover:bg-surface-2"
          >
            Retry News Query
          </button>
        </div>
      ) : data ? (
        <>
          {/* Zone 1: Macro Market Sentiment & Catalyst Overview */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-[280px]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    Macro Briefing
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                      data.sentiment === 'Bullish'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : data.sentiment === 'Bearish'
                        ? 'bg-rose-500/15 text-rose-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {data.sentiment === 'Bullish' ? (
                      <TrendingUp className="size-3.5" />
                    ) : data.sentiment === 'Bearish' ? (
                      <TrendingDown className="size-3.5" />
                    ) : (
                      <Minus className="size-3.5" />
                    )}
                    {data.sentiment} Outlook
                  </span>
                </div>
                <h3 className="text-base font-bold text-fg leading-snug">{data.headline}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted">{data.summary}</p>
              </div>

              {/* Impact Score Gauge Card */}
              <div className="w-full sm:w-56 shrink-0 rounded-xl border border-border bg-bg/50 p-3.5 text-xs">
                <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                  Market Impact Score
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className={`font-mono text-3xl font-bold ${
                      data.impactScore > 0
                        ? 'text-emerald-400'
                        : data.impactScore < 0
                        ? 'text-rose-400'
                        : 'text-fg'
                    }`}
                  >
                    {data.impactScore > 0 ? `+${data.impactScore}` : data.impactScore}
                  </span>
                  <span className="text-xs text-muted">/ 100</span>
                </div>

                {/* Meter Bar */}
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.impactScore > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.abs(data.impactScore))}%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted font-mono">
                  <span>-100 Bearish</span>
                  <span>0</span>
                  <span>+100 Bullish</span>
                </div>
              </div>
            </div>
          </div>

          {/* Zone 2: Asset-Specific Catalysts & Sentiment Tags */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Key Asset News & Technical Catalysts ({filteredAssets.length})
              </h3>

              {/* Sentiment filter and search */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter asset..."
                    className="h-7 w-32 rounded-lg border border-border bg-surface pl-7 pr-2 text-xs text-fg placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Sentiment Filter Tabs */}
                <div className="flex rounded-lg border border-border bg-surface p-0.5 text-xs">
                  {(['all', 'Bullish', 'Bearish', 'Neutral'] as const).map((filterVal) => (
                    <button
                      key={filterVal}
                      type="button"
                      onClick={() => setSentimentFilter(filterVal)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        sentimentFilter === filterVal
                          ? 'bg-primary text-primary-fg font-bold'
                          : 'text-muted hover:text-fg'
                      }`}
                    >
                      {filterVal === 'all' ? 'All' : filterVal}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Asset Cards Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.symbol}
                  className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 text-xs hover:border-border/90 transition-colors"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-base font-bold text-fg">{asset.symbol}</span>
                        {asset.name && (
                          <p className="text-[11px] text-muted truncate max-w-36">{asset.name}</p>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          asset.sentiment === 'Bullish'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : asset.sentiment === 'Bearish'
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-zinc-500/15 text-zinc-400'
                        }`}
                      >
                        {asset.sentiment === 'Bullish' ? '▲' : asset.sentiment === 'Bearish' ? '▼' : '●'}
                        {asset.sentiment}
                      </span>
                    </div>

                    {/* Catalyst Headline */}
                    <p className="mt-2.5 font-medium text-fg leading-relaxed text-[11px]">
                      {asset.keyCatalyst}
                    </p>

                    {/* Bullets */}
                    {asset.newsBullets && asset.newsBullets.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-muted list-disc list-inside">
                        {asset.newsBullets.map((bullet, bIdx) => (
                          <li key={bIdx} className="leading-tight">
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Impact badge footer */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2 text-[10px]">
                    <span className="text-muted">Impact:</span>
                    <span
                      className={`font-semibold ${
                        asset.impact === 'High'
                          ? 'text-primary'
                          : asset.impact === 'Medium'
                          ? 'text-fg'
                          : 'text-muted'
                      }`}
                    >
                      {asset.impact}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Zone 3: Curated Breaking Headline Stream with Verified External Sources */}
          {data.sources && data.sources.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-fg">Verified Source Citations & Articles</h3>
                </div>
                <span className="text-xs text-muted">
                  {data.sources.length} Google Search grounded sources
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                {data.sources.map((src, sIdx) => (
                  <a
                    key={sIdx}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col justify-between rounded-xl border border-border bg-bg/60 p-3.5 hover:border-primary/50 hover:bg-surface-2 transition-all group text-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                          {src.domain || 'news'}
                        </span>
                        <ExternalLink className="size-3 text-muted group-hover:text-primary transition-colors" />
                      </div>
                      <p className="font-medium text-fg line-clamp-2 group-hover:text-primary transition-colors">
                        {src.title}
                      </p>
                    </div>
                    <span className="mt-2 text-[10px] text-muted truncate">{src.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
