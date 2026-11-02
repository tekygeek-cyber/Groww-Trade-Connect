import test from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

test('health endpoint responds with valid JSON', async () => {
  const response = await fetch(base + '/api/health');
  assert.equal(response.status,200);
  assert.equal((await response.json()).ok,true);
});
test('anonymous status is not authenticated', async () => {
  const res=await fetch(base+'/api/auth/status');
  assert.equal(res.status,200);
  assert.equal((await res.json()).authenticated,false);
});
test('private account and broker endpoints refuse unauthenticated callers', async () => {
  for(const path of ['/api/profile','/api/brokers/status','/api/algo-orders/list']) {
    const res=await fetch(base+path);
    assert.equal(res.status,401,path);
  }
});
test('privileged mutations refuse cross-origin and anonymous requests', async () => {
  const cross=await fetch(base+'/api/automation',{method:'POST',headers:{Origin:'https://unauthorized.example','Content-Type':'application/json'},body:'{}'});
  assert.equal(cross.status,403);
  const anon=await fetch(base+'/api/automation',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
  assert.equal(anon.status,401);
});
test('sample historical candles are explicit and live Nifty fallback fails closed',async()=>{
  const sample=await fetch(base+'/api/candles/nifty/RELIANCE?sample=true');
  assert.equal(sample.status,200);
  const payload=await sample.json();
  assert.equal(payload.source,'Sample tape');
  assert.ok(payload.candles.length>=50);
  const live=await fetch(base+'/api/candles/nifty/RELIANCE');
  assert.equal(live.status,500);
});

test('NASDAQ sample scan completes across its configured universe',async()=>{
  const universe=await (await fetch(base+'/api/universe/nasdaq')).json();
  const start=await fetch(base+'/api/demo/scan',{
    method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({market:'nasdaq',sample:true})
  });
  assert.equal(start.status,200);
  const {id}=await start.json();
  let job;
  for(let i=0;i<50;i++){
    await new Promise(resolve=>setTimeout(resolve,100));
    const response=await fetch(`${base}/api/signals/jobs/${id}`);
    assert.equal(response.status,200);
    job=await response.json();
    if(job.status!=='running') break;
  }
  assert.equal(job.status,'done');
  assert.equal(job.meta.market,'nasdaq');
  assert.equal(job.meta.matched,universe.count);
  assert.deepEqual(job.meta.failed,[]);
});

test('AI status reveals only provider readiness, not private data', async()=>{
  const res=await fetch(base+'/api/ai/status');
  assert.equal(res.status,200);
  const status=await res.json();
  assert.equal(typeof status.ready,'boolean');
  assert.equal(status.mode,'read_only');
  assert.equal(status.liveOrdersEnabled,false);
});
test('AI research requires authentication and matching Origin',async()=>{
  const anonymous=await fetch(base+'/api/ai/research',{method:'POST',
    headers:{Origin:base,'content-type':'application/json'},
    body:JSON.stringify({market:'nasdaq',symbol:'AAPL'})});
  assert.equal(anonymous.status,401);
  const attack=await fetch(base+'/api/ai/research',{method:'POST',
    headers:{Origin:'https://malicious.example','content-type':'application/json'},body:'{}'});
  assert.equal(attack.status,403);
});

test('unauthenticated rehearsal and audit remain private',async()=>{
  for(const route of ['/api/trading/capabilities','/api/trading/audit']){
    const result=await fetch(base+route);
    assert.equal(result.status,401,route);
  }
  const res=await fetch(base+'/api/trading/rehearsal',{
    method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
    body:JSON.stringify({market:'NASDAQ',symbol:'AAPL',side:'BUY',quantity:1,price:100,mode:'LIVE'})
  });
  assert.equal(res.status,401);
});

test('Kraken prelogin diagnostic rejects unsafe input and cross-origin callers', async()=>{
  const bad=await fetch(base+'/api/kraken/check-readonly',{
    method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
    body:'{}'
  });
  assert.equal(bad.status,400);
  const cross=await fetch(base+'/api/kraken/check-readonly',{
    method:'POST',headers:{Origin:'https://example-evil.test','Content-Type':'application/json'},
    body:'{}'
  });
  assert.equal(cross.status,403);
});
