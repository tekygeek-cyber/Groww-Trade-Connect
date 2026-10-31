import { useState, useEffect } from 'react';
import { Shield, Key, CheckCircle, RefreshCw, X, ExternalLink, Cpu, Layers } from 'lucide-react';
import { api } from '../lib/api';

export interface BrokerInfo {
  id: 'groww' | 'kraken' | 'etoro';
  name: string;
  market: string;
  currency: string;
  mode: 'live' | 'paper';
  configured: boolean;
  accountName: string;
  activeTriggersCount: number;
  supportedOrderTypes: string[];
  notes: string;
}

interface BrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function BrokerStatusModal({ isOpen, onClose, onUpdate }: BrokerModalProps) {
  const [brokers, setBrokers] = useState<Record<string, BrokerInfo> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'groww' | 'kraken' | 'etoro'>('kraken');

  // Kraken inputs
  const [krakenKey, setKrakenKey] = useState('');
  const [krakenSecret, setKrakenSecret] = useState('');

  // eToro inputs
  const [etoroAppKey, setEtoroAppKey] = useState('');
  const [etoroUserKey, setEtoroUserKey] = useState('');
  const [etoroEnv, setEtoroEnv] = useState<'sandbox' | 'production'>('sandbox');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadBrokers = async () => {
    try {
      setLoading(true);
      const res = await api<{ brokers: Record<string, BrokerInfo> }>('/api/brokers/status');
      setBrokers(res.brokers);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBrokers();
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveKraken = async (clear = false) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api<{ success: boolean; message: string; brokers: Record<string, BrokerInfo> }>(
        '/api/brokers/configure',
        {
          method: 'POST',
          body: JSON.stringify({
            broker: 'kraken',
            apiKey: clear ? '' : krakenKey,
            apiSecret: clear ? '' : krakenSecret,
          }),
        },
      );
      setBrokers(res.brokers);
      if (clear) {
        setKrakenKey('');
        setKrakenSecret('');
      }
      setMessage({ text: res.message, type: 'success' });
      onUpdate?.();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update Kraken configuration', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEtoro = async (clear = false) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api<{ success: boolean; message: string; brokers: Record<string, BrokerInfo> }>(
        '/api/brokers/configure',
        {
          method: 'POST',
          body: JSON.stringify({
            broker: 'etoro',
            appKey: clear ? '' : etoroAppKey,
            userKey: clear ? '' : etoroUserKey,
            environment: etoroEnv,
          }),
        },
      );
      setBrokers(res.brokers);
      if (clear) {
        setEtoroAppKey('');
        setEtoroUserKey('');
      }
      setMessage({ text: res.message, type: 'success' });
      onUpdate?.();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update eToro configuration', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-xl border border-border bg-surface shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-2">
          <div className="flex items-center gap-2.5">
            <Cpu className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-fg">Broker & Exchange API Manager</h2>
              <p className="text-xs text-muted">
                Architecture and execution for Groww (NSE), Kraken (Crypto), and eToro (NASDAQ)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-fg transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Status Pills */}
        <div className="grid grid-cols-3 border-b border-border bg-bg/50">
          <button
            onClick={() => {
              setActiveTab('groww');
              setMessage(null);
            }}
            className={`flex items-center justify-between px-4 py-3 text-xs font-medium border-r border-border transition-colors ${
              activeTab === 'groww' ? 'bg-surface text-fg font-semibold border-b-2 border-b-primary' : 'text-muted hover:bg-surface/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400" />
              Groww (NSE)
            </span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">Active</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('kraken');
              setMessage(null);
            }}
            className={`flex items-center justify-between px-4 py-3 text-xs font-medium border-r border-border transition-colors ${
              activeTab === 'kraken' ? 'bg-surface text-fg font-semibold border-b-2 border-b-primary' : 'text-muted hover:bg-surface/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${brokers?.kraken?.mode === 'live' ? 'bg-purple-400' : 'bg-amber-400'}`} />
              Kraken (Crypto)
            </span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              {brokers?.kraken?.mode === 'live' ? 'Live API' : 'Paper Sim'}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('etoro');
              setMessage(null);
            }}
            className={`flex items-center justify-between px-4 py-3 text-xs font-medium transition-colors ${
              activeTab === 'etoro' ? 'bg-surface text-fg font-semibold border-b-2 border-b-primary' : 'text-muted hover:bg-surface/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${brokers?.etoro?.mode === 'live' ? 'bg-sky-400' : 'bg-amber-400'}`} />
              eToro (NASDAQ)
            </span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              {brokers?.etoro?.mode === 'live' ? 'Live/Sandbox' : 'Paper Sim'}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {message && (
            <div
              className={`rounded-lg px-4 py-3 text-xs font-medium ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* GROWW TAB */}
          {activeTab === 'groww' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">Groww Trading Desk Integration (NSE/BSE)</h3>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 border border-emerald-500/20 font-medium">
                    Server Session Active
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">
                  Groww uses Indian financial market TOTP authentication. The session is managed securely server-side
                  and tokens are never transmitted to the browser.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded border border-border bg-bg/50 p-2.5">
                    <span className="text-muted block text-[11px]">Execution Engine</span>
                    <span className="text-fg font-medium">GTT OCO Conditional Triggers</span>
                  </div>
                  <div className="rounded border border-border bg-bg/50 p-2.5">
                    <span className="text-muted block text-[11px]">Market Hours</span>
                    <span className="text-fg font-medium">09:15 – 15:30 IST (Mon–Fri)</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface-2/30 p-4 text-xs text-muted space-y-2">
                <div className="flex items-center gap-2 text-fg font-medium">
                  <Shield className="size-4 text-primary" />
                  Security & Order Risk Protocol
                </div>
                <p>
                  Groww API credentials and tokens are strictly kept in server memory until the 06:00 IST daily restart.
                  All order triggers in demo and sample mode are written to the high-fidelity dummy ledger.
                </p>
              </div>
            </div>
          )}

          {/* KRAKEN TAB */}
          {activeTab === 'kraken' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">Kraken Crypto Exchange API</h3>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium border ${
                      brokers?.kraken?.mode === 'live'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {brokers?.kraken?.mode === 'live' ? 'Live API Connected' : 'Paper Simulation Active'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">
                  Kraken supports 24/7 keyless public REST (<code className="text-primary font-mono text-[11px]">/0/public/OHLC</code>)
                  and WebSocket v2 feeds (<code className="text-primary font-mono text-[11px]">wss://ws.kraken.com/v2</code>).
                  Algo orders use conditional stop-loss-limit and bracket triggers.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-fg flex items-center gap-1.5">
                  <Key className="size-3.5 text-primary" />
                  Kraken Private API Credentials (Optional)
                </h4>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Kraken API Key</label>
                  <input
                    type="text"
                    value={krakenKey}
                    onChange={(e) => setKrakenKey(e.target.value)}
                    placeholder="e.g. 5qR...YourKrakenAPIKey"
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-fg outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Kraken API Private Secret (Base64 HMAC-SHA512)</label>
                  <input
                    type="password"
                    value={krakenSecret}
                    onChange={(e) => setKrakenSecret(e.target.value)}
                    placeholder="e.g. jKL89...Base64Secret"
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-fg outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-[10px] text-muted">
                    Leave blank to run in simulated paper trading mode with real live prices.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    disabled={saving || !krakenKey || !krakenSecret}
                    onClick={() => handleSaveKraken(false)}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Connect Kraken Live API'}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => handleSaveKraken(true)}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-fg hover:bg-surface-2"
                  >
                    Use Paper Simulation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ETORO TAB */}
          {activeTab === 'etoro' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">eToro Open API (NASDAQ-100 & ETFs)</h3>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium border ${
                      brokers?.etoro?.mode === 'live'
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {brokers?.etoro?.mode === 'live' ? 'Connected' : 'Paper Simulation Active'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">
                  eToro Developer Open API uses App Key (<code className="text-primary font-mono text-[11px]">Ocp-Apim-Subscription-Key</code>)
                  and User Token. Algo triggers generate eToro bracket orders with embedded Stop Loss Rate and Take Profit Rate.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-fg flex items-center gap-1.5">
                  <Key className="size-3.5 text-primary" />
                  eToro Open API Credentials (Optional)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">eToro App Key</label>
                    <input
                      type="text"
                      value={etoroAppKey}
                      onChange={(e) => setEtoroAppKey(e.target.value)}
                      placeholder="e.g. etoro_app_key_..."
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-fg outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">Environment</label>
                    <select
                      value={etoroEnv}
                      onChange={(e) => setEtoroEnv(e.target.value as any)}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none"
                    >
                      <option value="sandbox">Sandbox (api-sandbox.etoro.com)</option>
                      <option value="production">Production (api.etoro.com)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-muted mb-1">User Token / Key</label>
                  <input
                    type="password"
                    value={etoroUserKey}
                    onChange={(e) => setEtoroUserKey(e.target.value)}
                    placeholder="e.g. user_session_token..."
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-fg outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-[10px] text-muted">
                    Leave blank to run in simulated paper trading mode with real NASDAQ prices.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    disabled={saving || !etoroAppKey}
                    onClick={() => handleSaveEtoro(false)}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Connect eToro API'}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => handleSaveEtoro(true)}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-fg hover:bg-surface-2"
                  >
                    Use Paper Simulation
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 bg-surface-2 flex items-center justify-between text-xs text-muted">
          <span>Real-time feeds: Kraken WS v2 · Stooq / Yahoo · Groww NSE</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-surface border border-border px-3 py-1.5 text-fg font-medium hover:bg-surface-2 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
