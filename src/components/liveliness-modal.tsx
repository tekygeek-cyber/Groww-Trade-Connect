import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Globe,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type { MarketType } from '../types/market';
import { api } from '../lib/api';

export interface ProviderLiveliness {
  id: string;
  name: string;
  market: MarketType;
  tradingMarket: string;
  tradingApiName: string;
  status: 'healthy' | 'degraded' | 'offline' | 'simulated';
  latencyMs: number;
  lastTickAt: number;
  errorCount: number;
  activeTransport: 'live_ws' | 'live_rest' | 'cached_rest' | 'sample_tape';
  symbolCount: number;
  notes: string;
}

export interface LivelinessData {
  providers: Record<string, ProviderLiveliness>;
  marketRouting: Record<
    MarketType,
    {
      brokerId: string;
      provider: string;
      tradingApi: string;
      status: string;
    }
  >;
}

export function LivelinessModal({
  isOpen,
  onClose,
  currentMarket,
  onNavigateToHealthTab,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentMarket: MarketType;
  onNavigateToHealthTab?: () => void;
}) {
  const [data, setData] = useState<LivelinessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [lastPinged, setLastPinged] = useState<string>('Just now');

  async function fetchLiveliness() {
    setLoading(true);
    try {
      const res = await api<LivelinessData>('/api/adapter/liveliness');
      setData(res);
      setLastPinged(new Date().toLocaleTimeString());
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handlePing() {
    setPinging(true);
    try {
      const res = await api<{ ok: boolean; providers: Record<string, ProviderLiveliness> }>(
        '/api/adapter/ping',
        { method: 'POST' }
      );
      if (res.providers && data) {
        setData({
          ...data,
          providers: res.providers,
        });
      }
      setLastPinged(new Date().toLocaleTimeString());
    } catch {
    } finally {
      setPinging(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLiveliness();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-fg">Trading API & Data Feeds Liveliness</h3>
              <p className="text-xs text-muted">
                Routing check across NSE (Groww), Crypto (Kraken), and NASDAQ/ETFs (eToro)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Top Status Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3.5 text-xs">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              <span className="text-muted">Current Active Market:</span>
              <span className="font-semibold text-fg uppercase">{currentMarket}</span>
              <span className="text-muted">·</span>
              <span className="text-muted">Primary Trading API:</span>
              <span className="font-mono font-medium text-primary">
                {currentMarket === 'nifty'
                  ? 'Groww GTT'
                  : currentMarket === 'crypto'
                  ? 'Kraken Pro'
                  : 'eToro Open API'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted">Last checked: {lastPinged}</span>
              <button
                type="button"
                onClick={handlePing}
                disabled={pinging}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-semibold text-primary-fg hover:opacity-95 disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${pinging ? 'animate-spin' : ''}`} />
                <span>Probe Latency</span>
              </button>
            </div>
          </div>

          {/* Provider Cards Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Market-Routed Provider Health
            </h4>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Groww Card */}
              {data?.providers.groww && (
                <div
                  className={`rounded-xl border p-4 text-xs transition-all ${
                    currentMarket === 'nifty'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-fg">Groww</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        data.providers.groww.status === 'healthy'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {data.providers.groww.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{data.providers.groww.tradingMarket}</p>

                  <div className="mt-3 space-y-1.5 border-t border-border pt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted">API:</span>
                      <span className="font-medium text-fg">GTT / OCO</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Round-trip:</span>
                      <span className="font-mono text-emerald-400 font-semibold">{data.providers.groww.latencyMs}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Transport:</span>
                      <span className="capitalize text-fg">{data.providers.groww.activeTransport.replace('_', ' ')}</span>
                    </div>
                  </div>
                  {currentMarket === 'nifty' && (
                    <div className="mt-2.5 rounded bg-primary/10 py-1 text-center text-[10px] font-semibold text-primary">
                      ✓ Active for this desk
                    </div>
                  )}
                </div>
              )}

              {/* Kraken Card */}
              {data?.providers.kraken && (
                <div
                  className={`rounded-xl border p-4 text-xs transition-all ${
                    currentMarket === 'crypto'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-fg">Kraken</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        data.providers.kraken.status === 'healthy'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {data.providers.kraken.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{data.providers.kraken.tradingMarket}</p>

                  <div className="mt-3 space-y-1.5 border-t border-border pt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted">API:</span>
                      <span className="font-medium text-fg">v0 REST & v2 WS</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Round-trip:</span>
                      <span className="font-mono text-emerald-400 font-semibold">{data.providers.kraken.latencyMs}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Transport:</span>
                      <span className="capitalize text-fg">{data.providers.kraken.activeTransport.replace('_', ' ')}</span>
                    </div>
                  </div>
                  {currentMarket === 'crypto' && (
                    <div className="mt-2.5 rounded bg-primary/10 py-1 text-center text-[10px] font-semibold text-primary">
                      ✓ Active for this desk
                    </div>
                  )}
                </div>
              )}

              {/* eToro Card */}
              {data?.providers.etoro && (
                <div
                  className={`rounded-xl border p-4 text-xs transition-all ${
                    currentMarket === 'nasdaq' || currentMarket === 'etfs'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-fg">eToro</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        data.providers.etoro.status === 'healthy'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {data.providers.etoro.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{data.providers.etoro.tradingMarket}</p>

                  <div className="mt-3 space-y-1.5 border-t border-border pt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted">API:</span>
                      <span className="font-medium text-fg">Bracket Trading</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Round-trip:</span>
                      <span className="font-mono text-emerald-400 font-semibold">{data.providers.etoro.latencyMs}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Transport:</span>
                      <span className="capitalize text-fg">{data.providers.etoro.activeTransport.replace('_', ' ')}</span>
                    </div>
                  </div>
                  {(currentMarket === 'nasdaq' || currentMarket === 'etfs') && (
                    <div className="mt-2.5 rounded bg-primary/10 py-1 text-center text-[10px] font-semibold text-primary">
                      ✓ Active for this desk
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Routing & Fallback Protocol Details */}
          <div className="rounded-xl border border-border bg-surface p-4 text-xs space-y-3">
            <h4 className="font-semibold text-fg">Failover & Fallback Cascade Architecture</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-surface-2 p-3 border border-border/60">
                <div className="flex items-center gap-1.5 font-semibold text-fg">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">
                    1
                  </span>
                  <span>Primary Live Stream</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Direct client WebSockets (Binance Stream / Kraken WS) & Live REST quotes with sub-100ms updates.
                </p>
              </div>

              <div className="rounded-lg bg-surface-2 p-3 border border-border/60">
                <div className="flex items-center gap-1.5 font-semibold text-fg">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">
                    2
                  </span>
                  <span>Adaptive REST Cache</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  15-second server-side cached polling via Stooq & Yahoo endpoints if socket drops.
                </p>
              </div>

              <div className="rounded-lg bg-surface-2 p-3 border border-border/60">
                <div className="flex items-center gap-1.5 font-semibold text-fg">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">
                    3
                  </span>
                  <span>Sample Snapshot Tape</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Built-in offline tape with synthetic live jitter ensuring zero-order risk and continuous testing.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3.5 bg-surface-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span>Zero Real Order Risk: All live triggers require explicit armed confirmation.</span>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToHealthTab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToHealthTab();
                }}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-fg hover:bg-surface-2 transition-colors"
              >
                Open Market Health Dashboard →
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-fg hover:opacity-95"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
