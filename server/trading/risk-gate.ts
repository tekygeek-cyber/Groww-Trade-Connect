import { randomUUID } from 'node:crypto';

/** Canonical trading types. This evaluator NEVER submits orders. */
export type Market = 'CRYPTO' | 'NASDAQ' | 'NSE';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC';
export type GateDecision = 'PASS' | 'PASS_WITH_LIMIT' | 'REVIEW' | 'BLOCK';
export type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export interface ProposedOrder {
  requestId: string; userId: string; accountId: string; market: Market;
  symbol: string; side: OrderSide; quantity: number; orderType: OrderType;
  limitPrice?: number; stopPrice?: number; timeInForce: TimeInForce;
  strategyId: string; proposedBy: 'AI_STRATEGY_AGENT';
  executionMode: 'PAPER' | 'LIVE';
  humanApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}
export interface InstrumentSnapshot {
  market: Market; symbol: string; currency: 'INR' | 'USD' | 'USDT';
  tradable: boolean; marketOpen: boolean; halted: boolean; restricted: boolean;
  tickSize: number; lotSize: number; minQuantity: number; lastPrice: number;
  asOf: string; upperPriceBand?: number; lowerPriceBand?: number;
  corporateActionBlocked?: boolean; providerVerified: boolean;
}
export interface AccountSnapshot {
  userId: string; accountId: string; currency: 'INR' | 'USD' | 'USDT';
  authenticated: boolean; permittedMarkets: Market[];
  equity: number; availableCash: number; openPositionQuantity: number;
  currentSymbolExposure: number; currentMarketExposure: number; totalExposure: number;
  realizedPnlToday: number; unrealizedPnlToday: number;
  ordersSubmittedToday: number; turnoverToday: number; leverage: number;
  ordersLastSecond: number; openPositions: number; currentDrawdownPct: number;
  duplicateRequestIds: string[]; selfTradeRisk: boolean;
  strategyKilled: boolean; accountKilled: boolean; platformKilled: boolean;
  stepUpVerified: boolean;
}
export interface RiskLimits {
  maxOrderNotionalPct: number; maxSymbolExposurePct: number; maxMarketExposurePct: number;
  maxDailyLossPct: number; maxDailyTurnover: number;
  maxOpenOrdersPerDay: number; maxLeverage: number; maxOrdersPerSecond: number;
  maxDrawdownPct: number; maxOpenPositions: number;
}
export interface GateResult {
  decision: GateDecision; allowedQuantity: number; reasonCodes: string[];
  auditId: string; checks: Record<string, CheckStatus>; message: string;
  ruleEngineVersion: string; notional: number | null; evaluatedAt: string;
}
export const RULE_ENGINE_VERSION = '1.0.0-paper-rehearsal';
const ORDER_KEYS = new Set(['requestId','userId','accountId','market','symbol','side',
  'quantity','orderType','limitPrice','stopPrice','timeInForce','strategyId',
  'proposedBy','executionMode','humanApprovalStatus']);
const FRESHNESS_MS: Record<Market,number> = { CRYPTO: 120_000, NASDAQ: 300_000, NSE: 300_000 };
const CURRENCY: Record<Market,InstrumentSnapshot['currency']> = {CRYPTO:'USDT',NASDAQ:'USD',NSE:'INR'};
const isObj = (x: unknown): x is Record<string,unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nonNeg = (x: unknown): x is number => finite(x) && x >= 0;
const pos = (x: unknown): x is number => finite(x) && x > 0;
const yesNo = (x: unknown): x is boolean => typeof x === 'boolean';
const has = <T extends string>(x: unknown, values: readonly T[]): x is T => values.includes(x as T);
const nearMultiple = (value: number, tick: number) =>
  pos(value) && pos(tick) && Math.abs(value / tick - Math.round(value / tick)) < 1e-7;
const percent = (x: unknown) => nonNeg(x) && x <= 100;
const push = (out: string[], code: string) => { if (!out.includes(code)) out.push(code); };

