import type { MarketType } from './market';

export type RebalancePreset = 'equal_weight' | 'market_cap' | 'momentum_tilt' | 'custom';

export interface TargetAllocation {
  ticker: string;
  name: string;
  market: MarketType;
  targetWeightPct: number; // 0 to 100, e.g. 25.0
  isLocked?: boolean;
}

export interface ScoreBreakdown {
  compositeScore: number | null; // 0-100, or null if N/A
  allocationScore: number | null; // 40% weight
  technicalScore: number | null; // 35% weight
  diversificationScore: number | null; // 25% weight
  unroundedDriftD: number; // 0.5 * sum |current - target|
  hhi: number; // sum(u_i^2)
  eligibleRiskyCount: number;
  riskyNav: number;
  cashWeight: number;
  targetCashWeight: number;
  ruleVersion: string; // '2.0-audited'
  timestamp: number;
  asOfLabel: string;
  unavailableReasons: string[];
}

export type OrderSide = 'BUY' | 'SELL';
export type AlignmentStatus = 'UNDERWEIGHT_BUY' | 'OVERWEIGHT_SELL' | 'ALIGNED';

export interface ProposedRebalanceOrder {
  id: string;
  ticker: string;
  name: string;
  market: MarketType;
  side: OrderSide;
  alignment: AlignmentStatus;
  currentShares: number;
  targetShares: number;
  quantityDelta: number; // absolute share delta to trade
  referencePrice: number; // valuation price
  executionPrice: number; // bid for sell, ask for buy
  orderNotional: number; // quantityDelta * executionPrice
  estimatedFee: number; // estimated brokerage / exchange fees
  currentWeightPct: number;
  targetWeightPct: number;
  driftPct: number; // current - target
  status: 'PROPOSED' | 'AUTHORIZED' | 'FILLED' | 'REJECTED';
}

export type PlanFeasibility = 'FEASIBLE' | 'PARTIAL_FEASIBLE' | 'INFEASIBLE_CASH_FLOOR' | 'INFEASIBLE_CONSTRAINTS';

export interface RebalancePlanProposal {
  id: string;
  createdAt: number;
  market: MarketType;
  feasibility: PlanFeasibility;
  feasibilityMessage: string;
  currentNav: number;
  currentCash: number;
  targetCashWeightPct: number;
  requiredCashFloor: number;
  grossSalesProceeds: number;
  grossBuyExpenditure: number;
  totalEstimatedFees: number;
  projectedCashAfterFills: number;
  projectedNavAfterCosts: number;
  orders: ProposedRebalanceOrder[];
  buyCount: number;
  sellCount: number;
  currentScore: ScoreBreakdown;
  projectedScore: ScoreBreakdown | null;
  residualDrift: number;
}

export interface ExecutionFillEvent {
  fillId: string;
  orderId: string;
  ticker: string;
  side: OrderSide;
  shares: number;
  price: number;
  fee: number;
  timestamp: number;
}

export interface RebalanceBatchExecution {
  batchId: string;
  status: 'DRAFT' | 'AUTHORIZED' | 'SUBMITTING' | 'RECONCILED' | 'REJECTED';
  authorizedAt: number;
  completedAt?: number;
  totalOrders: number;
  filledOrders: number;
  grossFilledValue: number;
  totalFeesCharged: number;
  fills: ExecutionFillEvent[];
}

export type AuditTriggerType =
  | 'MANUAL_REFRESH'
  | 'POST_REBALANCE_RECONCILED'
  | 'FRIDAY_CLOSE_SCHEDULED'
  | 'MONDAY_OPEN_SCHEDULED'
  | 'FRIDAY_CLOSE_SIMULATED'
  | 'MONDAY_OPEN_SIMULATED';

export interface AuditSnapshot {
  id: string;
  market: MarketType;
  trigger: AuditTriggerType;
  timestamp: number;
  sessionId: string;
  isSimulated: boolean;
  score: ScoreBreakdown;
  nav: number;
  holdingsCount: number;
  notes: string;
}
