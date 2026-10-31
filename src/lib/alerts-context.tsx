import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { DeskAlert, FiredAlert, MarketType, Quote } from '../types/market';
import { MARKETS, getConstituent } from '../data/universes';
import { playAlertChime, sendDesktopNotification } from './audio-alerts';

const STORAGE_ALERTS_KEY = 'groww_desk_alerts_v1';
const STORAGE_FIRED_KEY = 'groww_fired_alerts_v1';
const MAX_ALERTS = 50;

type AlertsContextType = {
  alerts: DeskAlert[];
  firedAlerts: FiredAlert[];
  createAlert: (alert: Omit<DeskAlert, 'id' | 'createdAt' | 'armed'>) => boolean;
  deleteAlert: (id: string) => void;
  resetAlert: (id: string) => void;
  clearFiredAlerts: () => void;
  evaluateQuotes: (quotes: Record<string, Quote>) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  desktopEnabled: boolean;
  setDesktopEnabled: (enabled: boolean) => void;
};

const AlertsContext = createContext<AlertsContextType | null>(null);

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private mode
  }
}

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<DeskAlert[]>(() => loadStored(STORAGE_ALERTS_KEY, []));
  const [firedAlerts, setFiredAlerts] = useState<FiredAlert[]>(() => loadStored(STORAGE_FIRED_KEY, []));
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [desktopEnabled, setDesktopEnabled] = useState<boolean>(false);

  useEffect(() => {
    saveStored(STORAGE_ALERTS_KEY, alerts);
  }, [alerts]);

  useEffect(() => {
    saveStored(STORAGE_FIRED_KEY, firedAlerts);
  }, [firedAlerts]);

  const createAlert = useCallback(
    (newAlertData: Omit<DeskAlert, 'id' | 'createdAt' | 'armed'>): boolean => {
      if (alerts.length >= MAX_ALERTS) {
        return false;
      }
      const newAlert: DeskAlert = {
        ...newAlertData,
        id: 'ALT-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        createdAt: new Date().toISOString(),
        armed: true,
      };
      setAlerts((prev) => [newAlert, ...prev]);
      return true;
    },
    [alerts.length],
  );

  const deleteAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const resetAlert = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, armed: true, lastFiredAt: undefined } : a)),
    );
  }, []);

  const clearFiredAlerts = useCallback(() => {
    setFiredAlerts([]);
  }, []);

  const evaluateQuotes = useCallback(
    (quotes: Record<string, Quote>) => {
      if (alerts.length === 0) return;

      const newlyFired: FiredAlert[] = [];
      const updatedAlerts = alerts.map((alert) => {
        if (!alert.armed) return alert;

        const quoteKey = `${alert.market}:${alert.ticker.toUpperCase()}`;
        const quote = quotes[quoteKey] || quotes[alert.ticker.toUpperCase()];
        if (!quote || quote.price <= 0) return alert;

        let triggered = false;
        let conditionText = '';

        const mktConfig = MARKETS[alert.market];
        const symbolStr = `${alert.ticker} (${mktConfig.currencySymbol})`;

        switch (alert.type) {
          case 'price_above':
            if (alert.threshold != null && quote.price >= alert.threshold) {
              triggered = true;
              conditionText = `Price crossed above ${mktConfig.currencySymbol}${alert.threshold.toLocaleString()}`;
            }
            break;
          case 'price_below':
            if (alert.threshold != null && quote.price <= alert.threshold) {
              triggered = true;
              conditionText = `Price crossed below ${mktConfig.currencySymbol}${alert.threshold.toLocaleString()}`;
            }
            break;
          case 'pct_move_above':
            if (alert.threshold != null && quote.changePct >= alert.threshold) {
              triggered = true;
              conditionText = `Change rose above +${alert.threshold}% from prev close`;
            }
            break;
          case 'pct_move_below':
            if (alert.threshold != null && quote.changePct <= -Math.abs(alert.threshold)) {
              triggered = true;
              conditionText = `Change fell below -${Math.abs(alert.threshold)}% from prev close`;
            }
            break;
        }

        if (triggered) {
          const firedItem: FiredAlert = {
            id: 'FRD-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
            alertId: alert.id,
            timestamp: new Date().toISOString(),
            market: alert.market,
            ticker: alert.ticker,
            condition: conditionText,
            triggerPrice: quote.price,
            currencySymbol: mktConfig.currencySymbol,
            isSample: quote.status === 'Sample',
          };
          newlyFired.push(firedItem);

          if (soundEnabled) {
            playAlertChime();
          }
          if (desktopEnabled) {
            sendDesktopNotification(
              `Alert: ${alert.ticker} triggered`,
              `${conditionText}. Current price: ${mktConfig.currencySymbol}${quote.price.toLocaleString()}`,
            );
          }

          return {
            ...alert,
            armed: false,
            lastFiredAt: firedItem.timestamp,
          };
        }

        return alert;
      });

      if (newlyFired.length > 0) {
        setAlerts(updatedAlerts);
        setFiredAlerts((prev) => [...newlyFired, ...prev].slice(0, MAX_ALERTS));
      }
    },
    [alerts, desktopEnabled, soundEnabled],
  );

  return (
    <AlertsContext.Provider
      value={{
        alerts,
        firedAlerts,
        createAlert,
        deleteAlert,
        resetAlert,
        clearFiredAlerts,
        evaluateQuotes,
        soundEnabled,
        setSoundEnabled,
        desktopEnabled,
        setDesktopEnabled,
      }}
    >
      {children}
    </AlertsContext.Provider>
  );
}

export function useAlerts(): AlertsContextType {
  const context = useContext(AlertsContext);
  if (!context) throw new Error('useAlerts must be used within an AlertsProvider');
  return context;
}
