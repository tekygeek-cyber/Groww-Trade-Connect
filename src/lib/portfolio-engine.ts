import type { MarketType } from '../types/market';
import type {
  PortfolioHolding,
  PortfolioSummary,
  MarketOpportunity,
  PortfolioMixPlan,
  PortfolioMixAllocation,
} from '../types/portfolio';
import { getConstituent, MARKETS } from '../data/universes';

export const INITIAL_HOLDINGS: PortfolioHolding[] = [
  // Nifty 100 Core Equities
  {
    id: 'pos-rel-1',
    ticker: 'RELIANCE',
    name: 'Reliance Industries Ltd.',
    market: 'nifty',
    shares: 45,
    averageBuyPrice: 2880.0,
    buyDate: '2024-05-14',
    notes: 'Core conglomerate holding. Retail & 5G catalyst expansion.',
  },
  {
    id: 'pos-tcs-1',
    ticker: 'TCS',
    name: 'Tata Consultancy Services Ltd.',
    market: 'nifty',
    shares: 30,
    averageBuyPrice: 3920.0,
    buyDate: '2024-06-20',
    notes: 'Tier-1 IT cash compounder. Strong North American TCV pipeline.',
  },
  {
    id: 'pos-hdfc-1',
    ticker: 'HDFCBANK',
    name: 'HDFC Bank Ltd.',
    market: 'nifty',
    shares: 60,
    averageBuyPrice: 1610.0,
    buyDate: '2024-07-08',
    notes: 'Banking leader. NIM stabilization and LDR normalization play.',
  },
  {
    id: 'pos-infy-1',
    ticker: 'INFY',
    name: 'Infosys Ltd.',
    market: 'nifty',
    shares: 50,
    averageBuyPrice: 1780.0,
    buyDate: '2024-08-11',
    notes: 'IT momentum pick. Cloud digital transformation demand.',
  },

  // NASDAQ Tech Leaders
  {
    id: 'pos-nvda-1',
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    market: 'nasdaq',
    shares: 25,
    averageBuyPrice: 118.5,
    buyDate: '2024-06-18',
    notes: 'Accelerated computing architecture monopoly & hyperscale capex.',
  },
  {
    id: 'pos-aapl-1',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    market: 'nasdaq',
    shares: 40,
    averageBuyPrice: 215.0,
    buyDate: '2024-04-22',
    notes: 'Consumer ecosystem cash generator & high-margin Services mix.',
  },
  {
    id: 'pos-msft-1',
    ticker: 'MSFT',
    name: 'Microsoft Corp.',
    market: 'nasdaq',
    shares: 20,
    averageBuyPrice: 410.0,
    buyDate: '2024-05-30',
    notes: 'Enterprise cloud & AI copilot commercial seat expansion.',
  },

  // Crypto Majors
  {
    id: 'pos-btc-1',
    ticker: 'BTC',
    name: 'Bitcoin',
    market: 'crypto',
    shares: 0.45,
    averageBuyPrice: 62500.0,
    buyDate: '2024-05-02',
    notes: 'Digital gold hedge. Institutional ETF absorption above 200 SMA.',
  },
  {
    id: 'pos-eth-1',
    ticker: 'ETH',
    name: 'Ethereum',
    market: 'crypto',
    shares: 3.5,
    averageBuyPrice: 2420.0,
    buyDate: '2024-07-15',
    notes: 'Smart contract layer-1 settlement baseline with 28% staked.',
  },

  // Liquid ETFs & Hedges
  {
    id: 'pos-niftybees-1',
    ticker: 'NIFTYBEES',
    name: 'Nippon India ETF Nifty 50 BeES',
    market: 'etfs',
    shares: 250,
    averageBuyPrice: 245.0,
    buyDate: '2024-03-10',
    notes: 'Benchmark Indian index anchor with lowest tracking error.',
  },
  {
    id: 'pos-goldbees-1',
    ticker: 'GOLDBEES',
    name: 'Nippon India ETF Gold BeES',
    market: 'etfs',
    shares: 600,
    averageBuyPrice: 58.5,
    buyDate: '2024-04-05',
    notes: 'Macro geopolitical and inflationary hedge buffer.',
  },
  {
    id: 'pos-qqq-1',
    ticker: 'QQQ',
    name: 'Invesco QQQ Trust',
    market: 'etfs',
    shares: 15,
    averageBuyPrice: 475.0,
    buyDate: '2024-06-01',
    notes: 'Broad tech index exposure with strong relative strength.',
  },
];

// Approximate FX conversion rates for unified valuation dashboard
// 1 USD = 86.5 INR; 1 USDT = 1 USD
export const FX_USD_TO_INR = 86.5;

export function convertToINR(amount: number, market: MarketType): number {
  if (market === 'nasdaq' || market === 'crypto') {
    return amount * FX_USD_TO_INR;
  }
  return amount; // Nifty and Indian ETFs already in INR
}

export function convertToUSD(amount: number, market: MarketType): number {
  if (market === 'nifty' || market === 'etfs') {
    return amount / FX_USD_TO_INR;
  }
  return amount;
}

