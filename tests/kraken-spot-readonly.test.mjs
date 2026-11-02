import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {
  KRAKEN_KEY_INFO_PATH,KRAKEN_SPOT_ORIGIN,signKrakenSpotRequest,
  validateKrakenSpotCredentialForm,classifyKrakenPermissions,
  verifyKrakenSpotReadOnly,nextKrakenSpotNonce
} from '../server/kraken/spot-readonly.mjs';

const key='ExampleReadOnlyKrakenSpotAPIKey123';
const secret=Buffer.alloc(32,42).toString('base64');
const form={apiKey:key,apiSecret:secret};
const demoResult=(permissions)=>({
  error:[],result:{apiKey:key,apiKeyName:'My Read Only Key',permissions}
});

test('API signature uses Kraken spot nonce+form SHA256 / path HMAC SHA512',()=>{
  const encoded='nonce=1616492376594';
  const derived=signKrakenSpotRequest(KRAKEN_KEY_INFO_PATH,encoded,secret);
  const hashed=createHash('sha256').update('1616492376594'+encoded).digest();
  const expected=createHmac('sha512',Buffer.from(secret,'base64'))
    .update(KRAKEN_KEY_INFO_PATH).update(hashed).digest('base64');
  assert.equal(derived,expected);
  assert.throws(()=>signKrakenSpotRequest('/0/private/AddOrder',encoded,secret),/only permits/);
  assert.throws(()=>signKrakenSpotRequest('/0/private/Withdraw',encoded,secret),/only permits/);
});
test('monotonic nonce increments on rapid consecutive requests',()=>{
  const a=BigInt(nextKrakenSpotNonce()),b=BigInt(nextKrakenSpotNonce());
  assert.ok(b>a);
});
test('invalid forms, extra fields, OTP, and key encoding fail before provider access',()=>{
  for (const invalid of [{...form,leverage:10},{...form,otp:'123'},
    {...form,apiSecret:'malformed?bad'},{...form,apiKey:'bad key'}]) {
    assert.throws(()=>validateKrakenSpotCredentialForm(invalid),TypeError);
  }
});
test('permission classifier requires known explicit read-only scopes',()=>{
  assert.equal(classifyKrakenPermissions(['query-funds','query-open-trades']).safe,true);
  for(const unsafe of [['modify-trades'],['withdraw-funds'],['close-trades'],['add-funds'],
    ['earn-funds'],['create-ws-token'],['query-funds','modify-trades'],
    ['query-funds','unknown-future-scope'],[],[5]]) {
    assert.equal(classifyKrakenPermissions(unsafe).safe,false);
  }
});
test('one-shot verification sends only signed key-info POST and returns no secret',async()=>{
  let attempts=0;
  const impl=async(url,options)=>{
    attempts++;
    assert.equal(url,KRAKEN_SPOT_ORIGIN+KRAKEN_KEY_INFO_PATH);
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['API-Key'],key);
    assert.ok(options.headers['API-Sign'].length>70);
    assert.ok(!options.body.includes(secret));
    assert.equal(new URLSearchParams(options.body).get('nonce'),'1616492376594');
    return new Response(JSON.stringify(demoResult(['query-funds'])),{status:200});
  };
  const value=await verifyKrakenSpotReadOnly(form,{fetchImpl:impl,nonce:'1616492376594'});
  assert.equal(value.verified,true);
  assert.equal(value.keysRetained,false);
  assert.equal(value.ordersEnabled,false);
  assert.deepEqual(value.permissionSummary,['query-funds']);
  assert.equal(attempts,1);
  assert.equal(JSON.stringify(value).includes(secret),false);
  assert.equal(JSON.stringify(value).includes(key),false);
});
test('trading-authorized keys are rejected, never kept',async()=>{
  const result=await verifyKrakenSpotReadOnly(form,{fetchImpl:async()=>{
    return new Response(JSON.stringify(demoResult(['query-funds','modify-trades'])),{status:200});
  },nonce:'1616492376594'});
  assert.equal(result.verified,false);
  assert.equal(result.reason,'UNSAFE_KEY_PERMISSIONS');
  assert.equal(result.keysRetained,false);
});
test('malformed provider responses, failures, mismatched API key never count as verified',async()=>{
  for(const response of [
    new Response('{}',{status:401}),
    new Response('not json',{status:200}),
    new Response(JSON.stringify({error:['EAPI:Invalid key'],result:{permissions:['query-funds']}}),{status:200}),
    new Response(JSON.stringify({error:[],result:{apiKey:'different',permissions:['query-funds']}}),{status:200})
  ]) {
    await assert.rejects(verifyKrakenSpotReadOnly(form,{fetchImpl:async()=>response,nonce:'1616492376594'}));
  }
});
test('network failures do not echo provider URL or secrets',async()=>{
  await assert.rejects(verifyKrakenSpotReadOnly(form,{fetchImpl:async()=>{throw Error('secret='+secret);},nonce:'1616492376594'}),
  e=>e.message==='KRAKEN_AUTH_NETWORK_UNAVAILABLE');
});
test('no API key is cached or used to authorize broker orders',async()=>{
  const r=await verifyKrakenSpotReadOnly(form,{fetchImpl:async()=>new Response(JSON.stringify(demoResult(['query-ledger'])),{status:200}),nonce:'1616492376594'});
  assert.equal(r.verified,true);
  assert.equal(Object.keys(r).some(x=>/secret|token|accountBalance/i.test(x)),false);
});