/** Strict shape validation; intentionally fails closed until Ajv is added with frozen-lockfile support. */
export function validateProposedOrderShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(value)) return ['SCHEMA_NOT_OBJECT'];
  const required = ['requestId','userId','accountId','market','symbol','side','quantity',
    'orderType','timeInForce','strategyId','proposedBy','executionMode','humanApprovalStatus'];
  for (const key of required) if (!Object.hasOwn(value,key)) push(errors,'SCHEMA_MISSING_'+key.toUpperCase());
  for (const key of Object.keys(value)) if (!ORDER_KEYS.has(key)) push(errors,'SCHEMA_EXTRA_PROPERTY');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof value.requestId !== 'string' || !uuid.test(value.requestId)) push(errors,'SCHEMA_REQUEST_ID');
  for (const k of ['userId','accountId','strategyId']) {
    if (typeof value[k] !== 'string' || value[k].length<1 || value[k].length>128) push(errors,'SCHEMA_'+k.toUpperCase());
  }
  if (!has(value.market,['CRYPTO','NASDAQ','NSE'])) push(errors,'SCHEMA_MARKET');
  if (typeof value.symbol !== 'string' || !/^[A-Z0-9.^-]{1,30}$/.test(value.symbol)) push(errors,'SCHEMA_SYMBOL');
  if (!has(value.side,['BUY','SELL'])) push(errors,'SCHEMA_SIDE');
  if (!pos(value.quantity) || value.quantity>1e8) push(errors,'SCHEMA_QUANTITY');
  if (!has(value.orderType,['MARKET','LIMIT','STOP_LOSS'])) push(errors,'SCHEMA_ORDER_TYPE');
  if (!has(value.timeInForce,['DAY','GTC','IOC'])) push(errors,'SCHEMA_TIF');
  if (value.orderType==='LIMIT' && !pos(value.limitPrice)) push(errors,'SCHEMA_LIMIT_PRICE_REQUIRED');
  if (value.orderType==='STOP_LOSS' && !pos(value.stopPrice)) push(errors,'SCHEMA_STOP_PRICE_REQUIRED');
  if (value.limitPrice!==undefined && !pos(value.limitPrice)) push(errors,'SCHEMA_LIMIT_PRICE');
  if (value.stopPrice!==undefined && !pos(value.stopPrice)) push(errors,'SCHEMA_STOP_PRICE');
  if (value.proposedBy!=='AI_STRATEGY_AGENT') push(errors,'SCHEMA_PROPOSER');
  if (!has(value.executionMode,['PAPER','LIVE'])) push(errors,'SCHEMA_EXECUTION_MODE');
  if (!has(value.humanApprovalStatus,['PENDING','APPROVED','REJECTED'])) push(errors,'SCHEMA_APPROVAL');
  return errors;
}
const validAccount = (a: unknown): a is AccountSnapshot => {
  if (!isObj(a)) return false;
  return typeof a.userId==='string' && typeof a.accountId==='string' &&
    has(a.currency,['INR','USD','USDT']) && yesNo(a.authenticated) &&
    Array.isArray(a.permittedMarkets) && a.permittedMarkets.every(m=>has(m,['CRYPTO','NASDAQ','NSE'])) &&
    ['equity','availableCash','openPositionQuantity','currentSymbolExposure','currentMarketExposure','totalExposure',
     'ordersSubmittedToday','turnoverToday','leverage','ordersLastSecond','openPositions','currentDrawdownPct'
    ].every(k=>nonNeg(a[k])) &&
    finite(a.realizedPnlToday) && finite(a.unrealizedPnlToday) &&
    Array.isArray(a.duplicateRequestIds) && a.duplicateRequestIds.every(id=>typeof id==='string') &&
    ['selfTradeRisk','strategyKilled','accountKilled','platformKilled','stepUpVerified'].every(k=>yesNo(a[k]));
};
const validInstrument = (i: unknown): i is InstrumentSnapshot => {
  if (!isObj(i)) return false;
  return has(i.market,['CRYPTO','NASDAQ','NSE']) &&
    typeof i.symbol==='string' && /^[A-Z0-9.^-]{1,30}$/.test(i.symbol) &&
    has(i.currency,['INR','USD','USDT']) &&
    ['tradable','marketOpen','halted','restricted','providerVerified'].every(k=>yesNo(i[k])) &&
    ['tickSize','lotSize','minQuantity','lastPrice'].every(k=>pos(i[k])) &&
    typeof i.asOf==='string' && Number.isFinite(Date.parse(i.asOf)) &&
    (i.upperPriceBand===undefined || pos(i.upperPriceBand)) &&
    (i.lowerPriceBand===undefined || pos(i.lowerPriceBand)) &&
    (i.corporateActionBlocked===undefined || yesNo(i.corporateActionBlocked));
};
const validLimits = (l: unknown): l is RiskLimits => {
  if (!isObj(l)) return false;
  return ['maxOrderNotionalPct','maxSymbolExposurePct','maxMarketExposurePct',
    'maxDailyLossPct','maxDrawdownPct'].every(k=>percent(l[k])) &&
    ['maxDailyTurnover','maxOpenOrdersPerDay','maxLeverage','maxOrdersPerSecond',
      'maxOpenPositions'].every(k=>pos(l[k]));
};