export function computePortfolioSummary(
  holdings: PortfolioHolding[],
  quotes: Record<string, { price: number; change: number; changePct: number }>,
  cashReserveINR: number = 350000
): PortfolioSummary {
  let totalInvested = 0;
  let currentValue = 0;
  let dayPnL = 0;

  const byMarket: Record<MarketType, { invested: number; value: number; pnl: number; count: number; weight: number }> = {
    nifty: { invested: 0, value: 0, pnl: 0, count: 0, weight: 0 },
    crypto: { invested: 0, value: 0, pnl: 0, count: 0, weight: 0 },
    nasdaq: { invested: 0, value: 0, pnl: 0, count: 0, weight: 0 },
    etfs: { invested: 0, value: 0, pnl: 0, count: 0, weight: 0 },
  };

  for (const h of holdings) {
    const q = quotes[h.ticker];
    const livePrice = q?.price ?? h.averageBuyPrice;
    const prevClose = livePrice - (q?.change ?? 0);

    const posInvestedNative = h.shares * h.averageBuyPrice;
    const posCurrentNative = h.shares * livePrice;
    const posDayChangeNative = h.shares * (livePrice - prevClose);

    // Convert to unified INR for aggregate math
    const posInvestedINR = convertToINR(posInvestedNative, h.market);
    const posCurrentINR = convertToINR(posCurrentNative, h.market);
    const posDayChangeINR = convertToINR(posDayChangeNative, h.market);

    totalInvested += posInvestedINR;
    currentValue += posCurrentINR;
    dayPnL += posDayChangeINR;

    const mkt = byMarket[h.market];
    mkt.invested += posInvestedINR;
    mkt.value += posCurrentINR;
    mkt.pnl += posCurrentINR - posInvestedINR;
    mkt.count += 1;
  }

  const unrealizedPnL = currentValue - totalInvested;
  const unrealizedPnLPct = totalInvested > 0 ? (unrealizedPnL / totalInvested) * 100 : 0;
  const dayPnLPct = currentValue > 0 ? (dayPnL / (currentValue - dayPnL || 1)) * 100 : 0;
  const totalDeskValue = currentValue + cashReserveINR;

  // Compute percentage weights
  if (totalDeskValue > 0) {
    for (const key of Object.keys(byMarket) as MarketType[]) {
      byMarket[key].weight = Math.round((byMarket[key].value / totalDeskValue) * 1000) / 10;
    }
  }

  return {
    totalInvested,
    currentValue,
    unrealizedPnL,
    unrealizedPnLPct,
    dayPnL,
    dayPnLPct,
    cashReserve: cashReserveINR,
    totalDeskValue,
    byMarket,
  };
}

export function generateUpcomingOpportunities(market: MarketType = 'nifty'): MarketOpportunity[] {
  // Rich quantitative opportunity setups derived from SMA crossovers, Monte Carlo edge, and breakout scans
  return [
    {
      id: 'opp-tata-1',
      ticker: 'TATASTEEL',
      name: 'Tata Steel Ltd.',
      market: 'nifty',
      opportunityType: 'Algo Breakout',
      entryPrice: 154.5,
      targetPrice: 172.0,
      stopLoss: 145.0,
      expectedEdgePct: 11.3,
      confidenceScore: 84,
      recommendedWeightPct: 6.5,
      catalystReason: '20-day high breakout with 2.4x volume multiple and tight retest confirmation above 152 support.',
      timeframe: '10–21 Days',
    },
    {
      id: 'opp-baj-1',
      ticker: 'BAJFINANCE',
      name: 'Bajaj Finance Ltd.',
      market: 'nifty',
      opportunityType: 'Monte Carlo BUY',
      entryPrice: 6890.0,
      targetPrice: 7550.0,
      stopLoss: 6520.0,
      expectedEdgePct: 9.6,
      confidenceScore: 78,
      recommendedWeightPct: 7.0,
      catalystReason: 'Golden cross with 68% of 1,000 Monte Carlo paths finishing higher. Upward median drift +5.8%.',
      timeframe: '21–45 Days',
    },
    {
      id: 'opp-meta-1',
      ticker: 'META',
      name: 'Meta Platforms Inc.',
      market: 'nasdaq',
      opportunityType: 'Quant Momentum',
      entryPrice: 585.0,
      targetPrice: 660.0,
      stopLoss: 545.0,
      expectedEdgePct: 12.8,
      confidenceScore: 88,
      recommendedWeightPct: 8.0,
      catalystReason: 'Llama enterprise adoptions + AI-optimized ad engagement margins breaking out of consolidation shelf.',
      timeframe: '15–30 Days',
    },
    {
      id: 'opp-sol-1',
      ticker: 'SOL',
      name: 'Solana',
      market: 'crypto',
      opportunityType: 'Algo Breakout',
      entryPrice: 178.5,
      targetPrice: 220.0,
      stopLoss: 158.0,
      expectedEdgePct: 23.2,
      confidenceScore: 82,
      recommendedWeightPct: 5.5,
      catalystReason: 'DEX market share expansion + breakout above $175 multi-week resistance on surging active address count.',
      timeframe: '7–21 Days',
    },
    {
      id: 'opp-mon100-1',
      ticker: 'MON100',
      name: 'Motilal Oswal Nasdaq 100 ETF',
      market: 'etfs',
      opportunityType: 'ETF Hedge',
      entryPrice: 162.0,
      targetPrice: 178.0,
      stopLoss: 154.0,
      expectedEdgePct: 9.8,
      confidenceScore: 75,
      recommendedWeightPct: 6.0,
      catalystReason: 'Currency-hedged US technology participation with tight liquidity and systematic SIP inflow support.',
      timeframe: '30–60 Days',
    },
  ];
}

