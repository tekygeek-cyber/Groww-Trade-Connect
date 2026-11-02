import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateProposedOrderShape,validateRiskAndCompliance,RULE_ENGINE_VERSION,
  type ProposedOrder,type AccountSnapshot,type InstrumentSnapshot,type RiskLimits
} from '../server/trading/risk-gate';
import {parseRehearsalInput,runTradingRehearsal,readRehearsalAudits} from '../server/trading/rehearsal';

const at=new Date('2026-11-02T12:00:00.000Z');
const make=()=>{
  const order:ProposedOrder={requestId:randomUUID(),userId:'testUser',accountId:'testAccount',
    market:'NASDAQ',symbol:'AAPL',side:'BUY',quantity:2,orderType:'LIMIT',
    limitPrice:100,timeInForce:'DAY',strategyId:'testStrategy',proposedBy:'AI_STRATEGY_AGENT',
    executionMode:'PAPER',humanApprovalStatus:'PENDING'};
  const instrument:InstrumentSnapshot={market:'NASDAQ',symbol:'AAPL',currency:'USD',tradable:true,
    marketOpen:true,halted:false,restricted:false,tickSize:0.01,lotSize:1,minQuantity:1,
    lastPrice:100,asOf:at.toISOString(),providerVerified:true};
  const account:AccountSnapshot={userId:'testUser',accountId:'testAccount',currency:'USD',
    authenticated:true,permittedMarkets:['NASDAQ'],equity:100000,availableCash:50000,
    openPositionQuantity:5,currentSymbolExposure:1000,currentMarketExposure:10000,
    totalExposure:20000,realizedPnlToday:0,unrealizedPnlToday:0,ordersSubmittedToday:1,
    turnoverToday:500,leverage:1,ordersLastSecond:0,openPositions:3,currentDrawdownPct:0,
    duplicateRequestIds:[],selfTradeRisk:false,strategyKilled:false,accountKilled:false,
    platformKilled:false,stepUpVerified:false};
  const limits:RiskLimits={maxOrderNotionalPct:5,maxSymbolExposurePct:30,maxMarketExposurePct:50,
    maxDailyLossPct:8,maxDailyTurnover:20000,maxOpenOrdersPerDay:15,maxLeverage:1,
    maxOrdersPerSecond:2,maxDrawdownPct:12,maxOpenPositions:8};
  return {order,instrument,account,limits};
};
function gate(patch:Partial<ReturnType<typeof make>>={}){
  const f={...make(),...patch};
  return validateRiskAndCompliance(f.order,f.instrument,f.account,f.limits,at);
}
function assertBlock(reason:string, patch:Partial<ReturnType<typeof make>>){
  const r=gate(patch);
  assert.equal(r.decision,'BLOCK',JSON.stringify(r));
  assert.equal(r.allowedQuantity,0);
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r.reasonCodes));
  assert.equal(r.ruleEngineVersion,RULE_ENGINE_VERSION);
}
test('valid paper LIMIT order passes with explicit 7-layer checks',()=>{
  const r=gate();assert.equal(r.decision,'PASS');assert.equal(r.allowedQuantity,2);
  assert.equal(r.notional,200);assert.equal(r.reasonCodes.length,0);
  assert.equal(r.checks.execution,'PASS');
});
test('LIVE is always blocked regardless of user-supplied APPROVED flag',()=>{
  const f=make();f.order.executionMode='LIVE';f.order.humanApprovalStatus='APPROVED';
  f.account.stepUpVerified=true;
  assertBlock('LIVE_BROKER_DISABLED',f);
  f.account.stepUpVerified=false;assertBlock('STEP_UP_REQUIRED',f);
});
test('schema validates every missing field and unexpected properties',()=>{
  const f=make();const x={...f.order,arbitrary:'malicious'};
  assertBlock('SCHEMA_EXTRA_PROPERTY',{order:x as ProposedOrder});
  const invalid=Object.fromEntries(Object.entries(f.order).filter(([k])=>k!=='userId'&&k!=='quantity'));
  const errors=validateProposedOrderShape(invalid);
  assert.ok(errors.includes('SCHEMA_MISSING_USERID')&&errors.includes('SCHEMA_MISSING_QUANTITY'));
});
test('rejects negative, zero, NaN and wrong typed order quantities',()=>{
  for(const x of [-1,0,Number.NaN,Infinity,'2']){
    assertBlock('SCHEMA_QUANTITY',{order:{...make().order,quantity:x} as ProposedOrder});
  }
});
test('unknown tick, lot, price bands and quantity minimum block',()=>{
  const f=make();assertBlock('INVALID_LOT_OR_QUANTITY',{...f,order:{...f.order,quantity:0.5}});
  assertBlock('INVALID_TICK_SIZE',{...f,order:{...f.order,limitPrice:100.005}});
  assertBlock('OUTSIDE_PRICE_BAND',{...f,instrument:{...f.instrument,upperPriceBand:90}});
  assertBlock('INVALID_LOT_OR_QUANTITY',{...f,instrument:{...f.instrument,minQuantity:3}});
});
test('halts, closed hours, restricted symbols, unverified and stale provider data',()=>{
 const f=make();
 assertBlock('HALTED',{...f,instrument:{...f.instrument,halted:true}});
 assertBlock('MARKET_CLOSED',{...f,instrument:{...f.instrument,marketOpen:false}});
 assertBlock('INSTRUMENT_RESTRICTED',{...f,instrument:{...f.instrument,restricted:true}});
 assertBlock('DATA_UNVERIFIED',{...f,instrument:{...f.instrument,providerVerified:false}});
 assertBlock('MARKET_DATA_STALE',{...f,instrument:{...f.instrument,asOf:'2026-10-31T10:00:00Z'}});
 assertBlock('MARKET_CURRENCY_MISMATCH',{...f,instrument:{...f.instrument,currency:'INR'}});
});
test('unauthenticated, unauthorized, replayed, corrupt account snapshot block',()=>{
 const f=make();
 assertBlock('ACCOUNT_UNAUTHORIZED',{...f,account:{...f.account,authenticated:false}});
 assertBlock('ACCOUNT_UNAUTHORIZED',{...f,account:{...f.account,accountId:'other'}});
 assertBlock('DUPLICATE_REQUEST',{...f,account:{...f.account,duplicateRequestIds:[f.order.requestId]}});
 const invalid={...f.account,leverage:Number.NaN};
 assertBlock('ACCOUNT_SNAPSHOT_INVALID',{...f,account:invalid});
});
test('notional, symbol, market and cash limits fail closed',()=>{
 const f=make();
 assertBlock('ORDER_NOTIONAL_LIMIT',{...f,order:{...f.order,quantity:100}});
 assertBlock('SYMBOL_CONCENTRATION',{...f,account:{...f.account,currentSymbolExposure:30000}});
 assertBlock('MARKET_CONCENTRATION',{...f,account:{...f.account,currentMarketExposure:50000}});
 assertBlock('INSUFFICIENT_CASH',{...f,account:{...f.account,availableCash:100}});
});
test('drawdown, loss, turnover, order rate, leverage and position-count block',()=>{
 const f=make();
 assertBlock('DAILY_LOSS_LIMIT',{...f,account:{...f.account,realizedPnlToday:-8000}});
 assertBlock('DRAWDOWN_LIMIT',{...f,account:{...f.account,currentDrawdownPct:12}});
 assertBlock('DAILY_TURNOVER_LIMIT',{...f,account:{...f.account,turnoverToday:19900}});
 assertBlock('DAILY_ORDER_COUNT_LIMIT',{...f,account:{...f.account,ordersSubmittedToday:15}});
 assertBlock('ORDER_RATE_LIMIT',{...f,account:{...f.account,ordersLastSecond:2}});
 assertBlock('LEVERAGE_LIMIT',{...f,account:{...f.account,leverage:2}});
 assertBlock('POSITION_COUNT_LIMIT',{...f,account:{...f.account,openPositions:8,openPositionQuantity:0}});
});
test('invalid SELL and surveillance kill switches block',()=>{
 const f=make();
 assertBlock('SELL_EXCEEDS_HOLDINGS',{...f,order:{...f.order,side:'SELL',quantity:6}});
 assertBlock('SELF_TRADE_RISK',{...f,account:{...f.account,selfTradeRisk:true}});
 assertBlock('KILL_SWITCH_ACTIVE',{...f,account:{...f.account,platformKilled:true}});
 assertBlock('KILL_SWITCH_ACTIVE',{...f,account:{...f.account,strategyKilled:true}});
 assertBlock('APPROVAL_REJECTED',{...f,order:{...f.order,humanApprovalStatus:'REJECTED'}});
});
test('missing or malformed trusted context never throws and always blocks',()=>{
 assertBlock('INSTRUMENT_SNAPSHOT_INVALID',{...make(),instrument:{} as InstrumentSnapshot});
 assertBlock('RISK_LIMITS_INVALID',{...make(),limits:{...make().limits,maxLeverage:-1}});
 assert.equal(validateRiskAndCompliance(null,null,null,null,at).decision,'BLOCK');
});
test('Crypto and NSE support native currency and lot conventions without FX conversion',()=>{
 for(const [market,currency,lot] of [['CRYPTO','USDT',0.00001],['NSE','INR',1]] as const) {
   const f=make();
   const order={...f.order,market,symbol:market==='NSE'?'RELIANCE':'BTCUSDT',quantity:lot};
   const inst={...f.instrument,market,currency,symbol:order.symbol,lotSize:lot,minQuantity:lot,tickSize:0.01};
   const account={...f.account,currency,permittedMarkets:[market],openPositionQuantity:10};
   assert.equal(gate({order,instrument:inst,account}).decision,'PASS');
 }
});
test('trading rehearsal input rejects unknown fields and nonfinite numbers',()=>{
 assert.throws(()=>parseRehearsalInput({market:'NASDAQ',symbol:'AAPL',side:'BUY',quantity:1,price:1,
   mode:'LIVE',executeNow:true}),TypeError);
 assert.throws(()=>parseRehearsalInput({market:'NASDAQ',symbol:'AAPL',side:'BUY',quantity:1,price:Infinity,mode:'PAPER'}),TypeError);
});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'groww-rehearsal-'));
const oldCwd=process.cwd();
test('rehearsal records SHA-256 hash-chain and returns LIVE always blocked',()=>{
 process.chdir(dir);
 try {
  const data={market:'NASDAQ' as const,symbol:'AAPL',side:'BUY' as const,quantity:1,price:100,mode:'PAPER' as const};
  const paper=runTradingRehearsal(data);
  assert.equal(paper.simulationOnly,true);assert.equal(paper.brokerSubmission,false);
  assert.equal(paper.gate.decision,'PASS');
  const live=runTradingRehearsal({...data,mode:'LIVE'});
  assert.equal(live.gate.decision,'BLOCK');assert.ok(live.gate.reasonCodes.includes('LIVE_BROKER_DISABLED'));
  const halted=runTradingRehearsal({...data,scenario:'HALTED'});
  assert.ok(halted.gate.reasonCodes.includes('HALTED'));
  const rows=readRehearsalAudits(10);
  assert.equal(rows.length,3);assert.equal(rows[1].previousHash,rows[0].hash);
  const file=path.join(dir,'server','data','trading-rehearsals.jsonl');
  const contents=fs.readFileSync(file,'utf8').replace('"decision":"PASS"','"decision":"BLOCK"');
  fs.writeFileSync(file,contents);
  assert.throws(()=>readRehearsalAudits(10),/integrity|chain/);
 } finally {process.chdir(oldCwd);fs.rmSync(dir,{recursive:true,force:true});}
});


