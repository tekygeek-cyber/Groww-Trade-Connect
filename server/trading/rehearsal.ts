import { randomUUID } from 'node:crypto';
import {
  validateRiskAndCompliance, type ProposedOrder, type Market,
  type InstrumentSnapshot,type AccountSnapshot,type RiskLimits
} from './risk-gate';
import { appendRehearsalAudit, readRehearsalAudits } from './audit';

const defaultLimits:RiskLimits = Object.freeze({
  maxOrderNotionalPct:5,maxSymbolExposurePct:30,maxMarketExposurePct:50,
  maxDailyLossPct:8,maxDailyTurnover:20000,maxOpenOrdersPerDay:15,
  maxLeverage:1,maxOrdersPerSecond:2,maxDrawdownPct:12,maxOpenPositions:8
});
export interface RehearsalInput {
  market:Market; symbol:string; side:'BUY'|'SELL'; quantity:number; price:number;
  mode:'PAPER'|'LIVE'; scenario?:'NORMAL'|'HALTED'|'RESTRICTED'|'STALE'|'KILL_SWITCH';
}
export function parseRehearsalInput(value:unknown):RehearsalInput {
  if(!value || typeof value!=='object'||Array.isArray(value)) throw new TypeError('Invalid rehearsal input');
  const v=value as Record<string,unknown>;
  const allowed=new Set(['market','symbol','side','quantity','price','mode','scenario']);
  if(Object.keys(v).some(k=>!allowed.has(k)) ||
    !['NSE','NASDAQ','CRYPTO'].includes(v.market as string) ||
    typeof v.symbol!=='string'|| !/^[A-Z0-9.^-]{1,30}$/.test(v.symbol)||
    !['BUY','SELL'].includes(v.side as string)||
    !['PAPER','LIVE'].includes(v.mode as string)||
    (v.scenario!==undefined&&!['NORMAL','HALTED','RESTRICTED','STALE','KILL_SWITCH'].includes(v.scenario as string))||
    typeof v.quantity!=='number'||!Number.isFinite(v.quantity)||v.quantity<=0||v.quantity>1e6||
    typeof v.price!=='number'||!Number.isFinite(v.price)||v.price<=0||v.price>1e9)
    throw new TypeError('Invalid rehearsal input');
  return {market:v.market as Market,symbol:v.symbol,side:v.side as RehearsalInput['side'],
    quantity:v.quantity,price:v.price,mode:v.mode as RehearsalInput['mode'],
    scenario:(v.scenario||'NORMAL') as RehearsalInput['scenario']};
}
/**
 * Hypothetical, isolated TEST_FIXTURE snapshot. Not broker/account sourced.
 * It cannot be reused by any real execution path.
 */
export function runTradingRehearsal(input:RehearsalInput) {
  const v=parseRehearsalInput(input);
  const currency=({NSE:'INR',NASDAQ:'USD',CRYPTO:'USDT'} as const)[v.market];
  const lotSize=v.market==='CRYPTO'?0.00001:1;
  const now=new Date(),requestId=randomUUID();
  const instrument:InstrumentSnapshot={
    market:v.market,symbol:v.symbol,currency,tradable:true,marketOpen:true,
    halted:v.scenario==='HALTED',restricted:v.scenario==='RESTRICTED',
    tickSize:v.market==='CRYPTO'?0.000001:0.01,lotSize,
    minQuantity:lotSize,lastPrice:v.price,
    asOf:new Date(now.getTime()-(v.scenario==='STALE'?86400000:0)).toISOString(),
    providerVerified:true
  };
  const account:AccountSnapshot={
    userId:'REHEARSAL_USER',accountId:'REHEARSAL_ACCOUNT',currency,authenticated:true,
    permittedMarkets:[v.market],equity:100000,availableCash:30000,
    openPositionQuantity:10,currentSymbolExposure:0,currentMarketExposure:0,
    totalExposure:0,realizedPnlToday:0,unrealizedPnlToday:0,ordersSubmittedToday:0,
    turnoverToday:0,leverage:1,ordersLastSecond:0,openPositions:1,
    currentDrawdownPct:0,duplicateRequestIds:[],selfTradeRisk:false,
    strategyKilled:false,accountKilled:false,platformKilled:v.scenario==='KILL_SWITCH',
    stepUpVerified:false
  };
  const order:ProposedOrder={
    requestId,userId:account.userId,accountId:account.accountId,market:v.market,symbol:v.symbol,
    side:v.side,quantity:v.quantity,orderType:'LIMIT',limitPrice:v.price,
    timeInForce:'DAY',strategyId:'REHEARSAL_ONLY',proposedBy:'AI_STRATEGY_AGENT',
    executionMode:v.mode,humanApprovalStatus:'PENDING'
  };
  const gate=validateRiskAndCompliance(order,instrument,account,defaultLimits,now);
  // Even a PASS refers ONLY to a simulated risk result: no order submit method exists.
  const audit=appendRehearsalAudit({
    requestId,mode:v.mode,decision:gate.decision,reasonCodes:gate.reasonCodes,
    auditId:gate.auditId,ruleEngineVersion:gate.ruleEngineVersion,fixtureId:'CONSERVATIVE_MOCK_ACCOUNT_V1'
  });
  return {simulationOnly:true,brokerSubmission:false,orderAcceptedByBroker:false,
    fixture:{id:'CONSERVATIVE_MOCK_ACCOUNT_V1',currency,buyingPower:30000,
      equity:100000,marketStatus:'HYPOTHETICAL_OPEN',priceSource:'USER_INPUT_TEST_VALUE'},
    gate,audit:{auditId:audit.auditId,sequence:audit.sequence,hash:audit.hash}};
}
export {readRehearsalAudits};
