import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgentHarness,selectAgentContext} from '../server/ai/harness.mjs';
import {getLocalOllamaUrl,ollamaModel} from '../server/ai/ollama.mjs';
import {makeResearchTools,validateEvidence} from '../server/ai/research-tools.mjs';
import {researchWithAi,validateAiRequest,getAiStatus} from '../server/ai/research-service.mjs';
import {STARTER_AGENT_CATALOG} from '../server/ai/agents.mjs';
import {evaluateTrustMetrics,buildTrustChain,verifyTrustChain} from '../server/ai/trust-gate.mjs';


const fake = steps => {
 let i=0;
 return {provider:'test',model:'scripted',generate:async()=>steps[i++]??(()=>{throw new Error('Script exhausted')})()};
};
const call=(id,name,args={})=>({id,name,arguments:args});
const date=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
const evidence = () => ({market:'nasdaq',symbol:'AAPL',source:'Daily candles: Stooq',
 candles:Array.from({length:90},(_,i)=>({date:date(90-i),close:100+i/2}))});
const echo={name:'read',description:'read-only',parameters:{type:'object',properties:{},additionalProperties:false},
 validate:a=>a&&Object.keys(a).length===0, execute:async()=>({ok:true})};

test('harness completes read-only tool cycle and emits events',async()=>{
 const r=await runAgentHarness({model:fake([{content:'',toolCalls:[call('a','read')]},{content:'WATCH only'}]),
 tools:[echo],prompt:'research'});
 assert.equal(r.status,'completed');
 assert.equal(r.answer,'WATCH only');
 assert.equal(r.toolCalls,1);
 assert.ok(r.events.some(e=>e.type==='tool_end'&&!e.failed));
});
test('invalid params and unknown tools cannot execute arbitrary code',async()=>{
 let invoked=0;
 const t={...echo,execute:async()=>{invoked++;return 3;}};
 const r=await runAgentHarness({model:fake([
  {content:'',toolCalls:[call('a','read',{command:'rm -rf /'}),call('b','shell',{command:'x'})]},
  {content:'nothing executed'}]),tools:[t],prompt:'test'});
 assert.equal(r.status,'completed');assert.equal(invoked,0);
 assert.equal(r.messages.filter(m=>m.role==='tool'&&m.isError).length,2);
});
test('over-budget batches do not enter transcript or run any tools',async()=>{
 let invoked=0;
 const r=await runAgentHarness({model:fake([{content:'',toolCalls:[call('a','read'),call('b','read')]}]),
 tools:[{...echo,execute:async()=>{invoked++;}}],prompt:'budget',maxToolCalls:1});
 assert.equal(r.status,'tool_limit');assert.equal(invoked,0);
 assert.equal(r.messages.length,1);
});
test('malformed model responses fail without running tools',async()=>{
 for(const response of [{content:'',toolCalls:[call('a','read'),call('a','read')]},
   {content:5},{content:'',toolCalls:[{id:'bad',name:'read'}]}]) {
  const r=await runAgentHarness({model:fake([response]),tools:[echo],prompt:'reject'});
  assert.equal(r.status,'model_error');
  assert.equal(r.toolCalls,0);
 }
});
test('step budget, max tool-result chars, cancellation and listener errors',async()=>{
 const result=await runAgentHarness({model:fake([{content:'',toolCalls:[call('a','read')]}]),
   tools:[{...echo,execute:async()=>({value:'x'.repeat(500)})}],prompt:'bounded',maxSteps:1,
   maxToolResultChars:40,onEvent:()=>{throw new Error('ignore')}})
 assert.equal(result.status,'step_limit');
 assert.ok(result.messages.at(-1).content.length<=40);
 const ctrl=new AbortController();ctrl.abort();
 const aborted=await runAgentHarness({model:fake([]),tools:[echo],prompt:'abort',signal:ctrl.signal});
 assert.equal(aborted.status,'aborted');
});
test('context grouping rejects duplicate/orphan tool messages',()=>{
 assert.throws(()=>selectAgentContext([{role:'user',content:'x'},{role:'tool',callId:'a',content:'y'}],1000),/Orphan/);
 assert.throws(()=>selectAgentContext([{role:'user',content:'x'},{role:'assistant',content:'',toolCalls:[call('a','read')]}],1000),/Incomplete/);
});
test('rate budgets reject unsafe configuration',async()=>{
 await assert.rejects(runAgentHarness({model:fake([]),tools:[echo],prompt:'x',maxSteps:0}),RangeError);
 await assert.rejects(runAgentHarness({model:fake([]),tools:[echo,echo],prompt:'x'}),TypeError);
});
test('market data provenance, stale history and generated sample denied',()=>{
 assert.equal(validateEvidence(evidence()).symbol,'AAPL');
 assert.throws(()=>validateEvidence({...evidence(),source:'Sample tape'}),/Verified/);
 assert.throws(()=>validateEvidence({...evidence(),candles:evidence().candles.slice(0,20)}),/Verified/);
 const stale=evidence();stale.candles=stale.candles.map(c=>({...c,date:new Date(Date.parse(c.date+'T00:00:00Z')-14*86400000).toISOString().slice(0,10)}));
 assert.throws(()=>validateEvidence(stale),/stale/);
});
test('backtest tool and risk tool are deterministic and read-only',async()=>{
 const tools=makeResearchTools(evidence());
 const t=tools.find(t=>t.name==='backtest_sma_rule');
 assert.equal(t.validate({lookback:60}),true);
 assert.equal(t.validate({lookback:999}),false);
 assert.equal((await t.execute({lookback:60})).test,'historical_sma_experiment');
 const risk=tools.find(t=>t.name==='check_hypothetical_risk');
 assert.equal((await risk.execute({action:'BUY',allocationPct:40,stopLossPct:5})).status,'BLOCKED_BY_ILLUSTRATIVE_LIMITS');
 assert.equal((await risk.execute({action:'HOLD',allocationPct:0,stopLossPct:0})).status,'WITHIN_ILLUSTRATIVE_LIMITS');
 assert.equal(tools.some(t=>/submit|execute_order|shell|write/.test(t.name)),false);
});
test('research suppresses unsupported final model answer',async()=>{
 const r=await researchWithAi({...evidence(),focus:'',evidence:evidence(),
  model:fake([{content:'BUY now'}])});
 assert.equal(r.status,'incomplete_evidence');assert.equal(r.answer,null);assert.equal(r.tradingEnabled,false);
 assert.equal(r.researchIntegrity.accepted,false);
});
test('research passes only after all four mandatory tools and executes trust-gated agent team',async()=>{
 const requiredNames=['read_market_evidence','backtest_sma_rule','check_hypothetical_risk','execution_capabilities'];
 const allTools=[...requiredNames,'read_market_intelligence'];
 const args=[{},{lookback:60},{action:'HOLD',allocationPct:0,stopLossPct:0},{}];
 const toolSets=[],prompts=[];
 const model={provider:'test',model:'scripted',generate:async({tools,messages})=>{
  toolSets.push(tools.map(tool=>tool.name));
  prompts.push(messages[0]?.content);
  if(toolSets.length===1) return {content:'',toolCalls:requiredNames.map((n,i)=>call('c'+i,n,args[i]))};
  if(toolSets.length===2) return {content:'Evidence gathered for independent review'};
  return {content:'NO SIGNAL pending independent review'};
 }};
 const r=await researchWithAi({...evidence(),focus:'',evidence:evidence(),
  model});
 assert.equal(r.status,'completed');assert.equal(r.toolCalls,4);
 assert.equal(r.answer,'NO SIGNAL pending independent review');
 assert.equal(r.researchIntegrity.accepted,true);
 assert.match(r.researchIntegrity.description,/not prediction accuracy/);
 assert.equal(r.diagnostics.observations,90);
 assert.ok(Number.isFinite(r.diagnostics.annualizedVolatilityPct));
 assert.ok(r.diagnostics.maxObservedDrawdownPct<=0);
 assert.deepEqual(toolSets,[allTools,allTools,[],[]]);
 assert.ok(prompts[2].length<=1800);
 assert.match(prompts[2],/"liveOrderPlacement":false/);
 assert.deepEqual(r.agents.map(item=>item.name),['Market Research Analyst','Independent Risk Reviewer','Trust Gate & Compliance Synthesizer']);
 assert.ok(r.events.some(event=>event.agent==='Independent Risk Reviewer'));
 assert.ok(r.events.some(event=>event.agent==='Trust Gate & Compliance Synthesizer'));

 assert.ok(r.trustGate);
 assert.equal(r.trustGate.trustTier,'GOLD');
 assert.equal(r.trustGate.gateDecision,'TRUST_APPROVED');
 assert.equal(r.trustGate.chain.verified,true);
 assert.equal(r.trustGate.chain.blocksCount,4);
});

