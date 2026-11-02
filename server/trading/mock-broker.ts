import { randomUUID } from 'node:crypto';
import type { ProposedOrder,GateResult } from './risk-gate';

export type MockScenario = 'FILL' | 'ACK_ONLY' | 'PARTIAL' | 'REJECT' | 'TIMEOUT';
export type MockOrderState = 'FILLED' | 'ACKNOWLEDGED' | 'PARTIALLY_FILLED' | 'REJECTED' | 'UNKNOWN_REQUIRES_RECONCILIATION';
export interface MockAck {
  scenario:MockScenario; simulationOnly:true; requestId:string; brokerOrderId:string;
  state:MockOrderState; filledQuantity:number; remainingQuantity:number;
  events:ReadonlyArray<{type:string;at:string}>;
}
/**
 * CONTRACT FIXTURE ONLY. No network socket, broker SDK, vault, or external API.
 * Tests broker response handling; never connect this adapter to a production order route.
 */
export class MockBrokerContract {
  private readonly orders=new Map<string,Readonly<MockAck>>();
  private readonly now:()=>string;
  constructor(now:()=>string=()=>new Date().toISOString()){this.now=now;}
  submit(order:ProposedOrder,gate:GateResult,scenario:MockScenario='FILL'):Readonly<MockAck> {
    if(order.executionMode!=='PAPER') throw new Error('MOCK_LIVE_ORDER_FORBIDDEN');
    if(gate.decision!=='PASS' || gate.allowedQuantity!==order.quantity)
      throw new Error('RISK_GATE_NOT_PASSED');
    if(!['FILL','ACK_ONLY','PARTIAL','REJECT','TIMEOUT'].includes(scenario))
      throw new TypeError('Unknown broker contract scenario');
    if(this.orders.has(order.requestId)) return this.orders.get(order.requestId)!;
    const id='MOCK-'+randomUUID();
    const state:MockOrderState=scenario==='REJECT'?'REJECTED':scenario==='TIMEOUT'?
      'UNKNOWN_REQUIRES_RECONCILIATION':scenario==='ACK_ONLY'?'ACKNOWLEDGED':
      scenario==='PARTIAL'?'PARTIALLY_FILLED':'FILLED';
    const filled=state==='FILLED'?order.quantity:state==='PARTIALLY_FILLED'?order.quantity/2:0;
    const events=[{type:'SUBMISSION_SIMULATED',at:this.now()}];
    if(state==='REJECTED') events.push({type:'MOCK_REJECTED',at:this.now()});
    else if(state==='UNKNOWN_REQUIRES_RECONCILIATION') events.push({type:'MOCK_TIMEOUT',at:this.now()});
    else {
      events.push({type:'MOCK_ACKNOWLEDGED',at:this.now()});
      if(filled>0) events.push({type:state==='FILLED'?'MOCK_FILLED':'MOCK_PARTIAL_FILL',at:this.now()});
    }
    const result=Object.freeze({
      scenario,simulationOnly:true as const,requestId:order.requestId,brokerOrderId:id,
      state,filledQuantity:filled,remainingQuantity:order.quantity-filled,
      events:Object.freeze(events)
    });
    this.orders.set(order.requestId,result);
    return result;
  }
  status(requestId:string):Readonly<MockAck>|null{return this.orders.get(requestId)||null;}
  reset(){this.orders.clear();}
}
