import type { MarketType } from './market';

export interface PortfolioHolding {
  id: string;
  ticker: string;
  name: string;
  market: MarketType;
  shares: number;
  averageBuyPrice: number;
  buyDate: string;
  notes?: string;
}

export interface PortfolioSummary {
  totalInvested: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  dayPnL: number;
  dayPnLPct: number;
  cashReserve: number;
  totalDeskValue: number;
  byMarket: Record<MarketType, { invested: number; value: number; pnl: number; count: number; weight: number }>;
}

export interface MarketOpportunity {
  id: string;
  ticker: string;
  name: string;
  market: MarketType;
  opportunityType: 'Monte Carlo BUY' | 'Algo Breakout' | 'Quant Momentum' | 'ETF Hedge';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  expectedEdgePct: number;
  confidenceScore: number; // 0-100
  recommendedWeightPct: number;
  catalystReason: string;
  timeframe: string;
}

export interface PortfolioMixAllocation {
  category: 'Core Holdings' | 'Tactical Breakouts' | 'Quant SMA Edge' | 'Cash & Hedges';
  currentWeight: number; // %
  targetWeight: number; // %
  variance: number; // target - current
  description: string;
  items: { ticker: string; market: MarketType; weight: number; status: 'Existing' | 'Upcoming Opportunity' }[];
}

export interface PortfolioMixPlan {
  allocations: PortfolioMixAllocation[];
  opportunities: MarketOpportunity[];
  projectedReturnPct: number;
  projectedSharpeRatio: number;
  maxDrawdownBufferPct: number;
  generatedAt: number;
}
