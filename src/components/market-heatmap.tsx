import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Flame,
  Layers,
  Maximize2,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { MarketType, QuoteStatus } from '../types/market';
import { useMarketQuotes } from '../lib/quotes-context';
import { api } from '../lib/api';

export interface HeatmapItem {
  ticker: string;
  name: string;
  market: MarketType;
  sector: string;
  price: number;
  changePct: number;
  marketCap: number;
  volume: number;
  status: QuoteStatus;
  provider: 'groww' | 'kraken' | 'etoro' | 'fallback_stooq';
  currencySymbol: string;
}

export interface HeatmapSectorGroup {
  name: string;
  marketCap: number;
  avgChangePct: number;
  children: HeatmapItem[];
}

export interface MarketHeatmapPayload {
  market: MarketType;
  marketLabel: string;
  currencySymbol: string;
  totalMarketCap: number;
  sectors: HeatmapSectorGroup[];
  liveliness: {
    id: string;
    name: string;
    market: MarketType;
    tradingMarket: string;
    tradingApiName: string;
    status: 'healthy' | 'degraded' | 'offline' | 'simulated';
    latencyMs: number;
    lastTickAt: number;
    activeTransport: string;
  };
  timestamp: number;
}

interface D3HierarchyNode {
  name: string;
  marketCap?: number;
  changePct?: number;
  item?: HeatmapItem;
  children?: D3HierarchyNode[];
}

