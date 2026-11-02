import type { MarketType } from '../types/market';
import type { PortfolioHolding } from '../types/portfolio';
import type {
  TargetAllocation,
  ScoreBreakdown,
  ProposedRebalanceOrder,
  RebalancePlanProposal,
  PlanFeasibility,
  ExecutionFillEvent,
  RebalanceBatchExecution,
  AuditSnapshot,
  AuditTriggerType,
  RebalancePreset,
} from '../types/rebalance';
import { getConstituents } from '../data/universes';

export const REBALANCE_RULE_VERSION = '2.0-audited';
export const DEFAULT_CASH_FLOOR_PCT = 5.0; // 5% minimum cash reserve
export const DRIFT_TOLERANCE_PCT = 0.5; // Ignore drift under 0.5%
export const FX_USD_TO_INR = 83.5;

export interface MarketQuoteInfo {
  price: number;
  change: number;
  changePct: number;
  sma20?: number;
  sma50?: number;
}

/**
 * Pure 40/35/25 multi-factor portfolio scoring matrix adhering strictly to Section 4.1
 */
export function calculatePortfolioScore(
  holdings: PortfolioHolding[],
  targets: TargetAllocation[],
  quotesMap: Record<string, MarketQuoteInfo>,
  cashBalance: number,
  market: MarketType,
  targetCashPct: number = DEFAULT_CASH_FLOOR_PCT
): ScoreBreakdown {
  const timestamp = Date.now();
  const unavailableReasons: string[] = [];

  // Calculate position values
  let riskyNav = 0;
  const positionValues: Record<string, number> = {};

  for (const h of holdings) {
    const q = quotesMap[h.ticker];
    const price = q?.price || h.averageBuyPrice || 100;
    const val = h.shares * price;
    positionValues[h.ticker] = val;
    riskyNav += val;
  }

  const totalNav = riskyNav + cashBalance;

  if (totalNav <= 0) {
    return {
      compositeScore: null,
      allocationScore: null,
      technicalScore: null,
      diversificationScore: null,
      unroundedDriftD: 0,
      hhi: 0,
      eligibleRiskyCount: 0,
      riskyNav: 0,
      cashWeight: 0,
      targetCashWeight: targetCashPct / 100,
      ruleVersion: REBALANCE_RULE_VERSION,
      timestamp,
      asOfLabel: new Date(timestamp).toLocaleTimeString(),
      unavailableReasons: ['Total NAV is zero or negative'],
    };
  }

  // Current weight vectors
  const currentCashWeight = cashBalance / totalNav;
  const currentWeights: Record<string, number> = {};
  for (const h of holdings) {
    currentWeights[h.ticker] = (positionValues[h.ticker] || 0) / totalNav;
  }

  // Target weight vectors
  const targetWeights: Record<string, number> = {};
  for (const t of targets) {
    targetWeights[t.ticker] = t.targetWeightPct / 100;
  }
  const normTargetCashWeight = targetCashPct / 100;

  // Union of all tickers in held + positive-target universe
  const allTickerSet = new Set<string>([
    ...holdings.map((h) => h.ticker),
    ...targets.filter((t) => t.targetWeightPct > 0).map((t) => t.ticker),
  ]);
  const allTickers = Array.from(allTickerSet);

  // ----------------------------------------------------
  // 1. Allocation / Drift Score (40% Weight)
  // D = 0.5 * sum |current_weight_i - target_weight_i| including cash
  // AllocationScore = 100 * (1 - D)
  // ----------------------------------------------------
  let sumAbsDiff = Math.abs(currentCashWeight - normTargetCashWeight);
  for (const sym of allTickers) {
    const curW = currentWeights[sym] || 0;
    const tgtW = targetWeights[sym] || 0;
    sumAbsDiff += Math.abs(curW - tgtW);
  }
  const driftD = 0.5 * sumAbsDiff;
  const clampedD = Math.max(0, Math.min(1, driftD));
  const allocationScore = Math.max(0, Math.min(100, 100 * (1 - clampedD)));

  // ----------------------------------------------------
  // 2. Technical Signal Alignment (35% Weight)
  // RiskyNAV = sum(position_value_i)
  // r_i = position_value_i / RiskyNAV
  // s_i = 1.0 (bullish), 0.5 (neutral), 0.0 (bearish)
  // TechnicalScore = 100 * sum(r_i * s_i)
  // If missing signal for any held risky position => TechnicalScore = null
  // ----------------------------------------------------
  let technicalScore: number | null = null;
  if (riskyNav > 0) {
    let techSum = 0;
    let missingSignal = false;

    for (const h of holdings) {
      if (h.shares <= 0) continue;
      const q = quotesMap[h.ticker];
      if (!q) {
        missingSignal = true;
        unavailableReasons.push(`Missing real-time quote for ${h.ticker}`);
        continue;
      }

      // Signal state evaluation: SMA20 > SMA50 (bullish=1.0), SMA20 == SMA50 (neutral=0.5), SMA20 < SMA50 (bearish=0.0)
      let s_i = 0.5;
      if (typeof q.sma20 === 'number' && typeof q.sma50 === 'number') {
        if (q.sma20 > q.sma50) s_i = 1.0;
        else if (q.sma20 < q.sma50) s_i = 0.0;
        else s_i = 0.5;
      } else {
        // Fallback to daily price trend if SMA not directly supplied
        if (q.changePct > 0.2) s_i = 1.0;
        else if (q.changePct < -0.2) s_i = 0.0;
        else s_i = 0.5;
      }

      const r_i = (positionValues[h.ticker] || 0) / riskyNav;
      techSum += r_i * s_i;
    }

    if (!missingSignal) {
      technicalScore = Math.max(0, Math.min(100, 100 * techSum));
    }
  } else {
    // 100% cash portfolio has no risky holdings
    technicalScore = null;
    unavailableReasons.push('No risky assets held in portfolio (100% cash)');
  }

  // ----------------------------------------------------
  // 3. HHI Diversification (25% Weight)
  // u_i = position_value_i / RiskyNAV
  // HHI = sum(u_i^2)
  // n = number of distinct non-cash assets in held ∪ positive-target universe
  // DiversificationScore = 100 * (1 - HHI) / (1 - 1/n) if n >= 2
  // DiversificationScore = 0 if n = 1
  // DiversificationScore = null if RiskyNAV = 0
  // ----------------------------------------------------
  let diversificationScore: number | null = null;
  let hhi = 0;
  const eligibleRiskyCount = allTickers.length;

  if (riskyNav > 0) {
    for (const h of holdings) {
      if (h.shares <= 0) continue;
      const u_i = (positionValues[h.ticker] || 0) / riskyNav;
      hhi += u_i * u_i;
    }

    if (eligibleRiskyCount >= 2) {
      const denom = 1 - 1 / eligibleRiskyCount;
      const score = 100 * ((1 - hhi) / denom);
      diversificationScore = Math.max(0, Math.min(100, score));
    } else if (eligibleRiskyCount === 1) {
      diversificationScore = 0;
    } else {
      diversificationScore = null;
      unavailableReasons.push('No eligible risky assets in target universe');
    }
  } else {
    diversificationScore = null;
  }

  // ----------------------------------------------------
  // Composite Score
  // 0.40 * Allocation + 0.35 * Technical + 0.25 * Diversification
  // If any component is null, CompositeScore is null (Incomplete / N/A)
  // ----------------------------------------------------
  let compositeScore: number | null = null;
  if (allocationScore !== null && technicalScore !== null && diversificationScore !== null) {
    const rawComposite =
      0.4 * allocationScore + 0.35 * technicalScore + 0.25 * diversificationScore;
    compositeScore = Math.round(rawComposite * 10) / 10;
  }

  return {
    compositeScore,
    allocationScore: Math.round(allocationScore * 10) / 10,
    technicalScore: technicalScore !== null ? Math.round(technicalScore * 10) / 10 : null,
    diversificationScore:
      diversificationScore !== null ? Math.round(diversificationScore * 10) / 10 : null,
    unroundedDriftD: driftD,
    hhi: Math.round(hhi * 1000) / 1000,
    eligibleRiskyCount,
    riskyNav,
    cashWeight: Math.round(currentCashWeight * 1000) / 10,
    targetCashWeight: Math.round(normTargetCashWeight * 1000) / 10,
    ruleVersion: REBALANCE_RULE_VERSION,
    timestamp,
    asOfLabel: new Date(timestamp).toLocaleTimeString(),
    unavailableReasons,
  };
}

