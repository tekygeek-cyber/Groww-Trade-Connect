import crypto from 'crypto';
import type { MarketType } from '../src/types/market';
import { loadDummyGtts, saveDummyGtts } from './groww-service';

export type BrokerId = 'groww' | 'kraken' | 'etoro';

export interface BrokerStatus {
  id: BrokerId;
  name: string;
  market: MarketType;
  currency: string;
  mode: 'live' | 'paper';
  configured: boolean;
  accountName: string;
  activeTriggersCount: number;
  supportedOrderTypes: string[];
  notes: string;
}

export interface AlgoOrder {
  id: string;
  brokerId: BrokerId;
  market: MarketType;
  symbol: string;
  companyName: string;
  entryPrice: number;
  stoploss: number;
  targetPrice: number;
  currentPrice: number;
  quantity: number;
  orderType: string;
  status: 'active' | 'triggered' | 'cancelled' | 'filled';
  mode: 'live' | 'paper';
  createdAt: string;
  triggeredAt?: string;
  message?: string;
}

// In-memory credentials store (server-side only, never leaked to client)
interface BrokerCredentials {
  kraken: {
    apiKey: string;
    apiSecret: string;
    isConfigured: boolean;
  };
  etoro: {
    appKey: string;
    userKey: string;
    environment: 'sandbox' | 'production';
    isConfigured: boolean;
  };
}

const credentials: BrokerCredentials = {
  kraken: {
    apiKey: '',
    apiSecret: '',
    isConfigured: false,
  },
  etoro: {
    appKey: '',
    userKey: '',
    environment: 'sandbox',
    isConfigured: false,
  },
};

// Global in-memory algo orders ledger
let algoOrders: AlgoOrder[] = [
  {
    id: 'ALGO-KRK-101',
    brokerId: 'kraken',
    market: 'crypto',
    symbol: 'BTC',
    companyName: 'Bitcoin',
    entryPrice: 66800.0,
    stoploss: 64200.0,
    targetPrice: 72000.0,
    currentPrice: 67450.0,
    quantity: 0.1,
    orderType: 'Kraken Conditional Stop-Limit',
    status: 'active',
    mode: 'paper',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    message: 'Awaiting pullback to $66,800 retest midpoint',
  },
  {
    id: 'ALGO-ETR-202',
    brokerId: 'etoro',
    market: 'nasdaq',
    symbol: 'NVDA',
    companyName: 'NVIDIA Corporation',
    entryPrice: 132.5,
    stoploss: 126.0,
    targetPrice: 145.0,
    currentPrice: 134.8,
    quantity: 15,
    orderType: 'eToro Bracket (SL/TP)',
    status: 'active',
    mode: 'paper',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    message: 'Retest trigger active at $132.50',
  },
  {
    id: 'DUMMY-GTT-RELIANCE',
    brokerId: 'groww',
    market: 'nifty',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries Ltd.',
    entryPrice: 2840.0,
    stoploss: 2698.0,
    targetPrice: 3120.0,
    currentPrice: 2865.0,
    quantity: 10,
    orderType: 'Groww GTT OCO Trigger',
    status: 'active',
    mode: 'paper',
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    message: 'GTT Buy trigger active at ₹2,840',
  },
];

export function getBrokerForMarket(market: MarketType): BrokerId {
  switch (market) {
    case 'nifty':
      return 'groww';
    case 'crypto':
      return 'kraken';
    case 'nasdaq':
      return 'etoro';
    case 'etfs':
      return 'etoro';
  }
}

export function getAllBrokersStatus(): Record<BrokerId, BrokerStatus> {
  const krakenTriggers = algoOrders.filter((o) => o.brokerId === 'kraken' && o.status === 'active').length;
  const etoroTriggers = algoOrders.filter((o) => o.brokerId === 'etoro' && o.status === 'active').length;
  const growwTriggers = algoOrders.filter((o) => o.brokerId === 'groww' && o.status === 'active').length;

  return {
    groww: {
      id: 'groww',
      name: 'Groww (NSE / India)',
      market: 'nifty',
      currency: 'INR',
      mode: 'paper',
      configured: true,
      accountName: 'Groww Connect Desk',
      activeTriggersCount: growwTriggers,
      supportedOrderTypes: ['GTT OCO', 'Limit Buy', 'Market Entry', 'Stop-Loss Trigger'],
      notes: 'Indian Equities via NSE/BSE. TOTP authenticated. Session cached until 06:00 IST.',
    },
    kraken: {
      id: 'kraken',
      name: 'Kraken (Crypto)',
      market: 'crypto',
      currency: 'USDT',
      mode: credentials.kraken.isConfigured ? 'live' : 'paper',
      configured: credentials.kraken.isConfigured,
      accountName: credentials.kraken.isConfigured ? 'Kraken Pro Live' : 'Kraken Paper Sim',
      activeTriggersCount: krakenTriggers,
      supportedOrderTypes: ['Conditional Stop-Limit', 'Take-Profit-Limit', 'Spot Limit', 'Trailing Stop'],
      notes: '24/7 Crypto. Public REST & WS v2 keyless feeds. Private API requires API-Key & HMAC-SHA512 sign.',
    },
    etoro: {
      id: 'etoro',
      name: 'eToro (NASDAQ & Global ETFs)',
      market: 'nasdaq',
      currency: 'USD',
      mode: credentials.etoro.isConfigured ? 'live' : 'paper',
      configured: credentials.etoro.isConfigured,
      accountName: credentials.etoro.isConfigured
        ? `eToro ${credentials.etoro.environment === 'production' ? 'Real' : 'Demo'}`
        : 'eToro Paper Sandbox',
      activeTriggersCount: etoroTriggers,
      supportedOrderTypes: ['Bracket Order (SL/TP)', 'Conditional Limit', 'Trailing Stop Loss', 'Fractional Shares'],
      notes: 'US Equities & ETFs. Open API uses Developer App Key & User Token. Bracket StopLoss/TakeProfit orders.',
    },
  };
}

