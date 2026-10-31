import { useState, useEffect } from 'react';
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import type { AlertType, MarketType } from '../types/market';
import { MARKETS, getConstituents } from '../data/universes';
import { useAlerts } from '../lib/alerts-context';
import { useMarketQuotes } from '../lib/quotes-context';
import { formatPrice, prettyDate } from '../lib/api';
import { requestNotificationPermission } from '../lib/audio-alerts';
import { MarketSelector } from './market-selector';

const fieldClass =
  'h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function AlertsPanel() {
  const { market: activeMarket } = useMarketQuotes();
  const {
    alerts,
    firedAlerts,
    createAlert,
    deleteAlert,
    resetAlert,
    clearFiredAlerts,
    soundEnabled,
    setSoundEnabled,
    desktopEnabled,
    setDesktopEnabled,
  } = useAlerts();

  const [formMarket, setFormMarket] = useState<MarketType>(activeMarket);
  const [formTicker, setFormTicker] = useState<string>(() => {
    const list = getConstituents(activeMarket);
    return list[0]?.ticker || 'RELIANCE';
  });

  // Sync form market when active desk market switches
  useEffect(() => {
    setFormMarket(activeMarket);
    const list = getConstituents(activeMarket);
    if (list.length > 0) {
      setFormTicker(list[0].ticker);
    }
  }, [activeMarket]);
  const [formType, setFormType] = useState<AlertType>('price_above');
  const [formThreshold, setFormThreshold] = useState<string>('100');
  const [formStance, setFormStance] = useState<'BUY' | 'SELL'>('BUY');
  const [notice, setNotice] = useState<string | null>(null);
  const [notifState, setNotifState] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  const constituents = getConstituents(formMarket);
  const mktConfig = MARKETS[formMarket];

  const handleMarketChange = (m: MarketType) => {
    setFormMarket(m);
    const list = getConstituents(m);
    if (list.length > 0) {
      setFormTicker(list[0].ticker);
    }
  };

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    const thresholdVal = parseFloat(formThreshold);
    if (
      ['price_above', 'price_below', 'pct_move_above', 'pct_move_below'].includes(formType) &&
      (!Number.isFinite(thresholdVal) || thresholdVal <= 0)
    ) {
      setNotice('Please enter a valid positive numeric threshold.');
      return;
    }

    const success = createAlert({
      market: formMarket,
      ticker: formTicker,
      type: formType,
      threshold: Number.isFinite(thresholdVal) ? thresholdVal : undefined,
      stance: formType === 'mc_stance' ? formStance : undefined,
    });

    if (success) {
      setNotice(`Armed alert for ${formTicker} on ${mktConfig.label}.`);
      setTimeout(() => setNotice(null), 3000);
    } else {
      setNotice('Maximum capacity reached (50 alerts). Please remove old alerts first.');
    }
  };

  const handleToggleNotifications = async () => {
    if (!desktopEnabled) {
      const perm = await requestNotificationPermission();
      setNotifState(perm);
      if (perm === 'granted') {
        setDesktopEnabled(true);
      } else {
        setDesktopEnabled(false);
        setNotice('Desktop notification permission was denied in your browser settings.');
      }
    } else {
      setDesktopEnabled(false);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Alerts & Real-Time Notifiers</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Configure symbol breakout thresholds, % moves, and quant stance changes. Evaluated live from the tick stream.
            An alert notifies you and does not place or modify orders.
          </p>
        </div>

        {/* Global Controls & Market Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <MarketSelector />
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={
              'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ' +
              (soundEnabled
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-surface text-muted hover:text-fg')
            }
          >
            {soundEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            Audio Chime: {soundEnabled ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            onClick={handleToggleNotifications}
            className={
              'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ' +
              (desktopEnabled
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-surface text-muted hover:text-fg')
            }
          >
            {desktopEnabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
            Desktop Notif: {desktopEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {notice ? (
        <p className="mt-4 rounded-lg border border-primary/40 bg-surface-2 px-4 py-2.5 text-xs text-primary" role="status">
          {notice}
        </p>
      ) : null}

      {/* Alert Builder Form */}
      <div className="mt-5 rounded-lg border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Plus className="size-4 text-primary" /> Create New Market Alert
        </h2>
        <form onSubmit={handleCreateAlert} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* 1. Market Selection */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">Universe</label>
            <select
              value={formMarket}
              onChange={(e) => handleMarketChange(e.target.value as MarketType)}
              className={fieldClass + ' mt-1'}
            >
              <option value="nifty">Nifty 100</option>
              <option value="crypto">Crypto Majors</option>
              <option value="nasdaq">NASDAQ-100</option>
              <option value="etfs">Liquid ETFs</option>
            </select>
          </div>

          {/* 2. Ticker Selection */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">Symbol</label>
            <select
              value={formTicker}
              onChange={(e) => setFormTicker(e.target.value)}
              className={fieldClass + ' mt-1'}
            >
              {constituents.map((c) => (
                <option key={c.ticker} value={c.ticker}>
                  {c.ticker} — {c.name.slice(0, 22)}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Trigger Type */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">Condition Type</label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value as AlertType)}
              className={fieldClass + ' mt-1'}
            >
              <option value="price_above">Price Crosses Above ({mktConfig.currencySymbol})</option>
              <option value="price_below">Price Crosses Below ({mktConfig.currencySymbol})</option>
              <option value="pct_move_above">Percent Move Above +%</option>
              <option value="pct_move_below">Percent Drop Below -%</option>
              <option value="sma_cross">SMA Crossover (New Cross)</option>
              <option value="mc_stance">Monte Carlo Stance Shift</option>
            </select>
          </div>

          {/* 4. Threshold or Stance */}
          <div>
            {formType === 'mc_stance' ? (
              <>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">Target Stance</label>
                <select
                  value={formStance}
                  onChange={(e) => setFormStance(e.target.value as 'BUY' | 'SELL')}
                  className={fieldClass + ' mt-1'}
                >
                  <option value="BUY">BUY Stance</option>
                  <option value="SELL">SELL Stance</option>
                </select>
              </>
            ) : formType === 'sma_cross' ? (
              <>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">Crossover</label>
                <div className="mt-1 flex h-10 items-center rounded-lg border border-border bg-bg px-3 text-xs text-muted">
                  Bullish or Bearish
                </div>
              </>
            ) : (
              <>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">
                  Threshold {formType.includes('pct') ? '(%)' : `(${mktConfig.currencySymbol})`}
                </label>
                <input
                  type="number"
                  step="any"
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  placeholder="e.g. 2500"
                  className={fieldClass + ' mt-1'}
                  required
                />
              </>
            )}
          </div>

          {/* 5. Submit Button */}
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-fg hover:opacity-90 transition-opacity"
            >
              <Bell className="size-3.5" />
              Arm Alert
            </button>
          </div>
        </form>
      </div>

      {/* Two Column Layout: Active Watchlist & Fired History */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Active Armed Alerts */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg">Active Alert Watchlist</h2>
            <span className="num text-xs text-muted">{alerts.length} / 50 monitored</span>
          </div>

          <div className="mt-3 overflow-x-auto">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">
                No alerts configured yet. Choose a symbol and condition above to start monitoring.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2 px-2">Market</th>
                    <th className="py-2 px-2">Symbol</th>
                    <th className="py-2 px-2">Condition</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alerts.map((alert) => {
                    const cfg = MARKETS[alert.market];
                    return (
                      <tr key={alert.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-2 px-2 font-medium text-muted">{cfg.label}</td>
                        <td className="py-2 px-2 font-semibold text-fg">{alert.ticker}</td>
                        <td className="py-2 px-2 text-muted">
                          {alert.type === 'price_above' && `Price ≥ ${cfg.currencySymbol}${alert.threshold}`}
                          {alert.type === 'price_below' && `Price ≤ ${cfg.currencySymbol}${alert.threshold}`}
                          {alert.type === 'pct_move_above' && `Move ≥ +${alert.threshold}%`}
                          {alert.type === 'pct_move_below' && `Move ≤ -${alert.threshold}%`}
                          {alert.type === 'sma_cross' && 'SMA Crossover'}
                          {alert.type === 'mc_stance' && `Stance → ${alert.stance}`}
                        </td>
                        <td className="py-2 px-2">
                          {alert.armed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-up">
                              <Radio className="size-3 animate-pulse" /> Armed
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted">Fired</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!alert.armed ? (
                              <button
                                type="button"
                                title="Re-arm alert"
                                onClick={() => resetAlert(alert.id)}
                                className="rounded p-1 text-muted hover:text-fg hover:bg-line"
                              >
                                <RotateCcw className="size-3.5" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              title="Delete alert"
                              onClick={() => deleteAlert(alert.id)}
                              className="rounded p-1 text-muted hover:text-down hover:bg-line"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Fired Alerts Feed */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg">Fired Alerts History</h2>
            {firedAlerts.length > 0 ? (
              <button
                type="button"
                onClick={clearFiredAlerts}
                className="text-xs text-muted hover:text-fg underline"
              >
                Clear history
              </button>
            ) : null}
          </div>

          <div className="mt-3 space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {firedAlerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">
                No alerts fired yet. When conditions are met on incoming ticks, triggers will appear here.
              </div>
            ) : (
              firedAlerts.map((fired) => {
                const timeStr = new Date(fired.timestamp).toLocaleTimeString();
                return (
                  <div
                    key={fired.id}
                    className="flex items-start justify-between rounded-lg border border-border bg-surface-2 p-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-fg">{fired.ticker}</span>
                        <span className="text-[11px] text-muted uppercase">({fired.market})</span>
                        {fired.isSample ? (
                          <span className="rounded bg-surface px-1.5 py-0.2 text-[10px] text-watch border border-border">
                            Sample
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-muted">{fired.condition}</p>
                    </div>
                    <div className="text-right">
                      <div className="num font-semibold text-fg">
                        {fired.currencySymbol}{fired.triggerPrice.toLocaleString()}
                      </div>
                      <div className="num mt-0.5 text-[11px] text-muted">{timeStr}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