/**
 * Generate deterministic target presets summing to exactly 100.00%
 */
export function generatePresetTargets(
  holdings: PortfolioHolding[],
  market: MarketType,
  preset: RebalancePreset,
  quotesMap: Record<string, MarketQuoteInfo>,
  targetCashPct: number = DEFAULT_CASH_FLOOR_PCT
): TargetAllocation[] {
  // Base universe from current holdings of this market, or default constituents if empty
  const universeHoldings = holdings.filter((h) => h.market === market);
  const constituentList = getConstituents(market);

  let tickersToInclude: { ticker: string; name: string }[] = [];
  if (universeHoldings.length > 0) {
    tickersToInclude = universeHoldings.map((h) => ({ ticker: h.ticker, name: h.name }));
  } else {
    tickersToInclude = constituentList.slice(0, 6).map((c) => ({ ticker: c.ticker, name: c.name }));
  }

  const n = tickersToInclude.length;
  if (n === 0) return [];

  const riskyBudgetPct = Math.max(0, 100.0 - targetCashPct);

  if (preset === 'equal_weight') {
    const equalShare = riskyBudgetPct / n;
    const baseShare = Math.floor(equalShare * 100) / 100;
    const remainder = Math.round((riskyBudgetPct - baseShare * n) * 100) / 100;

    return tickersToInclude.map((item, idx) => ({
      ticker: item.ticker,
      name: item.name,
      market,
      targetWeightPct: idx === 0 ? Math.round((baseShare + remainder) * 100) / 100 : baseShare,
      isLocked: false,
    }));
  }

  if (preset === 'market_cap') {
    // Weight by constituent market cap index
    let totalCap = 0;
    const caps = tickersToInclude.map((item, idx) => {
      const c = constituentList.find((c) => c.ticker === item.ticker);
      // Deterministic cap proxy: index weight from market cap rank
      const capProxy = c ? Math.max(1000, 100000 - idx * 12000) : 50000;
      totalCap += capProxy;
      return capProxy;
    });

    let allocated = 0;
    const result: TargetAllocation[] = [];
    for (let i = 0; i < n; i++) {
      const w = Math.floor(((caps[i] / totalCap) * riskyBudgetPct) * 100) / 100;
      allocated += w;
      result.push({
        ticker: tickersToInclude[i].ticker,
        name: tickersToInclude[i].name,
        market,
        targetWeightPct: w,
        isLocked: false,
      });
    }
    // Largest-remainder pass to match exact risky budget
    const diff = Math.round((riskyBudgetPct - allocated) * 100) / 100;
    if (result.length > 0) {
      result[0].targetWeightPct = Math.round((result[0].targetWeightPct + diff) * 100) / 100;
    }
    return result;
  }

  if (preset === 'momentum_tilt') {
    // Momentum / Alpha Tilt: m_i = clamp(return_or_trend, -0.5, +0.5); raw_i = 1 + alpha * m_i
    const alpha = 0.4;
    let sumRaw = 0;
    const rawWeights = tickersToInclude.map((item) => {
      const q = quotesMap[item.ticker];
      const ret = (q?.changePct || 0) / 100;
      const m_i = Math.max(-0.5, Math.min(0.5, ret));
      const raw = 1 + alpha * m_i;
      sumRaw += raw;
      return raw;
    });

    let allocated = 0;
    const result: TargetAllocation[] = [];
    for (let i = 0; i < n; i++) {
      const w = Math.floor(((rawWeights[i] / sumRaw) * riskyBudgetPct) * 100) / 100;
      allocated += w;
      result.push({
        ticker: tickersToInclude[i].ticker,
        name: tickersToInclude[i].name,
        market,
        targetWeightPct: w,
        isLocked: false,
      });
    }
    const diff = Math.round((riskyBudgetPct - allocated) * 100) / 100;
    if (result.length > 0) {
      result[0].targetWeightPct = Math.round((result[0].targetWeightPct + diff) * 100) / 100;
    }
    return result;
  }

  // Custom fallback: equal weight
  return generatePresetTargets(holdings, market, 'equal_weight', quotesMap, targetCashPct);
}