export function MarketHeatmap() {
  const { market } = useMarketQuotes();
  const [data, setData] = useState<MarketHeatmapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<HeatmapItem | null>(null);
  const [metric, setMetric] = useState<'marketCap' | 'volume'>('marketCap');
  const [hoveredNode, setHoveredNode] = useState<{
    item: HeatmapItem;
    x: number;
    y: number;
  } | null>(null);
  const [pinging, setPinging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch heatmap data from the unified DataAdapter
  async function loadHeatmapData() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<MarketHeatmapPayload>(`/api/adapter/heatmap?market=${market}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load heatmap data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHeatmapData();
  }, [market]);

  // Ping providers to measure live round-trip liveliness
  async function handlePing() {
    setPinging(true);
    try {
      await api('/api/adapter/ping', { method: 'POST' });
      await loadHeatmapData();
    } catch {
    } finally {
      setPinging(false);
    }
  }

  // Filtered dataset
  const filteredData = useMemo(() => {
    if (!data) return null;
    const q = searchQuery.trim().toLowerCase();

    const sectors = data.sectors
      .map((sector) => {
        if (selectedSector && sector.name !== selectedSector) return null;

        const children = sector.children.filter((child) => {
          if (!q) return true;
          return (
            child.ticker.toLowerCase().includes(q) ||
            child.name.toLowerCase().includes(q) ||
            child.sector.toLowerCase().includes(q)
          );
        });

        if (children.length === 0) return null;

        const totalMcap = children.reduce((sum, c) => sum + (metric === 'marketCap' ? c.marketCap : c.volume), 0);
        return {
          ...sector,
          marketCap: totalMcap,
          children,
        };
      })
      .filter(Boolean) as HeatmapSectorGroup[];

    return {
      ...data,
      sectors,
    };
  }, [data, searchQuery, selectedSector, metric]);

  // D3 Treemap rendering logic
  useEffect(() => {
    if (!filteredData || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 980;
    const height = Math.max(540, Math.min(760, Math.floor(width * 0.58)));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    // Build hierarchy root
    const rootData: D3HierarchyNode = {
      name: filteredData.marketLabel,
      children: filteredData.sectors.map((sec) => ({
        name: sec.name,
        children: sec.children.map((item) => ({
          name: item.ticker,
          marketCap: metric === 'marketCap' ? item.marketCap : item.volume,
          changePct: item.changePct,
          item,
        })),
      })),
    };

    const root = d3
      .hierarchy<D3HierarchyNode>(rootData)
      .sum((d) => (d.marketCap ? d.marketCap : 0))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // D3 Treemap squarify layout
    const treemapLayout = d3
      .treemap<D3HierarchyNode>()
      .size([width, height])
      .paddingOuter(3)
      .paddingTop(22)
      .paddingInner(2)
      .round(true);

    const layoutRoot = treemapLayout(root);

    // Color mapper based on change %
    function getColor(changePct: number): string {
      if (changePct >= 4.0) return '#15803d'; // deep bright green
      if (changePct >= 2.0) return '#16a34a'; // strong green
      if (changePct >= 0.5) return '#22c55e'; // light green
      if (changePct > -0.5) return '#27272a'; // neutral dark slate
      if (changePct > -2.0) return '#f87171'; // light red
      if (changePct > -4.0) return '#dc2626'; // medium red
      return '#991b1b'; // deep crimson
    }

    // Sector group headers
    const sectorGroups = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<D3HierarchyNode>>('g.sector')
      .data(layoutRoot.children || [])
      .enter()
      .append('g')
      .attr('class', 'sector')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    // Sector header background
    sectorGroups
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', 20)
      .attr('fill', '#18181b')
      .attr('stroke', '#27272a')
      .attr('stroke-width', 0.5);

    // Sector header text label
    sectorGroups
      .append('text')
      .attr('x', 6)
      .attr('y', 14)
      .text((d) => {
        const w = d.x1 - d.x0;
        if (w < 80) return '';
        const name = d.data.name;
        return w < 160 && name.length > 14 ? name.slice(0, 12) + '…' : name;
      })
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', '#a1a1aa')
      .attr('font-family', 'ui-sans-serif, system-ui, sans-serif');

    // Leaf nodes (stocks / coins)
    const leaves = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<D3HierarchyNode>>('g.leaf')
      .data(layoutRoot.leaves())
      .enter()
      .append('g')
      .attr('class', 'leaf cursor-pointer')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    // Tile rectangle
    leaves
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d) => getColor(d.data.changePct || 0))
      .attr('stroke', '#09090b')
      .attr('stroke-width', 1.5)
      .attr('rx', 2)
      .attr('class', 'transition-all hover:brightness-125')
      .on('mouseenter', function (event, d) {
        if (!d.data.item) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHoveredNode({
            item: d.data.item,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mousemove', function (event, d) {
        if (!d.data.item) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHoveredNode({
            item: d.data.item,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mouseleave', function () {
        setHoveredNode(null);
      })
      .on('click', function (_event, d) {
        if (d.data.item) {
          setSelectedItem(d.data.item);
        }
      });

    // Stock Symbol Label
    leaves
      .append('text')
      .attr('x', (d) => (d.x1 - d.x0) / 2)
      .attr('y', (d) => {
        const h = d.y1 - d.y0;
        return h >= 48 ? (d.y1 - d.y0) / 2 - 5 : (d.y1 - d.y0) / 2 + 4;
      })
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 34 || h < 22) return '0px';
        if (w < 50 || h < 35) return '10px';
        if (w < 90 || h < 55) return '12px';
        return '14px';
      })
      .attr('font-weight', '700')
      .attr('fill', '#ffffff')
      .attr('pointer-events', 'none')
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 34 || h < 20) return '';
        return d.data.name;
      });

    // % Change Subtext
    leaves
      .append('text')
      .attr('x', (d) => (d.x1 - d.x0) / 2)
      .attr('y', (d) => (d.y1 - d.y0) / 2 + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 48 || h < 42) return '0px';
        return '11px';
      })
      .attr('font-weight', '500')
      .attr('fill', '#f4f4f5')
      .attr('pointer-events', 'none')
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 48 || h < 42) return '';
        const pct = d.data.changePct || 0;
        return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
      });
  }, [filteredData, metric]);

  const liveliness = data?.liveliness;

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        {/* Left: Market title & Liveliness Badge */}
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Flame className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-fg">
                {data?.marketLabel || 'Market'} Treemap Heatmap
              </h2>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted uppercase">
                D3 Squarified
              </span>
            </div>
            <p className="text-xs text-muted">
              Box area represents relative {metric === 'marketCap' ? 'market cap' : 'trading volume'} · Color indicates % change
            </p>
          </div>
        </div>

        {/* Right: Provider Liveliness Indicator & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Liveliness Status Chip */}
          {liveliness && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                liveliness.status === 'healthy'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : liveliness.status === 'simulated'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
              }`}
            >
              <div
                className={`size-2 rounded-full ${
                  liveliness.status === 'healthy'
                    ? 'bg-emerald-400 animate-pulse'
                    : liveliness.status === 'simulated'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              />
              <span className="font-semibold">{liveliness.tradingMarket}</span>
              <span className="text-muted">·</span>
              <span className="font-mono text-[11px]">{liveliness.latencyMs}ms</span>
              <span className="text-muted">·</span>
              <span className="capitalize">{liveliness.activeTransport.replace('_', ' ')}</span>
            </div>
          )}

          {/* Test Ping Button */}
          <button
            type="button"
            onClick={handlePing}
            disabled={pinging}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface hover:border-primary/50 transition-colors disabled:opacity-50"
            title="Ping broker & data feeds to measure live latency"
          >
            <RefreshCw className={`size-3 text-primary ${pinging ? 'animate-spin' : ''}`} />
            <span>Ping Feeds</span>
          </button>

          {/* Metric Selector Toggle */}
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMetric('marketCap')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                metric === 'marketCap' ? 'bg-primary text-primary-fg shadow-xs' : 'text-muted hover:text-fg'
              }`}
            >
              Market Cap
            </button>
            <button
              type="button"
              onClick={() => setMetric('volume')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                metric === 'volume' ? 'bg-primary text-primary-fg shadow-xs' : 'text-muted hover:text-fg'
              }`}
            >
              Volume
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Legend Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative min-w-[220px] max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticker, company or sector..."
            className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-fg placeholder:text-muted focus:border-primary focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sector Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto max-w-full pb-1">
          <button
            type="button"
            onClick={() => setSelectedSector(null)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              selectedSector === null
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-surface text-muted border border-border hover:text-fg'
            }`}
          >
            All Sectors ({data?.sectors.length || 0})
          </button>
          {data?.sectors.slice(0, 7).map((sec) => (
            <button
              key={sec.name}
              type="button"
              onClick={() => setSelectedSector(selectedSector === sec.name ? null : sec.name)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                selectedSector === sec.name
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-surface text-muted border border-border hover:text-fg'
              }`}
            >
              {sec.name}
              <span className={`ml-1 text-[10px] ${sec.avgChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {sec.avgChangePct >= 0 ? '+' : ''}
                {sec.avgChangePct}%
              </span>
            </button>
          ))}
        </div>

        {/* Heatmap Legend */}
        <div className="flex items-center gap-1 text-[11px] text-muted">
          <span>-4%</span>
          <div className="flex h-3 w-28 overflow-hidden rounded-xs border border-border">
            <div className="h-full w-1/5 bg-[#991b1b]" title="≤ -4%" />
            <div className="h-full w-1/5 bg-[#dc2626]" title="-2%" />
            <div className="h-full w-1/5 bg-[#27272a]" title="0%" />
            <div className="h-full w-1/5 bg-[#16a34a]" title="+2%" />
            <div className="h-full w-1/5 bg-[#15803d]" title="≥ +4%" />
          </div>
          <span>+4%</span>
        </div>
      </div>

      {/* Main Treemap Canvas Container */}
      <div
        ref={containerRef}
        className="relative min-h-[540px] w-full rounded-xl border border-border bg-[#0d0e12] p-2 shadow-inner overflow-hidden"
      >
        {loading ? (
          <div className="flex h-[540px] flex-col items-center justify-center gap-3 text-muted">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <p className="text-sm">Calculating D3 squarified layout across {market} universe...</p>
          </div>
        ) : error ? (
          <div className="flex h-[540px] flex-col items-center justify-center gap-2 text-rose-400">
            <p className="text-sm font-medium">Failed to load market treemap</p>
            <p className="text-xs text-muted">{error}</p>
            <button
              type="button"
              onClick={loadHeatmapData}
              className="mt-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg hover:bg-surface-2"
            >
              Retry
            </button>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full select-none" />
        )}

        {/* Hover Tooltip Float */}
        {hoveredNode && (
          <div
            className="pointer-events-none absolute z-30 w-64 -translate-x-1/2 -translate-y-full transform rounded-lg border border-border/80 bg-surface/95 p-3 shadow-xl backdrop-blur text-xs"
            style={{
              left: Math.max(130, Math.min(hoveredNode.x, (containerRef.current?.clientWidth || 900) - 130)),
              top: Math.max(10, hoveredNode.y - 12),
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-sm font-bold text-fg">{hoveredNode.item.ticker}</span>
                <p className="text-[11px] text-muted truncate max-w-40">{hoveredNode.item.name}</p>
              </div>
              <div
                className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                  hoveredNode.item.changePct >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                {hoveredNode.item.changePct >= 0 ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {hoveredNode.item.changePct >= 0 ? '+' : ''}
                {hoveredNode.item.changePct.toFixed(2)}%
              </div>
            </div>

            <div className="mt-2.5 space-y-1 border-t border-border/60 pt-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">Price:</span>
                <span className="font-mono font-medium text-fg">
                  {hoveredNode.item.currencySymbol}
                  {hoveredNode.item.price.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Sector:</span>
                <span className="text-fg truncate max-w-32">{hoveredNode.item.sector}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Market Cap:</span>
                <span className="font-mono text-muted">
                  {market === 'nifty'
                    ? `₹${hoveredNode.item.marketCap.toLocaleString()} Cr`
                    : `$${hoveredNode.item.marketCap.toLocaleString()} B`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Routed Broker:</span>
                <span className="text-primary font-medium capitalize">{hoveredNode.item.provider}</span>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-muted italic text-center">Click tile to inspect trading details</p>
          </div>
        )}
      </div>

      {/* Selected Item Modal / Drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-fg">{selectedItem.ticker}</h3>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {selectedItem.market.toUpperCase()}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium ${
                      selectedItem.changePct >= 0
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {selectedItem.changePct >= 0 ? '+' : ''}
                    {selectedItem.changePct.toFixed(2)}%
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">{selectedItem.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg"
              >
                ✕
              </button>
            </div>

            {/* Price & Details Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border bg-bg p-3">
                <span className="text-muted">Last Price</span>
                <p className="mt-1 font-mono text-lg font-bold text-fg">
                  {selectedItem.currencySymbol}
                  {selectedItem.price.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <span className="text-muted">Sector</span>
                <p className="mt-1 font-medium text-fg truncate">{selectedItem.sector}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <span className="text-muted">Estimated Market Cap</span>
                <p className="mt-1 font-mono text-sm font-semibold text-fg">
                  {selectedItem.market === 'nifty'
                    ? `₹${selectedItem.marketCap.toLocaleString()} Cr`
                    : `$${selectedItem.marketCap.toLocaleString()} B`}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-3">
                <span className="text-muted">Estimated 24h Volume</span>
                <p className="mt-1 font-mono text-sm font-semibold text-fg">
                  {selectedItem.volume.toLocaleString()} units
                </p>
              </div>
            </div>

            {/* Broker API Routing Information */}
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                <span className="font-semibold text-primary">Live Broker Routing</span>
              </div>
              <p className="mt-1.5 text-muted">
                Trading orders for <strong className="text-fg">{selectedItem.ticker}</strong> are routed strictly via{' '}
                <strong className="text-primary capitalize">{selectedItem.provider}</strong>.
              </p>
              <div className="mt-2.5 flex items-center justify-between text-[11px]">
                <span className="text-muted">Target Broker:</span>
                <span className="font-mono text-fg font-medium">
                  {selectedItem.market === 'nifty'
                    ? 'Groww (NSE India)'
                    : selectedItem.market === 'crypto'
                    ? 'Kraken Pro (v0/v2)'
                    : 'eToro Open API'}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted">Execution Mode:</span>
                <span className="font-mono text-emerald-400 font-medium">Paper Sandbox & Live Ready</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="flex-1 rounded-lg border border-border bg-surface-2 py-2 text-xs font-medium text-fg hover:bg-surface"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedItem(null);
                  // Quick trigger event or alert
                  alert(`Ready to place conditional order for ${selectedItem.ticker} on ${selectedItem.market === 'nifty' ? 'Groww' : selectedItem.market === 'crypto' ? 'Kraken' : 'eToro'}. Open the Algo Signals or GTT tab.`);
                }}
                className="flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-fg hover:opacity-95"
              >
                Trade on {selectedItem.market === 'nifty' ? 'Groww' : selectedItem.market === 'crypto' ? 'Kraken' : 'eToro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
