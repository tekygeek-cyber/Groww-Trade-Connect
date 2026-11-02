import {createHash,createHmac} from 'node:crypto';

export const KRAKEN_SPOT_ORIGIN='https://api.kraken.com';
export const KRAKEN_KEY_INFO_PATH='/0/private/GetApiKeyInfo';
// Explicitly allow only read-only Kraken Spot permissions. Trading and transfers are rejected.
const READ_PERMISSIONS=new Set(['query-funds','query-open-trades','query-closed-trades','query-ledger','export-data']);

export function validateKrakenSpotCredentialForm(value) {
  if(!value || typeof value!=='object'||Array.isArray(value) ||
      Object.keys(value).some(k=>!['apiKey','apiSecret','otp'].includes(k)) ||
      typeof value.apiKey!=='string'||value.apiKey.length<8||value.apiKey.length>200 ||
      typeof value.apiSecret!=='string'||value.apiSecret.length<20||value.apiSecret.length>400 ||
      (value.otp!==undefined && (typeof value.otp!=='string'|| !/^\d{6}$/.test(value.otp)))) {
    throw new TypeError('Invalid Kraken read-only credential form');
  }
  if(!/^[a-zA-Z0-9+/_=-]+$/.test(value.apiKey) ||
      !/^[a-zA-Z0-9+/]+={0,2}$/.test(value.apiSecret)) {
    throw new TypeError('Invalid Kraken credential encoding');
  }
  return {apiKey:value.apiKey,apiSecret:value.apiSecret,otp:value.otp};
}

export function signKrakenSpotRequest(path, formBody, secret) {
  if(path!==KRAKEN_KEY_INFO_PATH || typeof formBody!=='string' ||
      typeof secret!=='string' || !/^[a-zA-Z0-9+/]+={0,2}$/.test(secret)) {
    throw new TypeError('Kraken signer only permits GetApiKeyInfo');
  }
  const params=new URLSearchParams(formBody);
  const nonce=params.get('nonce');
  if(!nonce || !/^\d{10,20}$/.test(nonce)) throw new TypeError('Missing monotonic nonce');
  const rawSecret=Buffer.from(secret,'base64');
  if(rawSecret.length<16) throw new TypeError('Invalid Kraken key material');
  const digest=createHash('sha256').update(nonce+formBody).digest();
  return createHmac('sha512',rawSecret).update(path).update(digest).digest('base64');
}

export function classifyKrakenPermissions(input) {
  if(!Array.isArray(input) || input.length<1 || input.some(x=>typeof x!=='string')) {
    return {safe:false,reason:'PERMISSIONS_UNVERIFIED',permissions:[]};
  }
  const distinct=[...new Set(input)];
  if(distinct.some(x=>!READ_PERMISSIONS.has(x))) {
    return {safe:false,reason:'UNSAFE_KEY_PERMISSIONS',permissions:[]};
  }
  return {safe:true,reason:'READ_ONLY_CONFIRMED',permissions:distinct};
}

/** One-shot key verification only; key & secret discarded after this call. */
export async function verifyKrakenSpotReadOnly(
  credentials, {fetchImpl=fetch,nonce=String(Date.now())}={}
) {
  const form=validateKrakenSpotCredentialForm(credentials);
  const body=new URLSearchParams({nonce});
  if(form.otp) body.set('otp',form.otp);
  const encoded=body.toString();
  const signature=signKrakenSpotRequest(KRAKEN_KEY_INFO_PATH,encoded,form.apiSecret);
  let response;
  try{
    response=await fetchImpl(KRAKEN_SPOT_ORIGIN+KRAKEN_KEY_INFO_PATH,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{'API-Key':form.apiKey,'API-Sign':signature,
        'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json',
        'User-Agent':'Groww-Trade-Connect-ReadOnly-KeyCheck/1.0'},
      body:encoded
    });
  }catch{
    throw new Error('KRAKEN_AUTH_NETWORK_UNAVAILABLE');
  }
  if(!response.ok) throw new Error('KRAKEN_AUTH_HTTP_FAILURE');
  let data;
  try{data=await response.json();}catch{throw new Error('KRAKEN_AUTH_RESPONSE_INVALID');}
  if(!data || !Array.isArray(data.error) || data.error.length ||
      !data.result || typeof data.result!=='object') {
    throw new Error('KRAKEN_AUTH_REJECTED');
  }
  const classification=classifyKrakenPermissions(data.result.permissions);
  if(!classification.safe) {
    return {verified:false,reason:classification.reason,environment:'KRAKEN_SPOT_PRODUCTION',
      keysRetained:false,ordersEnabled:false};
  }
  return {verified:true,reason:classification.reason,environment:'KRAKEN_SPOT_PRODUCTION',
    keysRetained:false,ordersEnabled:false,
    permissionSummary:classification.permissions,
    apiKeyLabel:typeof data.result.apiKeyName==='string'
      ? data.result.apiKeyName.slice(0,60):'Kraken Spot read-only key'};
}