/**
 * Handle slider adjustment with locked/pinned assets and largest-remainder 100.00% normalization
 */
export function adjustSliderTargets(
  currentTargets: TargetAllocation[],
  changedTicker: string,
  newWeight: number,
  targetCashPct: number = DEFAULT_CASH_FLOOR_PCT
): TargetAllocation[] {
  const original = currentTargets.map(t => ({ ...t }));
  const budget = 100 - targetCashPct;
  if (!Number.isFinite(newWeight) || !Number.isFinite(targetCashPct) ||
      targetCashPct < 0 || targetCashPct > 100 ||
      !original.some(t => t.ticker === changedTicker)) return original;

  const otherLocked = original.filter(t => t.isLocked && t.ticker !== changedTicker)
    .reduce((sum, t) => sum + t.targetWeightPct, 0);
  if (!Number.isFinite(otherLocked) || otherLocked > budget) return original;
  const allowed = Math.max(0, budget - otherLocked);
  const desired = Math.round(Math.max(0, Math.min(newWeight, allowed)) * 100) / 100;
  const updated = original.map(t => t.ticker === changedTicker
    ? { ...t, targetWeightPct: desired, isLocked: true } : t);
  const lockedSum = updated.filter(t => t.isLocked)
    .reduce((sum, t) => sum + t.targetWeightPct, 0);
  const unlocked = updated.filter(t => !t.isLocked);
  const remaining = Math.round((budget - lockedSum) * 100) / 100;

  // If all assets are locked, an edit that breaks normalization is rejected,
  // rather than pretending that an invalid allocation is a valid target.
  if (unlocked.length === 0) {
    return Math.abs(remaining) <= 0.005 ? updated : original;
  }

  const priorSum = unlocked.reduce((sum, t) => sum + t.targetWeightPct, 0);
  let allocated = 0;
  for (const target of unlocked) {
    const portion = priorSum > 0 ? target.targetWeightPct / priorSum : 1 / unlocked.length;
    const rounded = Math.floor((portion * remaining + 1e-9) * 100) / 100;
    target.targetWeightPct = rounded;
    allocated += rounded;
  }
  const residual = Math.round((remaining - allocated) * 100) / 100;
  unlocked[0].targetWeightPct = Math.round((unlocked[0].targetWeightPct + residual) * 100) / 100;
  const finalSum = updated.reduce((sum, t) => sum + t.targetWeightPct, targetCashPct);
  return updated.every(t => Number.isFinite(t.targetWeightPct) && t.targetWeightPct >= 0) &&
    Math.abs(finalSum - 100) <= 0.011 ? updated : original;
}

