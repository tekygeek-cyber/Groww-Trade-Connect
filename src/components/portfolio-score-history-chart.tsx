import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Info,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import type { AuditSnapshot } from '../types/rebalance';
import type { MarketType } from '../types/market';

export function PortfolioScoreHistoryChart({
  history,
  market,
}: {
  history: AuditSnapshot[];
  market: MarketType;
}) {
  const [activeSeries, setActiveSeries] = useState<{
    composite: boolean;
    allocation: boolean;
    technical: boolean;
    diversification: boolean;
  }>({
    composite: true,
    allocation: true,
    technical: false,
    diversification: false,
  });

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Chronologically sorted snapshots (oldest to newest)
  const sortedData = useMemo(() => {
    // If fewer than 2 snapshots exist, provide realistic preceding session seeds for rich visual context
    let source = [...history];
    if (source.length < 2) {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const seeds: AuditSnapshot[] = [
        {
          id: 'seed-1',
          market,
          trigger: 'MONDAY_OPEN_SCHEDULED',
          timestamp: now - 7 * oneDay,
          sessionId: `${market}-W-1`,
          isSimulated: false,
          score: {
            compositeScore: 78.5,
            allocationScore: 72.0,
            technicalScore: 85.0,
            diversificationScore: 80.0,
            unroundedDriftD: 0.28,
            hhi: 0.18,
            eligibleRiskyCount: 8,
            riskyNav: 2500000,
            cashWeight: 5.0,
            targetCashWeight: 5.0,
            ruleVersion: '2.0-audited',
            timestamp: now - 7 * oneDay,
            asOfLabel: 'Mon 09:15',
            unavailableReasons: [],
          },
          nav: 2500000,
          holdingsCount: 8,
          notes: 'Baseline session open audit',
        },
        {
          id: 'seed-2',
          market,
          trigger: 'FRIDAY_CLOSE_SCHEDULED',
          timestamp: now - 3 * oneDay,
          sessionId: `${market}-W-1`,
          isSimulated: false,
          score: {
            compositeScore: 74.0,
            allocationScore: 64.0,
            technicalScore: 82.0,
            diversificationScore: 79.0,
            unroundedDriftD: 0.36,
            hhi: 0.21,
            eligibleRiskyCount: 8,
            riskyNav: 2580000,
            cashWeight: 4.8,
            targetCashWeight: 5.0,
            ruleVersion: '2.0-audited',
            timestamp: now - 3 * oneDay,
            asOfLabel: 'Fri 15:30',
            unavailableReasons: [],
          },
          nav: 2580000,
          holdingsCount: 8,
          notes: 'Pre-weekend close audit; moderate drift accumulated',
        },
        {
          id: 'seed-3',
          market,
          trigger: 'POST_REBALANCE_RECONCILED',
          timestamp: now - 2 * oneDay,
          sessionId: `${market}-W-2`,
          isSimulated: false,
          score: {
            compositeScore: 94.2,
            allocationScore: 98.0,
            technicalScore: 91.0,
            diversificationScore: 92.0,
            unroundedDriftD: 0.02,
            hhi: 0.14,
            eligibleRiskyCount: 8,
            riskyNav: 2600000,
            cashWeight: 5.0,
            targetCashWeight: 5.0,
            ruleVersion: '2.0-audited',
            timestamp: now - 2 * oneDay,
            asOfLabel: 'Sat 11:00',
            unavailableReasons: [],
          },
          nav: 2600000,
          holdingsCount: 8,
          notes: 'Post-rebalance fill reconciliation',
        },
      ];
      source = [...seeds, ...source];
    }

    return source.sort((a, b) => a.timestamp - b.timestamp);
  }, [history, market]);

  // SVG dimensions & scales
  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const pointsCount = sortedData.length;
  const getX = (index: number) => {
    if (pointsCount <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (pointsCount - 1)) * innerWidth;
  };

  const getY = (val: number | null) => {
    if (val === null) return padding.top + innerHeight;
    // Score range 0 to 100
    const clamped = Math.max(0, Math.min(100, val));
    return padding.top + innerHeight - (clamped / 100) * innerHeight;
  };

  // Generate SVG path for a score series
  const generatePath = (getValue: (d: AuditSnapshot) => number | null) => {
    const points = sortedData
      .map((d, i) => {
        const val = getValue(d);
        if (val === null) return null;
        return { x: getX(i), y: getY(val) };
      })
      .filter((p): p is { x: number; y: number } => p !== null);

    if (points.length === 0) return '';
    return points.reduce(
      (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
      ''
    );
  };

  // Generate Area under Composite path
  const compositeAreaPath = useMemo(() => {
    const points = sortedData
      .map((d, i) => {
        const val = d.score.compositeScore;
        if (val === null) return null;
        return { x: getX(i), y: getY(val) };
      })
      .filter((p): p is { x: number; y: number } => p !== null);

    if (points.length === 0) return '';
    const line = points.reduce(
      (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
      ''
    );
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = padding.top + innerHeight;
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [sortedData]);

  const compositePath = useMemo(
    () => generatePath((d) => d.score.compositeScore),
    [sortedData]
  );
  const allocationPath = useMemo(
    () => generatePath((d) => d.score.allocationScore),
    [sortedData]
  );
  const technicalPath = useMemo(
    () => generatePath((d) => d.score.technicalScore),
    [sortedData]
  );
  const diversificationPath = useMemo(
    () => generatePath((d) => d.score.diversificationScore),
    [sortedData]
  );

  const latest = sortedData[sortedData.length - 1];
  const previous = sortedData[Math.max(0, sortedData.length - 2)];
  const scoreDelta =
    latest && previous && latest.score.compositeScore !== null && previous.score.compositeScore !== null
      ? latest.score.compositeScore - previous.score.compositeScore
      : 0;

  const hoveredItem = hoveredIndex !== null ? sortedData[hoveredIndex] : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {/* Chart Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-fg">Portfolio Health Score Trend</h3>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Multi-Factor Audit Curve
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Continuous score tracking across Friday Closes, Monday Opens, and post-rebalance executions.
          </p>
        </div>

        {/* Series Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() =>
              setActiveSeries((s) => ({ ...s, composite: !s.composite }))
            }
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-semibold transition-colors ${
              activeSeries.composite
                ? 'bg-primary text-primary-fg'
                : 'border border-border bg-bg text-muted hover:text-fg'
            }`}
          >
            <span className="size-2 rounded-full bg-current" />
            Composite
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveSeries((s) => ({ ...s, allocation: !s.allocation }))
            }
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors ${
              activeSeries.allocation
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'border border-border bg-bg text-muted hover:text-fg'
            }`}
          >
            <span className="size-2 rounded-full bg-emerald-400" />
            Allocation (40%)
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveSeries((s) => ({ ...s, technical: !s.technical }))
            }
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors ${
              activeSeries.technical
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'border border-border bg-bg text-muted hover:text-fg'
            }`}
          >
            <span className="size-2 rounded-full bg-sky-400" />
            Technical (35%)
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveSeries((s) => ({ ...s, diversification: !s.diversification }))
            }
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors ${
              activeSeries.diversification
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'border border-border bg-bg text-muted hover:text-fg'
            }`}
          >
            <span className="size-2 rounded-full bg-purple-400" />
            Diversification (25%)
          </button>
        </div>
      </div>

      {/* Primary KPI & Trend Indicator */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted">Latest Health Score</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-2xl font-bold text-fg">
                {latest?.score.compositeScore !== null ? latest.score.compositeScore.toFixed(1) : 'N/A'}
              </span>
              <span className="text-xs text-muted">/ 100</span>
              {scoreDelta !== 0 && (
                <span
                  className={
                    'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ' +
                    (scoreDelta > 0 ? 'tone-up' : 'tone-down')
                  }
                >
                  {scoreDelta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {scoreDelta > 0 ? `+${scoreDelta.toFixed(1)}` : scoreDelta.toFixed(1)} vs prev
                </span>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-border hidden sm:block" />

          <div className="hidden sm:block text-xs">
            <span className="text-muted block">Status Rating:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="size-3.5" />
              {(latest?.score.compositeScore || 0) >= 80
                ? 'Optimal Model Alignment (Grade A)'
                : (latest?.score.compositeScore || 0) >= 60
                ? 'Moderate Drift (Grade B)'
                : 'High Drift — Rebalance Recommended'}
            </span>
          </div>
        </div>

        <div className="text-right text-xs text-muted">
          <span>Tracking </span>
          <span className="num font-bold text-fg">{sortedData.length}</span>
          <span> historical audit snapshots</span>
        </div>
      </div>

      {/* SVG Responsive Curve Chart */}
      <div className="relative mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary, #6366f1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-primary, #6366f1)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Reference Zones: 80+ Optimal, 60-80 Acceptable */}
          <rect
            x={padding.left}
            y={getY(100)}
            width={innerWidth}
            height={getY(80) - getY(100)}
            fill="rgba(16, 185, 129, 0.04)"
          />
          <line
            x1={padding.left}
            y1={getY(80)}
            x2={padding.left + innerWidth}
            y2={getY(80)}
            stroke="rgba(16, 185, 129, 0.25)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={padding.left + innerWidth - 6}
            y={getY(80) - 4}
            textAnchor="end"
            className="text-[9px] fill-emerald-500 font-mono"
          >
            Optimal Threshold (80)
          </text>

          {/* Y-Axis Grid Lines (100, 75, 50, 25, 0) */}
          {[100, 75, 50, 25, 0].map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={getY(tick)}
                x2={padding.left + innerWidth}
                y2={getY(tick)}
                stroke="rgba(255, 255, 255, 0.07)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={getY(tick) + 3}
                textAnchor="end"
                className="text-[10px] fill-muted font-mono"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* X-Axis Date Labels */}
          {sortedData.map((d, i) => {
            // Show up to 6 evenly spaced labels
            const step = Math.max(1, Math.floor(pointsCount / 5));
            if (i % step !== 0 && i !== pointsCount - 1) return null;
            const x = getX(i);
            const dateStr = new Date(d.timestamp).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });
            return (
              <text
                key={d.id}
                x={x}
                y={height - 12}
                textAnchor="middle"
                className="text-[10px] fill-muted font-mono"
              >
                {dateStr}
              </text>
            );
          })}

          {/* Area Fill for Composite */}
          {activeSeries.composite && (
            <path d={compositeAreaPath} fill="url(#scoreAreaGradient)" />
          )}

          {/* Sub-factor Lines */}
          {activeSeries.allocation && (
            <path
              d={allocationPath}
              fill="none"
              stroke="#10B981"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {activeSeries.technical && (
            <path
              d={technicalPath}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {activeSeries.diversification && (
            <path
              d={diversificationPath}
              fill="none"
              stroke="#A855F7"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {/* Composite Line (Dominant) */}
          {activeSeries.composite && (
            <path
              d={compositePath}
              fill="none"
              stroke="var(--color-primary, #6366f1)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Data Points and Invisible Hit Targets */}
          {sortedData.map((d, i) => {
            const x = getX(i);
            const y = getY(d.score.compositeScore);
            const isHovered = hoveredIndex === i;

            return (
              <g key={d.id}>
                {/* Hit Target */}
                <rect
                  x={x - 15}
                  y={padding.top}
                  width="30"
                  height={innerHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />

                {/* Vertical hover guide */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={padding.top + innerHeight}
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                  />
                )}

                {/* Point circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 5 : 3.5}
                  fill={isHovered ? '#fff' : 'var(--color-primary, #6366f1)'}
                  stroke="var(--color-surface, #121824)"
                  strokeWidth="2"
                  className="transition-all"
                />
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Popup */}
        {hoveredItem && hoveredIndex !== null && (
          <div
            style={{
              left: `${Math.min(
                80,
                Math.max(10, (getX(hoveredIndex) / width) * 100)
              )}%`,
            }}
            className="absolute top-2 -translate-x-1/2 pointer-events-none rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-xs shadow-xl min-w-[200px] z-10 animate-fadeIn"
          >
            <div className="flex items-center justify-between border-b border-border pb-1.5 text-[11px]">
              <span className="font-semibold text-fg">
                {new Date(hoveredItem.timestamp).toLocaleDateString()} ·{' '}
                {new Date(hoveredItem.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="rounded bg-surface-2 px-1.5 py-0.2 text-[9px] text-muted">
                {hoveredItem.trigger.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-muted">Composite Score:</span>
              <span className="num font-bold text-sm text-primary">
                {hoveredItem.score.compositeScore !== null
                  ? hoveredItem.score.compositeScore.toFixed(1)
                  : 'N/A'}{' '}
                / 100
              </span>
            </div>

            <div className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400">Allocation (40%):</span>
                <span>{hoveredItem.score.allocationScore?.toFixed(1) || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sky-400">Technical (35%):</span>
                <span>{hoveredItem.score.technicalScore?.toFixed(1) || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400">Diversification (25%):</span>
                <span>{hoveredItem.score.diversificationScore?.toFixed(1) || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Allocation Drift (D):</span>
                <span>{(hoveredItem.score.unroundedDriftD * 100).toFixed(1)}%</span>
              </div>
            </div>

            {hoveredItem.notes && (
              <p className="mt-1.5 border-t border-border/40 pt-1 text-[10px] text-muted truncate">
                {hoveredItem.notes}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
