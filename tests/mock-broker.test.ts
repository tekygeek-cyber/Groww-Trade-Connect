import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MockBrokerContract } from '../server/trading/mock-broker';
import type { ProposedOrder,GateResult } from '../server/trading/risk-gate';
const order=(mode:'PAPER'|'LIVE'='PAPER'):ProposedOrder=>({
 requestId:randomUUID(),userId:'fixture',accountId:'fixture',market:'NASDAQ',
 symbol:'AAPL',side:'BUY',quantity:4,orderType:'LIMIT',limitPrice:10,
 timeInForce:'DAY',strategyId:'fixture',proposedBy:'AI_STRATEGY_AGENT',
 executionMode:mode,humanApprovalStatus:'PENDING'
});
const approval=(quantity=4,decision:'PASS'|'BLOCK'='PASS'):GateResult=>({
 decision,allowedQuantity:decision==='PASS'?quantity:0,reasonCodes:[],auditId:randomUUID(),
 checks:{},message:'Mock only',ruleEngineVersion:'fixture',notional:quantity*10,
 evaluatedAt:new Date().toISOString()
});
test('mock broker rejects a LIVE order even if someone forges a PASS',()=>{
 const adapter=new MockBrokerContract();
 assert.throws(()=>adapter.submit(order('LIVE'),approval()),/MOCK_LIVE_ORDER_FORBIDDEN/);
});
test('mock broker requires risk-gate PASS and exact quantity',()=>{
 const adapter=new MockBrokerContract();const o=order();
 assert.throws(()=>adapter.submit(o,approval(4,'BLOCK')),/RISK_GATE_NOT_PASSED/);
 assert.throws(()=>adapter.submit(o,approval(1)),/RISK_GATE_NOT_PASSED/);
 assert.equal(adapter.status(o.requestId),null);
});
test('successful simulated ack and fill is idempotent by request id',()=>{
 const adapter=new MockBrokerContract(()=> '2026-11-02T12:00:00Z'),o=order();
 const first=adapter.submit(o,approval(),'FILL');
 assert.equal(first.state,'FILLED');assert.equal(first.filledQuantity,4);
 assert.equal(first.remainingQuantity,0);assert.equal(first.simulationOnly,true);
 const retry=adapter.submit(o,approval(),'REJECT');
 assert.deepEqual(retry,first);
 assert.equal(retry.brokerOrderId,first.brokerOrderId);
 assert.equal(first.events.filter(x=>x.type==='MOCK_ACKNOWLEDGED').length,1);
});
test('partial fills preserve remaining quantity and do not silently mark complete',()=>{
 const adapter=new MockBrokerContract(),o=order();
 const ack=adapter.submit(o,approval(),'PARTIAL');
 assert.equal(ack.state,'PARTIALLY_FILLED');assert.equal(ack.filledQuantity,2);
 assert.equal(ack.remainingQuantity,2);
});
test('timeout is unknown requiring reconciliation, not automatically retried',()=>{
 const adapter=new MockBrokerContract(),o=order();
 const ack=adapter.submit(o,approval(),'TIMEOUT');
 assert.equal(ack.state,'UNKNOWN_REQUIRES_RECONCILIATION');
 assert.equal(adapter.submit(o,approval(),'FILL').state,'UNKNOWN_REQUIRES_RECONCILIATION');
 assert.equal(ack.events.at(-1)?.type,'MOCK_TIMEOUT');
});
test('broker reject and ack-only never create fake fills',()=>{
 const adapter=new MockBrokerContract();
 const rejected=adapter.submit(order(),approval(),'REJECT');
 const waiting=adapter.submit(order(),approval(),'ACK_ONLY');
 assert.equal(rejected.state,'REJECTED');assert.equal(rejected.filledQuantity,0);
 assert.equal(waiting.state,'ACKNOWLEDGED');assert.equal(waiting.filledQuantity,0);
});
test('simulated broker is self-contained; no HTTP requests are issued',()=>{
 const original=globalThis.fetch;globalThis.fetch=(()=>{throw Error('UNEXPECTED_EXTERNAL_NETWORK');}) as typeof fetch;
 try {const adapter=new MockBrokerContract();assert.equal(adapter.submit(order(),approval()).state,'FILLED');}
 finally {globalThis.fetch=original;}
});


test('replaying a request ID with modified economic terms is an idempotency conflict',()=>{
 const adapter=new MockBrokerContract(()=> '2026-11-02T12:00:00Z');
 const original=order();
 const first=adapter.submit(original,approval(),'FILL');
 const changes=[
  {...original,quantity:8},
  {...original,limitPrice:20},
  {...original,symbol:'MSFT'},
  {...original,side:'SELL' as const},
  {...original,accountId:'other-account'},
  {...original,market:'NSE' as const},
 ];
 for (const changed of changes) {
  assert.throws(()=>adapter.submit(changed,approval(changed.quantity)),/MOCK_IDEMPOTENCY_CONFLICT/);
  assert.equal(adapter.status(original.requestId)?.brokerOrderId,first.brokerOrderId);
  assert.equal(adapter.status(original.requestId)?.filledQuantity,4);
 }
});
test('same order replay preserves the original ACK without duplicating fills',()=>{
 const adapter=new MockBrokerContract(),o=order();
 const ack=adapter.submit(o,approval(),'PARTIAL');
 const result=adapter.submit({...o},approval(),'FILL');
 assert.deepEqual(result,ack);
 assert.equal(result.events.filter(x=>x.type==='MOCK_PARTIAL_FILL').length,1);
 assert.equal(result.state,'PARTIALLY_FILLED');
});