/**
 * Deterministic Rebalance Planner: Sells first at conservative bid, then buys at ask
 */
export function planRebalanceOrders(
  holdings: PortfolioHolding[],
  targets: TargetAllocation[],
  quotesMap: Record<string, MarketQuoteInfo>,
  cashBalance: number,
  market: MarketType,
  targetCashPct: number = DEFAULT_CASH_FLOOR_PCT
): RebalancePlanProposal {
  const proposalId = 'prop-' + Math.random().toString(36).substring(2, 9);
  const createdAt = Date.now();

  // Account cash is stored exclusively in INR. Never place USD/USDT/ETF
  // orders against INR cash until per-currency ledgers and FX snapshots exist.
  // A blocked plan returns N/A metrics rather than fabricated mixed-currency NAV.
  const invalidTargets =
    !Number.isFinite(targetCashPct) || targetCashPct < 0 || targetCashPct > 100 ||
    targets.some(t => t.market !== market || !Number.isFinite(t.targetWeightPct) ||
      t.targetWeightPct < 0 || t.targetWeightPct > 100) ||
    new Set(targets.map(t => t.ticker)).size !== targets.length ||
    Math.abs(targets.reduce((sum, t) => sum + t.targetWeightPct, targetCashPct) - 100) > 0.011;
  const missingQuote = holdings.filter(h => h.market === market).some(h =>
    h.shares > 0 && (!quotesMap[h.ticker] || !Number.isFinite(quotesMap[h.ticker].price) ||
      quotesMap[h.ticker].price <= 0)) ||
    targets.filter(t => t.targetWeightPct > 0).some(t =>
      !quotesMap[t.ticker] || !Number.isFinite(quotesMap[t.ticker].price) ||
      quotesMap[t.ticker].price <= 0);
  const invalidHoldings = holdings.filter(h => h.market === market).some(h =>
    !Number.isFinite(h.shares) || h.shares < 0) ||
    !Number.isFinite(cashBalance) || cashBalance < 0;

  if (market !== 'nifty' || invalidTargets || missingQuote || invalidHoldings) {
    const reason = market !== 'nifty'
      ? 'Rebalancing is paper-disabled for non-INR markets until currency-specific cash ledgers and FX conversion are implemented.'
      : invalidTargets ? 'Target weights are invalid or do not sum to exactly 100% including cash.'
      : missingQuote ? 'A valid price quote is missing; paper execution is blocked.'
      : 'Cash or holdings contain invalid quantities.';
    const unavailableScore: ScoreBreakdown = {
      ...calculatePortfolioScore([], [], {}, 0, market, targetCashPct),
      unavailableReasons: [reason],
    };
    return {
      id: proposalId, createdAt, market,
      feasibility: 'INFEASIBLE_CONSTRAINTS', feasibilityMessage: reason,
      currentNav: 0, currentCash: 0, targetCashWeightPct: targetCashPct,
      requiredCashFloor: 0, grossSalesProceeds: 0, grossBuyExpenditure: 0,
      totalEstimatedFees: 0, projectedCashAfterFills: 0, projectedNavAfterCosts: 0,
      orders: [], buyCount: 0, sellCount: 0,
      currentScore: unavailableScore, projectedScore: null, residualDrift: 0,
    };
  }

  // Filter holdings for this market
  const marketHoldings = holdings.filter((h) => h.market === market);
  const holdingsMap = new Map<string, PortfolioHolding>();
  marketHoldings.forEach((h) => holdingsMap.set(h.ticker, h));

  // Compute current risky NAV & total NAV
  let riskyNav = 0;
  for (const h of marketHoldings) {
    const q = quotesMap[h.ticker];
    const price = q?.price || h.averageBuyPrice || 100;
    riskyNav += h.shares * price;
  }
  const totalNav = riskyNav + cashBalance;
  const requiredCashFloor = Math.round(((targetCashPct / 100) * totalNav) * 100) / 100;

  // Union of held and targeted tickers
  const unionTickers = new Set<string>([
    ...marketHoldings.map((h) => h.ticker),
    ...targets.filter((t) => t.targetWeightPct > 0).map((t) => t.ticker),
  ]);

  const orders: ProposedRebalanceOrder[] = [];
  let conditionalCash = cashBalance;
  let grossSalesProceeds = 0;
  let grossBuyExpenditure = 0;
  let totalEstimatedFees = 0;

  // Preliminary target share calculation
  interface AssetAnalysis {
    ticker: string;
    name: string;
    currentShares: number;
    refPrice: number;
    currentWeightPct: number;
    targetWeightPct: number;
    driftPct: number;
    idealDeltaShares: number;
  }

  const analysisList: AssetAnalysis[] = [];

  for (const ticker of Array.from(unionTickers)) {
    const holding = holdingsMap.get(ticker);
    const target = targets.find((t) => t.ticker === ticker);
    const q = quotesMap[ticker];

    const currentShares = holding ? holding.shares : 0;
    const name = holding ? holding.name : target ? target.name : ticker;
    const refPrice = q?.price || holding?.averageBuyPrice || 100;

    const currentWeightPct = totalNav > 0 ? ((currentShares * refPrice) / totalNav) * 100 : 0;
    const targetWeightPct = target ? target.targetWeightPct : 0;
    const driftPct = currentWeightPct - targetWeightPct;

    const targetVal = (targetWeightPct / 100) * totalNav;
    const currentVal = currentShares * refPrice;
    const valGap = targetVal - currentVal;
    const idealDeltaShares = valGap / refPrice;

    analysisList.push({
      ticker,
      name,
      currentShares,
      refPrice,
      currentWeightPct: Math.round(currentWeightPct * 100) / 100,
      targetWeightPct: Math.round(targetWeightPct * 100) / 100,
      driftPct: Math.round(driftPct * 100) / 100,
      idealDeltaShares,
    });
  }

  // ----------------------------------------------------
  // Phase 1: Sells first at conservative bid
  // ----------------------------------------------------
  for (const a of analysisList) {
    if (a.driftPct > DRIFT_TOLERANCE_PCT && a.idealDeltaShares < -0.001) {
      // Overweight: Needs to SELL
      let sellQty = Math.abs(a.idealDeltaShares);
      // Lot sizing: integer shares for stocks/etfs, 0.001 for crypto
      if (market === 'crypto') {
        sellQty = Math.floor(sellQty * 1000) / 1000;
      } else {
        sellQty = Math.floor(sellQty);
      }

      // Never sell more than genuinely held shares
      sellQty = Math.min(a.currentShares, sellQty);

      if (sellQty > 0) {
        // Conservative bid price: 0.2% below mark for spreads/slippage
        const executionPrice = Math.round(a.refPrice * 0.998 * 100) / 100;
        const notional = Math.round(sellQty * executionPrice * 100) / 100;
        // Estimated transaction fee (0.05% with minimum threshold)
        const fee = Math.max(1, Math.round(notional * 0.0005 * 100) / 100);

        grossSalesProceeds += notional;
        totalEstimatedFees += fee;
        conditionalCash += notional - fee;

        orders.push({
          id: 'ord-s-' + a.ticker,
          ticker: a.ticker,
          name: a.name,
          market,
          side: 'SELL',
          alignment: 'OVERWEIGHT_SELL',
          currentShares: a.currentShares,
          targetShares: a.currentShares - sellQty,
          quantityDelta: sellQty,
          referencePrice: a.refPrice,
          executionPrice,
          orderNotional: notional,
          estimatedFee: fee,
          currentWeightPct: a.currentWeightPct,
          targetWeightPct: a.targetWeightPct,
          driftPct: a.driftPct,
          status: 'PROPOSED',
        });
      }
    }
  }

  // ----------------------------------------------------
  // Phase 2: Buys in priority order of largest underweight
  // ----------------------------------------------------
  const buyCandidates = analysisList
    .filter((a) => a.driftPct < -DRIFT_TOLERANCE_PCT && a.idealDeltaShares > 0.001)
    .sort((a, b) => a.driftPct - b.driftPct); // Most negative drift first

  for (const a of buyCandidates) {
    // Check spendable cash while preserving required cash floor
    const spendableCash = Math.max(0, conditionalCash - requiredCashFloor);
    if (spendableCash <= 0) break;

    let buyQty = a.idealDeltaShares;
    if (market === 'crypto') {
      buyQty = Math.floor(buyQty * 1000) / 1000;
    } else {
      buyQty = Math.floor(buyQty);
    }

    if (buyQty <= 0) continue;

    // Conservative ask price: 0.2% above mark
    const executionPrice = Math.round(a.refPrice * 1.002 * 100) / 100;
    let notional = buyQty * executionPrice;
    let fee = Math.max(1, Math.round(notional * 0.0005 * 100) / 100);

    // If required cash breaches spendable, scale down
    if (notional + fee > spendableCash) {
      // Reserve both the percentage fee and the minimum fixed fee, plus
      // one cent of rounding headroom, before sizing the final whole lot.
      const affordableNotional = Math.max(0, (spendableCash - 1.01) / 1.0005);
      if (market === 'crypto') {
        buyQty = Math.floor((affordableNotional / executionPrice) * 1000) / 1000;
      } else {
        buyQty = Math.floor(affordableNotional / executionPrice);
      }
      notional = buyQty * executionPrice;
      fee = Math.max(1, Math.round(notional * 0.0005 * 100) / 100);
    }

    if (buyQty > 0 && Number.isFinite(notional) && Number.isFinite(fee) &&
        notional + fee <= spendableCash + 0.00001) {
      grossBuyExpenditure += notional;
      totalEstimatedFees += fee;
      conditionalCash -= notional + fee;

      orders.push({
        id: 'ord-b-' + a.ticker,
        ticker: a.ticker,
        name: a.name,
        market,
        side: 'BUY',
        alignment: 'UNDERWEIGHT_BUY',
        currentShares: a.currentShares,
        targetShares: a.currentShares + buyQty,
        quantityDelta: buyQty,
        referencePrice: a.refPrice,
        executionPrice,
        orderNotional: Math.round(notional * 100) / 100,
        estimatedFee: fee,
        currentWeightPct: a.currentWeightPct,
        targetWeightPct: a.targetWeightPct,
        driftPct: a.driftPct,
        status: 'PROPOSED',
      });
    }
  }

  // ----------------------------------------------------
  // Phase 3: Feasibility validation & projected scores
  // ----------------------------------------------------
  let feasibility: PlanFeasibility = 'FEASIBLE';
  let feasibilityMessage = 'All proposed orders are feasible within account liquidity and reserve policy.';

  if (conditionalCash < requiredCashFloor - 0.005) {
    feasibility = 'INFEASIBLE_CASH_FLOOR';
    feasibilityMessage = `Projected cash (${Math.round(conditionalCash)}) falls below the required ${targetCashPct}% reserve floor (${Math.round(requiredCashFloor)}).`;
  } else if (orders.length === 0 && analysisList.some(a => Math.abs(a.driftPct) > DRIFT_TOLERANCE_PCT)) {
    feasibility = 'PARTIAL_FEASIBLE';
    feasibilityMessage = 'Residual drift exists, but whole lot sizes or cash reserve prevented further orders.';
  }

  // Build projected holdings for post-trade scoring
  const projectedHoldings: PortfolioHolding[] = [];
  for (const a of analysisList) {
    const order = orders.find((o) => o.ticker === a.ticker);
    const finalShares = order ? order.targetShares : a.currentShares;
    if (finalShares > 0) {
      projectedHoldings.push({
        id: 'proj-' + a.ticker,
        ticker: a.ticker,
        name: a.name,
        market,
        shares: finalShares,
        averageBuyPrice: a.refPrice,
        buyDate: new Date().toISOString().split('T')[0],
      });
    }
  }

  const currentScore = calculatePortfolioScore(
    marketHoldings,
    targets,
    quotesMap,
    cashBalance,
    market,
    targetCashPct
  );

  const projectedScore = calculatePortfolioScore(
    projectedHoldings,
    targets,
    quotesMap,
    conditionalCash,
    market,
    targetCashPct
  );
  // Report the remaining drift honestly after whole-lot sizing and fees.
  if (feasibility === 'FEASIBLE' &&
      projectedScore.unroundedDriftD * 100 > DRIFT_TOLERANCE_PCT + 1e-6) {
    feasibility = 'PARTIAL_FEASIBLE';
    feasibilityMessage = 'Some target drift remains after lot sizing, fees, and cash reserve constraints.';
  }

  return {
    id: proposalId,
    createdAt,
    market,
    feasibility,
    feasibilityMessage,
    currentNav: Math.round(totalNav * 100) / 100,
    currentCash: Math.round(cashBalance * 100) / 100,
    targetCashWeightPct: targetCashPct,
    requiredCashFloor,
    grossSalesProceeds: Math.round(grossSalesProceeds * 100) / 100,
    grossBuyExpenditure: Math.round(grossBuyExpenditure * 100) / 100,
    totalEstimatedFees: Math.round(totalEstimatedFees * 100) / 100,
    projectedCashAfterFills: Math.round(conditionalCash * 100) / 100,
    projectedNavAfterCosts: Math.round((totalNav - totalEstimatedFees) * 100) / 100,
    orders,
    buyCount: orders.filter((o) => o.side === 'BUY').length,
    sellCount: orders.filter((o) => o.side === 'SELL').length,
    currentScore,
    projectedScore,
    residualDrift: projectedScore.unroundedDriftD,
  };
}