test('request validation rejects unknown markets, tools and prompts',()=>{
 assert.deepEqual(validateAiRequest({market:'nasdaq',symbol:'AAPL'}),{market:'nasdaq',symbol:'AAPL',focus:''});
 assert.throws(()=>validateAiRequest({market:'wrong',symbol:'AAPL'}),/Invalid/);
 assert.throws(()=>validateAiRequest({market:'nasdaq',symbol:'../etc/passwd'}),/Invalid/);
 assert.throws(()=>validateAiRequest({market:'nasdaq',symbol:'AAPL',tool:'run'}),/Invalid/);
});
test('Ollama endpoint must be loopback, never user-selected remote host',()=>{
 assert.equal(getLocalOllamaUrl('http://127.0.0.1:11434'),'http://127.0.0.1:11434');
 assert.throws(()=>getLocalOllamaUrl('http://evil.com:11434'),/loopback/);
 assert.throws(()=>getLocalOllamaUrl('http://127.0.0.1:11434/secrets'),/loopback/);
});
test('Ollama adapter forwards tool calls without execution',async()=>{
 let sent;
 const model=ollamaModel({baseUrl:'http://127.0.0.1:11434',model:'qwen3:4b',
  fetchImpl:async(_url,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({
    message:{content:'',tool_calls:[{function:{name:'read',arguments:{}}}]}
  }),{status:200});}});
 const res=await model.generate({messages:[{role:'user',content:'test'}],
  tools:[{name:'read',description:'Read',parameters:{type:'object'}}],
  signal:new AbortController().signal});
 assert.equal(res.toolCalls[0].name,'read');
 assert.equal(sent.stream,false);
 assert.equal(sent.tools[0].function.name,'read');
});