test('each gate reports its own outcome even when earlier layers block',()=>{
  const f=make();
  const denied=gate({...f,account:{...f.account,authenticated:false}});
  assert.equal(denied.decision,'BLOCK');
  assert.equal(denied.checks.schema,'PASS');
  assert.equal(denied.checks.identity,'FAIL');
  assert.equal(denied.checks.market,'PASS');
  assert.equal(denied.checks.order,'PASS');
  assert.equal(denied.checks.financial,'PASS');
  assert.equal(denied.checks.compliance,'PASS');
  assert.equal(denied.checks.execution,'PASS');

  const halted=gate({...f,instrument:{...f.instrument,halted:true}});
  assert.equal(halted.checks.identity,'PASS');
  assert.equal(halted.checks.market,'FAIL');
  assert.equal(halted.checks.order,'PASS');
  assert.equal(halted.checks.financial,'PASS');
  assert.equal(halted.checks.compliance,'PASS');

  const outOfCash=gate({...f,account:{...f.account,availableCash:1}});
  assert.equal(outOfCash.checks.financial,'FAIL');
  assert.equal(outOfCash.checks.compliance,'PASS');
  assert.equal(outOfCash.checks.execution,'PASS');

  const killed=gate({...f,account:{...f.account,platformKilled:true}});
  assert.equal(killed.checks.financial,'PASS');
  assert.equal(killed.checks.compliance,'FAIL');
  assert.equal(killed.checks.execution,'PASS');
});
test('multiple failures appear in only their matching layers',()=>{
  const f=make();
  const r=gate({...f,
    account:{...f.account,authenticated:false,availableCash:0,platformKilled:true},
    instrument:{...f.instrument,halted:true},
  });
  assert.equal(r.decision,'BLOCK');
  assert.deepEqual(
    [r.checks.identity,r.checks.market,r.checks.order,r.checks.financial,r.checks.compliance,r.checks.execution],
    ['FAIL','FAIL','PASS','FAIL','FAIL','PASS']
  );
  assert.ok(r.reasonCodes.includes('ACCOUNT_UNAUTHORIZED'));
  assert.ok(r.reasonCodes.includes('HALTED'));
  assert.ok(r.reasonCodes.includes('INSUFFICIENT_CASH'));
  assert.ok(r.reasonCodes.includes('KILL_SWITCH_ACTIVE'));
});
test('invalid evaluation Date is a blocked audit result rather than an uncaught exception',()=>{
  const f=make();
  const r=validateRiskAndCompliance(f.order,f.instrument,f.account,f.limits,new Date('broken'));
  assert.equal(r.decision,'BLOCK');
  assert.equal(r.checks.schema,'FAIL');
  assert.ok(r.reasonCodes.includes('INVALID_EVALUATION_TIME'));
  assert.equal(r.evaluatedAt,'INVALID');
});