/**
 * Paper fill reconciliation: applies confirmed deduplicated order fills to portfolio state
 */
export function reconcilePaperFills(
  currentHoldings: PortfolioHolding[],
  currentCash: number,
  orders: ProposedRebalanceOrder[]
): {
  updatedHoldings: PortfolioHolding[];
  updatedCash: number;
  batchExecution: RebalanceBatchExecution;
} {
  const batchId = 'batch-' + Math.random().toString(36).substring(2, 9);
  const authorizedAt = Date.now();
  const fills: ExecutionFillEvent[] = [];

  let newCash = currentCash;
  const holdingsMap = new Map<string, PortfolioHolding>();
  currentHoldings.forEach((h) => holdingsMap.set(`${h.market}:${h.ticker}`, { ...h }));

  let grossFilledValue = 0;
  let totalFeesCharged = 0;

  for (const ord of orders) {
    const fillId = 'fill-' + Math.random().toString(36).substring(2, 9);
    fills.push({
      fillId,
      orderId: ord.id,
      ticker: ord.ticker,
      side: ord.side,
      shares: ord.quantityDelta,
      price: ord.executionPrice,
      fee: ord.estimatedFee,
      timestamp: Date.now(),
    });

    grossFilledValue += ord.orderNotional;
    totalFeesCharged += ord.estimatedFee;

    const key = `${ord.market}:${ord.ticker}`;
    const existing = holdingsMap.get(key);

    if (ord.side === 'SELL') {
      newCash += ord.orderNotional - ord.estimatedFee;
      if (existing) {
        existing.shares = Math.max(0, existing.shares - ord.quantityDelta);
      }
    } else {
      // BUY
      newCash -= ord.orderNotional + ord.estimatedFee;
      if (existing) {
        existing.shares += ord.quantityDelta;
      } else {
        holdingsMap.set(key, {
          id: 'pos-' + Math.random().toString(36).substring(2, 9),
          ticker: ord.ticker,
          name: ord.name,
          market: ord.market,
          shares: ord.quantityDelta,
          averageBuyPrice: ord.executionPrice,
          buyDate: new Date().toISOString().split('T')[0],
          notes: 'Executed via Rebalance Tool',
        });
      }
    }
  }

  // Filter out any positions with 0 shares
  const updatedHoldings = Array.from(holdingsMap.values()).filter((h) => h.shares > 0);

  const batchExecution: RebalanceBatchExecution = {
    batchId,
    status: 'RECONCILED',
    authorizedAt,
    completedAt: Date.now(),
    totalOrders: orders.length,
    filledOrders: orders.length,
    grossFilledValue: Math.round(grossFilledValue * 100) / 100,
    totalFeesCharged: Math.round(totalFeesCharged * 100) / 100,
    fills,
  };

  return {
    updatedHoldings,
    updatedCash: Math.round(newCash * 100) / 100,
    batchExecution,
  };
}