test('latest complete tool batch cannot silently disappear from model context', () => {
  const group=[{role:'user',content:'short'},
    {role:'assistant',content:'',toolCalls:[call('a','read')]},
    {role:'tool',callId:'a',name:'read',content:'x'.repeat(2000),isError:false}];
  assert.throws(()=>selectAgentContext(group,200),/Latest complete tool batch/);
});

test('trust-gated agent team calculates deterministic trust score and assigns Gold, Silver, Bronze tiers', () => {
  const ev = evidence();
  const validTools = [
    { tool: 'read_market_evidence', result: { market: 'nasdaq', symbol: 'AAPL' } },
    { tool: 'backtest_sma_rule', result: { test: 'historical_sma_experiment' } },
    { tool: 'check_hypothetical_risk', result: { status: 'WITHIN_ILLUSTRATIVE_LIMITS' } },
    { tool: 'execution_capabilities', result: { readOnly: true, liveOrderPlacement: false } }
  ];

  const gold = evaluateTrustMetrics({
    evidence: ev,
    toolEvidence: validTools,
    researchStatus: 'completed',
    reviewStatus: 'completed'
  });
  assert.equal(gold.trustScore, 100);
  assert.equal(gold.trustTier, 'GOLD');
  assert.equal(gold.gateDecision, 'TRUST_APPROVED');
  assert.equal(gold.evidenceGroundingPct, 100);

  // Warning state -> Silver / Flagged
  const flagged = evaluateTrustMetrics({
    evidence: ev,
    toolEvidence: [
      { tool: 'read_market_evidence', result: { market: 'nasdaq', symbol: 'AAPL' } },
      { tool: 'backtest_sma_rule', result: { test: 'historical_sma_experiment' } },
      { tool: 'check_hypothetical_risk', result: { status: 'BLOCKED_BY_ILLUSTRATIVE_LIMITS' } },
      { tool: 'execution_capabilities', result: { readOnly: true, liveOrderPlacement: false } }
    ],
    researchStatus: 'completed',
    reviewStatus: 'completed'
  });
  assert.equal(flagged.trustScore, 80);
  assert.equal(flagged.trustTier, 'SILVER');
  assert.equal(flagged.gateDecision, 'TRUST_FLAGGED');


  // Missing required tools -> Bronze / Blocked
  const bronze = evaluateTrustMetrics({
    evidence: ev,
    toolEvidence: [{ tool: 'read_market_evidence', result: {} }],
    researchStatus: 'incomplete_evidence',
    reviewStatus: 'skipped'
  });
  assert.ok(bronze.trustScore < 50);
  assert.equal(bronze.trustTier, 'BRONZE');
  assert.equal(bronze.gateDecision, 'TRUST_BLOCKED');
});