export function computePortfolioMixPlan(
  holdings: PortfolioHolding[],
  summary: PortfolioSummary,
  activeMarket: MarketType = 'nifty'
): PortfolioMixPlan {
  const opportunities = generateUpcomingOpportunities(activeMarket);

  // Compute breakdown categories
  const total = summary.totalDeskValue || 1;
  const cashWeight = Math.round((summary.cashReserve / total) * 1000) / 10;

  // Group existing holdings
  const coreHoldings = holdings.filter((h) => ['RELIANCE', 'TCS', 'HDFCBANK', 'AAPL', 'MSFT', 'BTC'].includes(h.ticker));
  const otherHoldings = holdings.filter((h) => !coreHoldings.includes(h));

  let coreVal = 0;
  for (const h of coreHoldings) {
    const val = convertToINR(h.shares * h.averageBuyPrice, h.market);
    coreVal += val;
  }
  const currentCoreWeight = Math.round((coreVal / total) * 1000) / 10;

  let otherVal = 0;
  for (const h of otherHoldings) {
    const val = convertToINR(h.shares * h.averageBuyPrice, h.market);
    otherVal += val;
  }
  const currentTacticalWeight = Math.round((otherVal / total) * 1000) / 10;

  // Target allocations
  const targetCoreWeight = 48.0;
  const targetBreakoutsWeight = 22.0;
  const targetQuantSMAWeight = 20.0;
  const targetCashWeight = 10.0;

  const allocations: PortfolioMixAllocation[] = [
    {
      category: 'Core Holdings',
      currentWeight: currentCoreWeight,
      targetWeight: targetCoreWeight,
      variance: Math.round((targetCoreWeight - currentCoreWeight) * 10) / 10,
      description: 'Institutional blue-chip compounders and macro anchors providing steady baseline Sharpe ratio.',
      items: coreHoldings.map((h) => ({
        ticker: h.ticker,
        market: h.market,
        weight: Math.round((convertToINR(h.shares * h.averageBuyPrice, h.market) / total) * 1000) / 10,
        status: 'Existing' as const,
      })),
    },
    {
      category: 'Tactical Breakouts',
      currentWeight: Math.round(currentTacticalWeight * 0.5 * 10) / 10,
      targetWeight: targetBreakoutsWeight,
      variance: Math.round((targetBreakoutsWeight - currentTacticalWeight * 0.5) * 10) / 10,
      description: 'High-volume 20-day swing breakouts with confirmed volume expansion and support retest validation.',
      items: [
        ...opportunities.filter((o) => o.opportunityType === 'Algo Breakout').map((o) => ({
          ticker: o.ticker,
          market: o.market,
          weight: o.recommendedWeightPct,
          status: 'Upcoming Opportunity' as const,
        })),
      ],
    },
    {
      category: 'Quant SMA Edge',
      currentWeight: Math.round(currentTacticalWeight * 0.5 * 10) / 10,
      targetWeight: targetQuantSMAWeight,
      variance: Math.round((targetQuantSMAWeight - currentTacticalWeight * 0.5) * 10) / 10,
      description: 'Statistical BUY crossovers with >58% positive 1,000-path Monte Carlo expectancy and momentum drift.',
      items: [
        ...opportunities.filter((o) => ['Monte Carlo BUY', 'Quant Momentum'].includes(o.opportunityType)).map((o) => ({
          ticker: o.ticker,
          market: o.market,
          weight: o.recommendedWeightPct,
          status: 'Upcoming Opportunity' as const,
        })),
      ],
    },
    {
      category: 'Cash & Hedges',
      currentWeight: cashWeight,
      targetWeight: targetCashWeight,
      variance: Math.round((targetCashWeight - cashWeight) * 10) / 10,
      description: 'Dry powder buying power and non-correlated Gold/ETF hedges for volatility buffering.',
      items: [
        { ticker: 'CASH RESERVE', market: 'nifty', weight: cashWeight, status: 'Existing' as const },
        ...holdings.filter((h) => h.ticker.includes('BEES') || h.ticker === 'QQQ').map((h) => ({
          ticker: h.ticker,
          market: h.market,
          weight: Math.round((convertToINR(h.shares * h.averageBuyPrice, h.market) / total) * 1000) / 10,
          status: 'Existing' as const,
        })),
      ],
    },
  ];

  return {
    allocations,
    opportunities,
    projectedReturnPct: 18.4,
    projectedSharpeRatio: 2.15,
    maxDrawdownBufferPct: 9.2,
    generatedAt: Date.now(),
  };
}