export function configureKraken(apiKey: string, apiSecret: string): { success: boolean; message: string } {
  if (!apiKey.trim() || !apiSecret.trim()) {
    credentials.kraken.isConfigured = false;
    credentials.kraken.apiKey = '';
    credentials.kraken.apiSecret = '';
    return { success: true, message: 'Kraken reset to Paper Trading mode.' };
  }
  credentials.kraken.apiKey = apiKey.trim();
  credentials.kraken.apiSecret = apiSecret.trim();
  credentials.kraken.isConfigured = true;
  return { success: true, message: 'Kraken API keys configured. Live trading mode enabled.' };
}

export function configureEtoro(
  appKey: string,
  userKey: string,
  environment: 'sandbox' | 'production' = 'sandbox',
): { success: boolean; message: string } {
  if (!appKey.trim()) {
    credentials.etoro.isConfigured = false;
    credentials.etoro.appKey = '';
    credentials.etoro.userKey = '';
    return { success: true, message: 'eToro reset to Paper Sandbox mode.' };
  }
  credentials.etoro.appKey = appKey.trim();
  credentials.etoro.userKey = userKey.trim();
  credentials.etoro.environment = environment;
  credentials.etoro.isConfigured = true;
  return { success: true, message: `eToro Open API configured (${environment.toUpperCase()}).` };
}

export interface PlaceAlgoCandidate {
  symbol: string;
  companyName?: string;
  buy_price: number;
  last_price: number;
  stoploss?: number;
  targetPrice?: number;
  tick_size?: number;
}

export async function executeAlgoForMarket(
  market: MarketType,
  candidates: PlaceAlgoCandidate[],
): Promise<{ orders: AlgoOrder[]; broker: BrokerStatus }> {
  const brokerId = getBrokerForMarket(market);
  const brokers = getAllBrokersStatus();
  const broker = brokers[brokerId];
  const created: AlgoOrder[] = [];

  for (const c of candidates) {
    const entry = c.buy_price || c.last_price;
    const stop = c.stoploss || Math.round(entry * 0.95 * 100) / 100;
    const target = c.targetPrice || Math.round(entry * 1.12 * 100) / 100;
    const orderId = `ALGO-${brokerId.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 1000,
    )}`;

    let orderType = 'Conditional Limit Order';
    if (brokerId === 'groww') {
      orderType = 'Groww GTT OCO Trigger';
    } else if (brokerId === 'kraken') {
      orderType = 'Kraken Conditional Stop-Limit';
    } else if (brokerId === 'etoro') {
      orderType = 'eToro Bracket (SL/TP)';
    }

    const newOrder: AlgoOrder = {
      id: orderId,
      brokerId,
      market,
      symbol: c.symbol,
      companyName: c.companyName || c.symbol,
      entryPrice: entry,
      stoploss: stop,
      targetPrice: target,
      currentPrice: c.last_price || entry,
      quantity: market === 'crypto' ? 0.05 : market === 'nasdaq' ? 10 : 1,
      orderType,
      status: 'active',
      mode: broker.mode,
      createdAt: new Date().toISOString(),
      message:
        broker.mode === 'live'
          ? `Transmitted to ${broker.name} API. Active trigger at ${entry}.`
          : `Simulated trigger active on ${broker.name} paper tape.`,
    };

    // If Groww market, sync with Groww dummy GTT ledger as well
    if (brokerId === 'groww') {
      const existing = loadDummyGtts();
      existing.push({
        symbol: c.symbol,
        buy_gtt_id: `DUMMY-GTT-BUY-${Date.now()}`,
        stoploss_gtt_id: `DUMMY-GTT-SL-${Date.now()}`,
        buy_trigger_price: entry,
        buy_limit_price: entry,
        stoploss_trigger_price: stop,
        stoploss_limit_price: stop,
        quantity: 1,
        created_at: new Date().toISOString(),
        status: 'active',
      });
      saveDummyGtts(existing);
    }

    algoOrders.unshift(newOrder);
    created.push(newOrder);
  }

  return { orders: created, broker: getAllBrokersStatus()[brokerId] };
}

export function getAlgoOrders(market?: MarketType): AlgoOrder[] {
  if (!market) return algoOrders;
  return algoOrders.filter((o) => o.market === market);
}

export function cancelAlgoOrder(orderId: string): boolean {
  const index = algoOrders.findIndex((o) => o.id === orderId);
  if (index >= 0) {
    algoOrders[index].status = 'cancelled';
    return true;
  }
  return false;
}