test('SHA-256 cryptographic audit chain detects tampering in any historical block', () => {
  const ev = evidence();
  const validTools = [
    { tool: 'read_market_evidence', result: { close: 150 } },
    { tool: 'backtest_sma_rule', result: {} },
    { tool: 'check_hypothetical_risk', result: { status: 'WITHIN_ILLUSTRATIVE_LIMITS' } },
    { tool: 'execution_capabilities', result: { readOnly: true, liveOrderPlacement: false } }
  ];

  const blocks = buildTrustChain({
    runId: 'test-run-12345',
    market: 'nasdaq',
    symbol: 'AAPL',
    evidence: ev,
    toolEvidence: validTools,
    researchRun: { runId: 'test-run-12345', status: 'completed' },
    reviewRun: { runId: 'review-123', status: 'completed', answer: 'Verified WATCH' },
    gateDecision: 'TRUST_APPROVED',
    trustScore: 95
  });

  assert.equal(blocks.length, 4);
  const verifyResult = verifyTrustChain(blocks);
  assert.equal(verifyResult.verified, true);
  assert.equal(verifyResult.blocksCount, 4);
  assert.ok(verifyResult.genesisHash.length === 64);

  // Tamper with block 1 payload
  const tamperedBlocks = JSON.parse(JSON.stringify(blocks));
  tamperedBlocks[1].payloadHash = '0'.repeat(64);
  const tamperCheck = verifyTrustChain(tamperedBlocks);
  assert.equal(tamperCheck.verified, false);
  assert.equal(tamperCheck.tamperedBlock, 1);

  // Tamper with hash continuity between block 1 and block 2
  const brokenLinkBlocks = JSON.parse(JSON.stringify(blocks));
  brokenLinkBlocks[2].previousHash = 'f'.repeat(64);
  const brokenCheck = verifyTrustChain(brokenLinkBlocks);
  assert.equal(brokenCheck.verified, false);
  assert.equal(brokenCheck.tamperedBlock, 2);
});

test('starter agent catalog defines all 4 starter agents and binds to agent.md specification', async () => {
  assert.ok(STARTER_AGENT_CATALOG.ai_data_analysis_agent);
  assert.ok(STARTER_AGENT_CATALOG.xai_finance_agent);
  assert.ok(STARTER_AGENT_CATALOG.openai_research_agent);
  assert.ok(STARTER_AGENT_CATALOG.web_scraping_ai_agent);

  const status = await getAiStatus();
  assert.ok(Array.isArray(status.starterAgents));
  assert.equal(status.starterAgents.length, 4);

  const ids = status.starterAgents.map(a => a.id);
  assert.deepEqual(ids, [
    'starter_ai_agents/ai_data_analysis_agent',
    'starter_ai_agents/xai_finance_agent',
    'starter_ai_agents/openai_research_agent',
    'starter_ai_agents/web_scraping_ai_agent'
  ]);
});


