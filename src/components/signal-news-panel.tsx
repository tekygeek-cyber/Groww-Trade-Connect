import { useState, useEffect } from 'react';
import {
  Newspaper,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import type { MarketType } from '../types/market';
import { MARKETS } from '../data/universes';
import type { MarketNewsResponse } from '../../server/news-service';
import { api } from '../lib/api';

interface SignalNewsPanelProps {
  selectedSymbols: string[];
  market: MarketType;
  onClose?: () => void;
}

export function SignalNewsPanel({ selectedSymbols, market, onClose }: SignalNewsPanelProps) {
  const [data, setData] = useState<MarketNewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mktConfig = MARKETS[market];

  async function loadNews() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<MarketNewsResponse>('/api/news/signals', {
        method: 'POST',
        body: JSON.stringify({
          symbols: selectedSymbols,
          market,
        }),
      });
      setData(res);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not fetch market news.');
    } finally {
      setLoading(false);
    }
  }

  // Load news when selected symbols change (or on initial mount)
  useEffect(() => {
    loadNews();
  }, [market, selectedSymbols.slice().sort().join(',')]);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Newspaper className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-fg">Signal News & Catalysts</h2>
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted border border-border">
                <Sparkles className="size-2.5 text-primary" />
                Google Search Grounded
              </span>
            </div>
            <p className="text-xs text-muted">
              {selectedSymbols.length > 0
                ? `Analyzing live catalysts & newsflow for ${selectedSymbols.length} selected signal${selectedSymbols.length > 1 ? 's' : ''}: ${selectedSymbols.join(', ')}`
                : `Tracking breaking catalysts and newsflow across ${mktConfig.label} universe leaders`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadNews}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={'size-3 ' + (loading ? 'animate-spin' : '')} />
            {loading ? 'Searching…' : 'Refresh News'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-bg px-2.5 text-xs text-muted hover:text-fg"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-down/30 bg-down/10 px-3.5 py-2.5 text-xs text-down">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state skeleton */}
      {loading && !data && (
        <div className="mt-5 space-y-3">
          <div className="h-16 w-full animate-pulse rounded-lg bg-surface-2" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-28 animate-pulse rounded-lg bg-surface-2" />
            <div className="h-28 animate-pulse rounded-lg bg-surface-2" />
          </div>
        </div>
      )}

      {/* Main Content */}
      {data && (
        <div className="mt-4 space-y-5">
          {/* Executive Briefing Banner */}
          <div className="rounded-lg border border-border/70 bg-bg p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SentimentChip sentiment={data.sentiment} />
                <span className="num text-xs text-muted">
                  Impact score:{' '}
                  <span className={data.impactScore >= 0 ? 'text-up font-medium' : 'text-down font-medium'}>
                    {data.impactScore > 0 ? `+${data.impactScore}` : data.impactScore} / 100
                  </span>
                </span>
              </div>
              <span className="text-[11px] text-muted">
                Source: <span className="text-fg">{data.provider}</span> · {new Date(data.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <h3 className="mt-2.5 text-sm font-semibold text-fg leading-snug">{data.headline}</h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">{data.summary}</p>
          </div>

          {/* Asset-Specific Catalyst Cards */}
          <div>
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">
              Asset News & Catalyst Breakdown
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.assets.map((asset) => (
                <div
                  key={asset.symbol}
                  className="rounded-lg border border-border bg-bg/80 p-3.5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="num font-semibold text-sm text-fg">{asset.symbol}</span>
                        {asset.name && <span className="text-xs text-muted truncate max-w-44">({asset.name})</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={
                            'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                            (asset.impact === 'High'
                              ? 'bg-primary/10 text-primary border border-primary/20'
                              : 'bg-surface-2 text-muted border border-border')
                          }
                        >
                          {asset.impact} Impact
                        </span>
                        <SentimentChip sentiment={asset.sentiment} compact />
                      </div>
                    </div>

                    <p className="mt-2 text-xs font-medium text-fg/90 leading-snug">{asset.keyCatalyst}</p>

                    {asset.newsBullets && asset.newsBullets.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-muted border-t border-border/50 pt-2">
                        {asset.newsBullets.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grounded Web Sources */}
          {data.sources && data.sources.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-bg/60 p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                  Grounded News Sources ({data.sources.length})
                </span>
                <span className="text-[10px] text-muted">Verified external coverage</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-fg hover:border-primary hover:text-primary transition-colors max-w-xs truncate"
                    title={src.title}
                  >
                    <span className="truncate">{src.title}</span>
                    {src.domain && <span className="text-[10px] text-muted font-mono shrink-0">({src.domain})</span>}
                    <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SentimentChip({
  sentiment,
  compact = false,
}: {
  sentiment: 'Bullish' | 'Bearish' | 'Neutral' | 'Mixed';
  compact?: boolean;
}) {
  const isBull = sentiment === 'Bullish';
  const isBear = sentiment === 'Bearish';

  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded font-medium ' +
        (compact ? 'px-1.5 py-0.5 text-[10px] ' : 'px-2 py-0.5 text-xs ') +
        (isBull
          ? 'tone-up'
          : isBear
          ? 'tone-down'
          : 'bg-surface-2 text-muted border border-border')
      }
    >
      {isBull ? (
        <TrendingUp className="size-2.5" />
      ) : isBear ? (
        <TrendingDown className="size-2.5" />
      ) : (
        <Minus className="size-2.5" />
      )}
      {sentiment}
    </span>
  );
}