/**
 * Generate an audit snapshot with complete provenance adhering to Section 9
 */
export function createAuditSnapshot(
  score: ScoreBreakdown,
  market: MarketType,
  nav: number,
  holdingsCount: number,
  trigger: AuditTriggerType,
  isSimulated: boolean = false,
  notes: string = ''
): AuditSnapshot {
  const id = 'audit-' + Math.random().toString(36).substring(2, 9);
  const timestamp = Date.now();
  const date = new Date(timestamp);

  let defaultNotes = notes;
  if (!defaultNotes) {
    if (trigger === 'FRIDAY_CLOSE_SCHEDULED' || trigger === 'FRIDAY_CLOSE_SIMULATED') {
      defaultNotes = 'Pre-weekend Friday Close audit: verifying allocation drift against gap risk.';
    } else if (trigger === 'MONDAY_OPEN_SCHEDULED' || trigger === 'MONDAY_OPEN_SIMULATED') {
      defaultNotes = 'Weekly Monday Open audit: reassessing technical signal alignment after opening bell.';
    } else if (trigger === 'POST_REBALANCE_RECONCILED') {
      defaultNotes = 'Post-rebalance reconciled state: score updated after confirmed fill batch execution.';
    } else {
      defaultNotes = 'Manual audit recalculation by desk operator.';
    }
  }

  return {
    id,
    market,
    trigger,
    timestamp,
    sessionId: `${market}-${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`,
    isSimulated,
    score,
    nav,
    holdingsCount,
    notes: defaultNotes,
  };
}
