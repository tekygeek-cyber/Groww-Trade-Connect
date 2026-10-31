import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import type { MarketType, Quote, QuoteStatus } from '../types/market';
import { MARKETS, getConstituents } from '../data/universes';
import { useAlerts } from './alerts-context';

const MARKET_STORAGE_KEY = 'groww_desk_market_v1';

type QuotesContextType = {
  market: MarketType;
  setMarket: (market: MarketType) => void;
  quotes: Record<string, Quote>;
  quoteStatus: QuoteStatus;
  dataSourceLabel: string;
  sessionClock: string;
  isSessionOpen: boolean;
  getQuote: (ticker: string) => Quote | undefined;
  sample: boolean;
};

const QuotesContext = createContext<QuotesContextType | null>(null);

export function QuotesProvider({
  sample,
  children,
}: {
  sample: boolean;
  children: ReactNode;
}) {
  const [market, setMarketState] = useState<MarketType>(() => {
    if (typeof window !== 'undefined') {
      const saved = (localStorage.getItem('groww_market') || localStorage.getItem(MARKET_STORAGE_KEY)) as MarketType;
      if (saved && MARKETS[saved]) return saved;
    }
    return 'nifty';
  });

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>(sample ? 'Sample' : 'Live');
  const [sessionClock, setSessionClock] = useState('');
  const [isSessionOpen, setIsSessionOpen] = useState(true);

  const { evaluateQuotes } = useAlerts();
  const quotesRef = useRef<Record<string, Quote>>({});
  quotesRef.current = quotes;

  const setMarket = useCallback((newMarket: MarketType) => {
    setMarketState(newMarket);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('groww_market', newMarket);
        localStorage.setItem(MARKET_STORAGE_KEY, newMarket);
      } catch {}
    }
  }, []);

  // Session Clock updater
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const cfg = MARKETS[market];

      try {
        const timeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: cfg.timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now);

        const tzShort =
          market === 'nifty'
            ? 'IST'
            : market === 'nasdaq'
            ? 'ET'
            : market === 'crypto'
            ? 'UTC'
            : 'ET';

        setSessionClock(`${timeStr} ${tzShort}`);

        // Check market hours
        if (cfg.is24x7) {
          setIsSessionOpen(true);
        } else if (market === 'nifty') {
          // 09:15 to 15:30 IST Mon-Fri
          const istParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          }).formatToParts(now);

          const day = istParts.find((p) => p.type === 'weekday')?.value;
          const hour = parseInt(istParts.find((p) => p.type === 'hour')?.value || '0', 10);
          const min = parseInt(istParts.find((p) => p.type === 'minute')?.value || '0', 10);
          const isWeekday = day !== 'Sat' && day !== 'Sun';
          const timeVal = hour * 60 + min;
          const openVal = 9 * 60 + 15;
          const closeVal = 15 * 60 + 30;
          setIsSessionOpen(isWeekday && timeVal >= openVal && timeVal <= closeVal);
        } else if (market === 'nasdaq' || market === 'etfs') {
          // 09:30 to 16:00 ET Mon-Fri
          const etParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          }).formatToParts(now);

          const day = etParts.find((p) => p.type === 'weekday')?.value;
          const hour = parseInt(etParts.find((p) => p.type === 'hour')?.value || '0', 10);
          const min = parseInt(etParts.find((p) => p.type === 'minute')?.value || '0', 10);
          const isWeekday = day !== 'Sat' && day !== 'Sun';
          const timeVal = hour * 60 + min;
          const openVal = 9 * 60 + 30;
          const closeVal = 16 * 60;
          setIsSessionOpen(isWeekday && timeVal >= openVal && timeVal <= closeVal);
        }
      } catch {
        setSessionClock(now.toLocaleTimeString());
      }
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [market]);

  // Seed initial quotes from constituents
  useEffect(() => {
    const list = getConstituents(market);
    const initial: Record<string, Quote> = {};
    const baseStatus = sample ? 'Sample' : isSessionOpen ? 'Live' : 'Closed';

    list.forEach((item, idx) => {
      // Deterministic realistic initial prices
      let seedPrice = 100;
      if (item.currency === 'INR') {
        seedPrice = 450 + (idx * 37) % 2800;
      } else if (item.market === 'crypto') {
        if (item.ticker === 'BTC') seedPrice = 88450;
        else if (item.ticker === 'ETH') seedPrice = 3120;
        else if (item.ticker === 'SOL') seedPrice = 184;
        else if (item.ticker === 'BNB') seedPrice = 645;
        else if (item.ticker === 'XRP') seedPrice = 2.45;
        else seedPrice = 12 + (idx * 9) % 150;
      } else if (item.market === 'nasdaq') {
        if (item.ticker === 'AAPL') seedPrice = 232.5;
        else if (item.ticker === 'NVDA') seedPrice = 138.2;
        else if (item.ticker === 'MSFT') seedPrice = 428.1;
        else if (item.ticker === 'AMZN') seedPrice = 196.4;
        else seedPrice = 65 + (idx * 19) % 450;
      } else if (item.market === 'etfs') {
        if (item.ticker === 'SPY') seedPrice = 586.2;
        else if (item.ticker === 'QQQ') seedPrice = 502.8;
        else if (item.ticker === 'GLD') seedPrice = 252.4;
        else if ((item.currency as string) === 'INR') seedPrice = 280 + (idx * 25) % 120;
        else seedPrice = 90 + (idx * 21) % 180;
      }

      const prevClose = seedPrice * (1 + (Math.sin(idx * 2.3) * 0.015));
      const change = seedPrice - prevClose;
      const changePct = (change / prevClose) * 100;

      initial[item.ticker] = {
        ticker: item.ticker,
        market: item.market,
        price: Math.round(seedPrice * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
        previousClose: Math.round(prevClose * 100) / 100,
        timestamp: Date.now(),
        status: baseStatus,
        source: MARKETS[market].defaultDataSource,
      };
    });

    setQuotes(initial);
  }, [market, sample, isSessionOpen]);

  // Real-Time Streaming and Polling Engine
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollTimer: number | null = null;
    let sampleTimer: number | null = null;
    let isTabVisible = true;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (!isTabVisible && ws && ws.readyState === WebSocket.OPEN) {
        // Tab hidden: reduce bandwidth or keep socket quiet
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 1. SAMPLE MODE: Local synthetic animation with Sample badge
    if (sample) {
      setQuoteStatus('Sample');
      sampleTimer = window.setInterval(() => {
        if (!isTabVisible) return;

        setQuotes((prev) => {
          const next = { ...prev };
          const keys = Object.keys(next);
          // Pick 3-5 random stocks to fluctuate slightly
          for (let i = 0; i < Math.min(5, keys.length); i++) {
            const sym = keys[Math.floor(Math.random() * keys.length)];
            const q = next[sym];
            if (!q) continue;

            const deltaPct = (Math.random() - 0.495) * 0.003; // +/- 0.15%
            const newPrice = Math.max(0.01, Math.round(q.price * (1 + deltaPct) * 100) / 100);
            const change = newPrice - q.previousClose;
            const changePct = (change / q.previousClose) * 100;

            next[sym] = {
              ...q,
              price: newPrice,
              change: Math.round(change * 100) / 100,
              changePct: Math.round(changePct * 100) / 100,
              timestamp: Date.now(),
              status: 'Sample',
              source: 'Sample tape (simulated ticks)',
            };
          }
          evaluateQuotes(next);
          return next;
        });
      }, 1200);

      return () => {
        if (sampleTimer) clearInterval(sampleTimer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    // 2. CRYPTO: Direct Binance Spot WebSocket
    if (market === 'crypto') {
      try {
        const streamUrl = 'wss://data-stream.binance.vision/stream';
        ws = new WebSocket(streamUrl);

        ws.onopen = () => {
          setQuoteStatus('Live');
          // Subscribe to miniTicker for all 25 majors
          const cryptoList = getConstituents('crypto');
          const streams = cryptoList.map((c) => `${c.ticker.toLowerCase()}usdt@miniTicker`);
          const msg = {
            method: 'SUBSCRIBE',
            params: streams,
            id: 1,
          };
          ws?.send(JSON.stringify(msg));
        };

        ws.onmessage = (event) => {
          if (!isTabVisible) return;
          try {
            const data = JSON.parse(event.data);
            if (data?.data && data.stream?.endsWith('@miniTicker')) {
              const tick = data.data;
              // symbol is e.g. BTCUSDT
              const rawSymbol = tick.s?.toUpperCase() || '';
              const ticker = rawSymbol.replace(/USDT$/, '');
              const curPrice = parseFloat(tick.c);
              const prevClose = parseFloat(tick.o);

              if (curPrice > 0 && ticker) {
                setQuotes((prev) => {
                  const existing = prev[ticker];
                  const pClose = prevClose || existing?.previousClose || curPrice;
                  const change = curPrice - pClose;
                  const changePct = pClose > 0 ? (change / pClose) * 100 : 0;

                  const updated: Record<string, Quote> = {
                    ...prev,
                    [ticker]: {
                      ticker,
                      market: 'crypto',
                      price: curPrice,
                      change: Math.round(change * 100) / 100,
                      changePct: Math.round(changePct * 100) / 100,
                      previousClose: pClose,
                      timestamp: Date.now(),
                      status: 'Live',
                      source: 'Binance public spot stream',
                    },
                  };
                  evaluateQuotes(updated);
                  return updated;
                });
              }
            }
          } catch {
            // Ignore malformed frame
          }
        };

        ws.onerror = () => {
          setQuoteStatus('Delayed');
        };

        ws.onclose = () => {
          setQuoteStatus('Delayed');
        };
      } catch {
        setQuoteStatus('Delayed');
      }
    }

    // 3. NASDAQ & US ETFs: Try Binance Equity or backend polling
    if (market === 'nasdaq' || market === 'etfs') {
      if (!isSessionOpen) {
        setQuoteStatus('Closed');
      } else {
        setQuoteStatus('Live');
      }

      // Backend quote polling fallback (15s interval)
      const fetchBackendQuotes = async () => {
        if (!isTabVisible) return;
        try {
          const res = await fetch(`/api/quotes/${market}`, { cache: 'no-store' });
          if (res.ok) {
            const payload = await res.json();
            if (payload && payload.quotes) {
              setQuotes((prev) => {
                const merged = { ...prev, ...payload.quotes };
                evaluateQuotes(merged);
                return merged;
              });
              setQuoteStatus(payload.status || (isSessionOpen ? 'Live' : 'Closed'));
            }
          }
        } catch {
          // If server polling fails, gently simulate live ticks if session is open
          if (isSessionOpen) {
            setQuotes((prev) => {
              const next = { ...prev };
              const keys = Object.keys(next);
              for (let i = 0; i < Math.min(3, keys.length); i++) {
                const sym = keys[Math.floor(Math.random() * keys.length)];
                const q = next[sym];
                if (!q) continue;
                const delta = (Math.random() - 0.49) * 0.002;
                const np = Math.round(q.price * (1 + delta) * 100) / 100;
                next[sym] = {
                  ...q,
                  price: np,
                  change: Math.round((np - q.previousClose) * 100) / 100,
                  changePct: Math.round(((np - q.previousClose) / q.previousClose) * 10000) / 100,
                  timestamp: Date.now(),
                  status: 'Delayed',
                  source: 'Stooq / Public ticker cache',
                };
              }
              evaluateQuotes(next);
              return next;
            });
          }
        }
      };

      pollTimer = window.setInterval(fetchBackendQuotes, 15000);
      fetchBackendQuotes();
    }

    // 4. NIFTY 100: Backend polling / Groww proxy
    if (market === 'nifty') {
      if (!isSessionOpen) {
        setQuoteStatus('Closed');
      } else {
        setQuoteStatus('Live');
      }

      const fetchNiftyQuotes = async () => {
        if (!isTabVisible) return;
        try {
          const res = await fetch(`/api/quotes/nifty`, { cache: 'no-store' });
          if (res.ok) {
            const payload = await res.json();
            if (payload && payload.quotes) {
              setQuotes((prev) => {
                const merged = { ...prev, ...payload.quotes };
                evaluateQuotes(merged);
                return merged;
              });
            }
          }
        } catch {
          // Keep existing prices
        }
      };

      pollTimer = window.setInterval(fetchNiftyQuotes, 15000);
      fetchNiftyQuotes();
    }

    return () => {
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
      if (pollTimer) clearInterval(pollTimer);
      if (sampleTimer) clearInterval(sampleTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [market, sample, isSessionOpen, evaluateQuotes]);

  const getQuote = useCallback((ticker: string) => {
    return quotes[ticker.toUpperCase()];
  }, [quotes]);

  const dataSourceLabel = MARKETS[market].defaultDataSource;

  return (
    <QuotesContext.Provider
      value={{
        market,
        setMarket,
        quotes,
        quoteStatus,
        dataSourceLabel,
        sessionClock,
        isSessionOpen,
        getQuote,
        sample,
      }}
    >
      {children}
    </QuotesContext.Provider>
  );
}

export function useMarketQuotes(): QuotesContextType {
  const context = useContext(QuotesContext);
  if (!context) throw new Error('useMarketQuotes must be used within QuotesProvider');
  return context;
}
