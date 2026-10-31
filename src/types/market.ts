export type MarketType = 'nifty' | 'crypto' | 'nasdaq' | 'etfs';

export type MarketConfig = {
  id: MarketType;
  label: string;
  currency: string;
  currencySymbol: string;
  session: string;
  timezone: string;
  defaultDataSource: string;
  is24x7: boolean;
};

export const MARKETS: Record<MarketType, MarketConfig> = {
  nifty: {
    id: 'nifty',
    label: 'Nifty 100',
    currency: 'INR',
    currencySymbol: '₹',
    session: '09:15–15:30 IST',
    timezone: 'Asia/Kolkata',
    defaultDataSource: 'Groww Feed / NSE Tape',
    is24x7: false,
  },
  crypto: {
    id: 'crypto',
    label: 'Crypto Majors',
    currency: 'USDT',
    currencySymbol: '₮',
    session: '24/7 Continuous',
    timezone: 'UTC',
    defaultDataSource: 'Binance Public Spot Stream',
    is24x7: true,
  },
  nasdaq: {
    id: 'nasdaq',
    label: 'NASDAQ-100',
    currency: 'USD',
    currencySymbol: '$',
    session: '09:30–16:00 ET',
    timezone: 'America/New_York',
    defaultDataSource: 'Stooq Daily / Binance Equity',
    is24x7: false,
  },
  etfs: {
    id: 'etfs',
    label: 'Liquid ETFs',
    currency: 'Multi (USD / INR)',
    currencySymbol: '$',
    session: 'Exchange Hours',
    timezone: 'America/New_York',
    defaultDataSource: 'Stooq / NSE BeES',
    is24x7: false,
  },
};

export type AssetTag = 'Equity' | 'Bond' | 'Commodity' | 'Broad market';

export type Constituent = {
  ticker: string;
  name: string;
  market: MarketType;
  currency: 'INR' | 'USD' | 'USDT';
  sector?: string;
  exchangeToken?: string;
  assetTag?: AssetTag;
  tickSize?: number;
};

export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type QuoteStatus = 'Live' | 'Delayed' | 'Closed' | 'Sample';

export type Quote = {
  ticker: string;
  market: MarketType;
  price: number;
  change: number;
  changePct: number;
  previousClose: number;
  timestamp: number;
  status: QuoteStatus;
  source: string;
};

export type AlertType =
  | 'price_above'
  | 'price_below'
  | 'pct_move_above'
  | 'pct_move_below'
  | 'sma_cross'
  | 'mc_stance';

export type DeskAlert = {
  id: string;
  market: MarketType;
  ticker: string;
  type: AlertType;
  threshold?: number;
  stance?: 'BUY' | 'SELL';
  armed: boolean;
  createdAt: string;
  lastFiredAt?: string;
};

export type FiredAlert = {
  id: string;
  alertId: string;
  timestamp: string;
  market: MarketType;
  ticker: string;
  condition: string;
  triggerPrice: number;
  currencySymbol: string;
  isSample?: boolean;
};

export type SignalRow = {
  rank: number;
  ticker: string;
  company: string;
  nse_token?: string;
  crossover_type: 'bullish' | 'bearish';
  crossover_date: string;
  close: number;
  sma_short: number;
  sma_long: number;
  bars_since: number;
  asset_tag?: AssetTag;
  currency?: string;
  live_price?: number;
  volume_sparse?: boolean;
};

export type ScanMeta = {
  sample: boolean;
  market: MarketType;
  universe: number;
  matched: number;
  with_crossover: number;
  shown: number;
  unmapped: string[];
  failed: string[];
  source: string;
  short_window: number;
  long_window: number;
  lookback_days: number;
};

export type ScanJob = {
  id: string;
  market: MarketType;
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  message: string;
  results: SignalRow[] | null;
  meta: ScanMeta | null;
  error: string | null;
};

export type SimResult = {
  ticker: string;
  signal: 'BUY' | 'SELL' | 'HOLD' | 'WATCH';
  p_up: number;
  median_return: number;
  p05: number;
  p95: number;
  paths: number;
  horizon_days: number;
  reason: string;
};

export type ScanParams = {
  short_window: number;
  long_window: number;
  lookback_days: number;
  max_stocks: number;
};

export type Strategy = {
  id: string;
  name: string;
  source: string;
  summary: string;
};

export type Trade = {
  entry_date: string;
  exit_date: string | null;
  return: number;
  open?: boolean;
};

export type Study = {
  ticker: string;
  market: MarketType;
  strategy: string;
  bars: number;
  from: string;
  to: string;
  trades: number;
  win_rate: number | null;
  total_return: number;
  max_drawdown: number;
  open: boolean;
  stance: 'LONG' | 'FLAT';
  last_close: number;
  sample: boolean;
  source: string;
  recent_trades: Trade[];
};

export type BoardRow = {
  rank: number;
  ticker: string;
  company: string;
  stance: 'LONG' | 'FLAT';
  total_return: number;
  max_drawdown: number;
  trades: number;
  open: boolean;
  win_rate: number | null;
  last_close: number;
  asset_tag?: AssetTag;
};

export type AutoLog = {
  at?: string;
  ticker?: string;
  side?: string;
  qty?: number;
  price?: number;
  mode?: string;
  status?: string;
  note?: string;
};

export type AutoState = {
  enabled: boolean;
  mode: 'paper' | 'live' | string;
  live_armed: boolean;
  strategy: string;
  quantity: number;
  max_orders: number;
  symbols: string[];
  sample: boolean;
  positions: Record<string, { qty: number; entry: number; entry_date: string }>;
  log: AutoLog[];
  last_cycle: string | null;
};

export type Setup = {
  breakoutDate: string;
  bIndex: number;
  daysSince: number;
  breakoutLow: number;
  breakoutHigh: number;
  midpoint: number;
  distanceFromMidpoint: number;
  volMultiple: number;
  prevHigh: number;
  maxPriceAfter: number;
  returnFromCloseToSubHigh: number;
  retracementHigh: number;
  currentPrice: number;
};

export type ScanHit = Setup & {
  symbol: string;
  companyName: string;
  exchange_token?: string;
  currency?: string;
  candles: Candle[];
  volume_sparse?: boolean;
};

export type GttRow = {
  symbol: string;
  quantity: number;
  buy_price: number | null;
  stoploss: number | null;
  tick_size: number | null;
  last_price: number | null;
  account_state: string;
  position_quantity: number;
  active_buy_trigger_id: string | null;
  active_stoploss_trigger_id: string | null;
  day_buy_order_id: string | null;
  day_buy_order_status: string | null;
  buy_status: string;
  buy_trigger_id: string | null;
  stoploss_status: string | null;
  stoploss_trigger_id: string | null;
  message: string;
};

export type Profile = {
  user_name: string | null;
  user_id: string | null;
  products: string[];
  exchanges: string[];
  ddpi_enabled: boolean | null;
  sample: boolean;
};

export type SessionStatus = {
  authenticated: boolean;
  expires_at?: string;
  flow?: 'approval' | 'totp' | string;
  offline?: boolean;
};
