import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3011';
const allowed='https://trade.example.test';

test('production reverse proxy accepts canonical browser Origin despite private Host',async()=>{
  const login=await fetch(base+'/api/auth/login',{
    method:'POST',headers:{Origin:allowed,'Content-Type':'application/json'},
    body:JSON.stringify({})});
  assert.equal(login.status,400,'Valid Origin should reach credential shape validation');
  const body=await login.json();
  assert.ok(!String(body.detail).includes('matching request Origin'));
  // Kraken key validation is permitted only after Origin checks succeed.
  const kraken=await fetch(base+'/api/kraken/check-readonly',{
    method:'POST',headers:{Origin:allowed,'Content-Type':'application/json'},body:'{}'});
  assert.equal(kraken.status,400);
});

test('production reverse proxy still rejects missing and cross-site Origins',async()=>{
  for(const origin of [undefined,'https://attacker.example.test',
    'http://trade.example.test','null','https://trade.example.test.evil.net']){
    const headers={'Content-Type':'application/json'};
    if(origin) headers.Origin=origin;
    const res=await fetch(base+'/api/kraken/check-readonly',{
      method:'POST',headers,body:'{}'});
    assert.equal(res.status,403,String(origin));
  }
});

test('read-only no-key endpoints continue working behind proxy',async()=>{
  const res=await fetch(base+'/api/health');
  assert.equal(res.status,200);
  assert.equal((await res.json()).ok,true);
});