/**
 * Pure deterministic financial gate with trusted account/instrument snapshots.
 * PASSES only in PAPER mode. LIVE always returns REVIEW or BLOCK and never places orders.
 * No data supplied by a model is trusted for account authorization.
 */
export function validateRiskAndCompliance(
  rawOrder: unknown, rawInstrument: unknown, rawAccount: unknown, rawLimits: unknown,
  evaluatedAt: Date = new Date()
): GateResult {
  const reasonCodes: string[] = [];
  const checks: Record<string, CheckStatus> = {
    schema:'SKIPPED', identity:'SKIPPED',market:'SKIPPED',order:'SKIPPED',
    financial:'SKIPPED',compliance:'SKIPPED',execution:'SKIPPED'
  };
  const result=(decision: GateDecision,quantity=0,notional: number|null=null): GateResult => ({
    decision,allowedQuantity:quantity,reasonCodes:[...reasonCodes],
    auditId:randomUUID(),checks:{...checks},
    message:reasonCodes.length?reasonCodes.join(', '):decision==='PASS'?'Paper rehearsal passed deterministic checks':'Human review required',
    ruleEngineVersion:RULE_ENGINE_VERSION,notional,evaluatedAt:evaluatedAt.toISOString()
  });
  if (!Number.isFinite(evaluatedAt.getTime())) {
    push(reasonCodes,'INVALID_EVALUATION_TIME'); checks.schema='FAIL'; return result('BLOCK');
  }
  const schemaErrors=validateProposedOrderShape(rawOrder);
  if (schemaErrors.length) {
    reasonCodes.push(...schemaErrors);checks.schema='FAIL';return result('BLOCK');
  }
  checks.schema='PASS';
  if (!validAccount(rawAccount)) {
    push(reasonCodes,'ACCOUNT_SNAPSHOT_INVALID');checks.identity='FAIL';return result('BLOCK');
  }
  const o=rawOrder as ProposedOrder, a=rawAccount;
  if (!a.authenticated || a.userId!==o.userId || a.accountId!==o.accountId ||
      !a.permittedMarkets.includes(o.market)) push(reasonCodes,'ACCOUNT_UNAUTHORIZED');
  if (a.duplicateRequestIds.includes(o.requestId)) push(reasonCodes,'DUPLICATE_REQUEST');
  checks.identity=reasonCodes.length?'FAIL':'PASS';
  if (!validInstrument(rawInstrument)) {
    push(reasonCodes,'INSTRUMENT_SNAPSHOT_INVALID');checks.market='FAIL';return result('BLOCK');
  }
  const i=rawInstrument;
  if (i.market!==o.market || i.symbol!==o.symbol || i.currency!==CURRENCY[o.market] || a.currency!==i.currency)
    push(reasonCodes,'MARKET_CURRENCY_MISMATCH');
  if (!i.providerVerified) push(reasonCodes,'DATA_UNVERIFIED');
  const age=evaluatedAt.getTime()-Date.parse(i.asOf);
  if (!Number.isFinite(age) || age<0 || age>FRESHNESS_MS[o.market]) push(reasonCodes,'MARKET_DATA_STALE');
  if (!i.tradable || !i.marketOpen) push(reasonCodes,'MARKET_CLOSED');
  if (i.halted) push(reasonCodes,'HALTED');
  if (i.restricted || i.corporateActionBlocked) push(reasonCodes,'INSTRUMENT_RESTRICTED');
  checks.market=reasonCodes.length?'FAIL':'PASS';
  if (!nearMultiple(o.quantity,i.lotSize) || o.quantity<i.minQuantity) push(reasonCodes,'INVALID_LOT_OR_QUANTITY');
  const price=o.orderType==='LIMIT'?o.limitPrice!:o.orderType==='STOP_LOSS'?o.stopPrice!:i.lastPrice;
  if (!pos(price) || !nearMultiple(price,i.tickSize)) push(reasonCodes,'INVALID_TICK_SIZE');
  if (i.lowerPriceBand!==undefined && price<i.lowerPriceBand ||
      i.upperPriceBand!==undefined && price>i.upperPriceBand) push(reasonCodes,'OUTSIDE_PRICE_BAND');
  checks.order=reasonCodes.length?'FAIL':'PASS';
  if (!validLimits(rawLimits)) {
    push(reasonCodes,'RISK_LIMITS_INVALID');checks.financial='FAIL';return result('BLOCK');
  }
  const l=rawLimits;
  const notional=price*o.quantity;
  if (!Number.isFinite(notional) || notional<=0) push(reasonCodes,'INVALID_NOTIONAL');
  if (a.equity<=0) push(reasonCodes,'ACCOUNT_EQUITY_INVALID');
  const pct=(v:number)=>a.equity>0?100*v/a.equity:Infinity;
  if (pct(notional)>l.maxOrderNotionalPct) push(reasonCodes,'ORDER_NOTIONAL_LIMIT');
  if (o.side==='BUY') {
    if (notional>a.availableCash) push(reasonCodes,'INSUFFICIENT_CASH');
    if (pct(a.currentSymbolExposure+notional)>l.maxSymbolExposurePct) push(reasonCodes,'SYMBOL_CONCENTRATION');
    if (pct(a.currentMarketExposure+notional)>l.maxMarketExposurePct) push(reasonCodes,'MARKET_CONCENTRATION');
    if (a.openPositions+1>l.maxOpenPositions && a.openPositionQuantity===0) push(reasonCodes,'POSITION_COUNT_LIMIT');
  } else if (o.quantity>a.openPositionQuantity) push(reasonCodes,'SELL_EXCEEDS_HOLDINGS');
  const loss=Math.max(0,-a.realizedPnlToday-a.unrealizedPnlToday);
  if (pct(loss)>=l.maxDailyLossPct) push(reasonCodes,'DAILY_LOSS_LIMIT');
  if (a.currentDrawdownPct>=l.maxDrawdownPct) push(reasonCodes,'DRAWDOWN_LIMIT');
  if (a.turnoverToday+notional>l.maxDailyTurnover) push(reasonCodes,'DAILY_TURNOVER_LIMIT');
  if (a.ordersSubmittedToday>=l.maxOpenOrdersPerDay) push(reasonCodes,'DAILY_ORDER_COUNT_LIMIT');
  if (a.ordersLastSecond>=l.maxOrdersPerSecond) push(reasonCodes,'ORDER_RATE_LIMIT');
  if (a.leverage>l.maxLeverage || pct(a.totalExposure+(o.side==='BUY'?notional:0))>l.maxLeverage*100)
    push(reasonCodes,'LEVERAGE_LIMIT');
  checks.financial=reasonCodes.length?'FAIL':'PASS';
  if (a.selfTradeRisk) push(reasonCodes,'SELF_TRADE_RISK');
  if (a.strategyKilled||a.accountKilled||a.platformKilled) push(reasonCodes,'KILL_SWITCH_ACTIVE');
  checks.compliance=reasonCodes.length?'FAIL':'PASS';
  if (o.humanApprovalStatus==='REJECTED') push(reasonCodes,'APPROVAL_REJECTED');
  if (o.executionMode==='LIVE') {
    if (!a.stepUpVerified) push(reasonCodes,'STEP_UP_REQUIRED');
    // Even a string APPROVED is untrusted; no bound approval service exists.
    push(reasonCodes,'LIVE_BROKER_DISABLED');
  }
  checks.execution=reasonCodes.length?'FAIL':'PASS';
  return reasonCodes.length?result('BLOCK',0,Number.isFinite(notional)?notional:null)
    :result('PASS',o.quantity,notional);
}
