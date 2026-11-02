import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, ClipboardCheck, LockKeyhole, FlaskConical } from 'lucide-react';
import { api } from '../lib/api';
import type { MarketType } from '../types/market';

type Gate = {decision:'PASS'|'PASS_WITH_LIMIT'|'REVIEW'|'BLOCK';allowedQuantity:number;
  reasonCodes:string[];auditId:string;checks:Record<string,string>;notional:number|null;
  ruleEngineVersion:string;message:string};
type Result = {simulationOnly:true;brokerSubmission:false;orderAcceptedByBroker:false;
  fixture:{id:string;currency:string;buyingPower:number;equity:number;priceSource:string};
  gate:Gate;audit:{auditId:string;sequence:number;hash:string}};
const marketType=(market: MarketType): 'NSE'|'NASDAQ'|'CRYPTO'|null => market==='nifty'?'NSE':market==='nasdaq'?'NASDAQ':market==='crypto'?'CRYPTO':null;
export function TradingRehearsalPanel({
  market,symbol,sample
}: {market:MarketType;symbol:string;sample:boolean}) {
  const [price,setPrice]=useState('100');
  const [qty,setQty]=useState('1');
  const [side,setSide]=useState<'BUY'|'SELL'>('BUY');
  const [mode,setMode]=useState<'PAPER'|'LIVE'>('PAPER');
  const [scenario,setScenario]=useState('NORMAL');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<Result|null>(null);
  useEffect(()=>{setResult(null);setError('');},[market,symbol]);
  async function run() {
    if(busy||sample||!symbol||!marketType(market))return;
    setBusy(true);setError('');setResult(null);
    try {
      setResult(await api<Result>('/api/trading/rehearsal',{
        method:'POST',
        body:JSON.stringify({market:marketType(market),symbol,side,quantity:Number(qty),
          price:Number(price),mode,scenario})
      }));
    } catch(e) {setError(e instanceof Error?e.message:'Rehearsal failed');}
    finally {setBusy(false);}
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-label="Trading risk rehearsal">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-primary">
            <FlaskConical className="size-4"/> Deterministic risk & compliance
          </p>
          <h3 className="text-lg font-semibold text-fg">Trading rehearsal</h3>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Test a hypothetical order against a mock account and five safety layers.
            This panel does not connect to brokers or use real balances.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 px-3 py-1 text-xs font-semibold text-amber-400">
          <LockKeyhole className="size-3.5" /> Execution disabled
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-muted">
          Side
          <select aria-label="Rehearsal side" value={side} onChange={e=>setSide(e.target.value as 'BUY'|'SELL')} className="mt-1.5 w-full rounded-lg border border-border bg-bg p-2.5 text-fg">
            <option value="BUY">Buy</option><option value="SELL">Sell</option>
          </select>
        </label>
        <label className="text-xs font-medium text-muted">
          Hypothetical price
          <input aria-label="Rehearsal price" type="number" min="0.01" step="any" value={price}
            onChange={e=>setPrice(e.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-bg p-2.5 text-fg"/>
        </label>
        <label className="text-xs font-medium text-muted">
          Quantity
          <input aria-label="Rehearsal quantity" type="number" min="0.00001" step="any" value={qty}
            onChange={e=>setQty(e.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-bg p-2.5 text-fg"/>
        </label>
        <label className="text-xs font-medium text-muted">
          Order mode to test
          <select aria-label="Rehearsal mode" value={mode} onChange={e=>setMode(e.target.value as 'PAPER'|'LIVE')} className="mt-1.5 w-full rounded-lg border border-border bg-bg p-2.5 text-fg">
            <option value="PAPER">Paper rehearsal</option>
            <option value="LIVE">Live-order safety test (BLOCK only)</option>
          </select>
        </label>
        <label className="col-span-2 text-xs font-medium text-muted">
          Failure scenario
          <select aria-label="Risk scenario" value={scenario} onChange={e=>setScenario(e.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-bg p-2.5 text-fg">
            <option value="NORMAL">Normal (hypothetical open market)</option>
            <option value="HALTED">Market halted</option>
            <option value="RESTRICTED">Restricted instrument</option>
            <option value="STALE">Stale price data</option>
            <option value="KILL_SWITCH">Emergency kill switch</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">Symbol: <strong className="text-fg">{symbol||'None'}</strong> · 100,000 mock equity</span>
        <button type="button" onClick={run} disabled={busy||sample||!symbol||!marketType(market)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-40">
          <ClipboardCheck className="size-4" /> {busy?'Evaluating…':'Run risk rehearsal'}
        </button>
      </div>
      {!marketType(market)&&<p className="text-xs text-watch" role="status">ETF rehearsals are disabled until instrument-specific currency and venue rules are implemented.</p>}
      {sample&&<p className="text-xs text-watch" role="status">Sign in to access server-side rehearsals. No broker credentials are necessary.</p>}
      {error&&<p role="alert" className="rounded-lg border border-red-500/25 p-3 text-sm text-red-400">{error}</p>}
      {result&&(
        <div role="status" className="space-y-3 rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={'rounded-full border px-3 py-1 text-xs font-semibold '+(result.gate.decision==='PASS'?'border-emerald-500/40 text-emerald-400':'border-amber-500/40 text-amber-400')}>
              {result.gate.decision} — simulated only
            </span>
            <span className="text-xs text-muted">{result.fixture.currency} {result.gate.notional?.toLocaleString()||'N/A'} hypothetical notional</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(result.gate.checks).map(([name,status])=>(
              <span key={name} className="flex items-center gap-2 text-xs text-muted"><ShieldCheck className="size-3.5"/> {name}: {status}</span>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-watch">{result.gate.reasonCodes.length?result.gate.reasonCodes.join(' · '):'Checks passed for the mock account only. This does not authorize an order.'}</p>
          <p className="text-[11px] break-all text-muted">Audit #{result.audit.sequence} · {result.audit.auditId} · Rule {result.gate.ruleEngineVersion}</p>
          <p className="flex items-start gap-2 text-xs text-muted"><AlertTriangle className="size-4 shrink-0"/> No real or paper order was placed. No broker acknowledgment or execution occurred.</p>
        </div>
      )}
    </section>
  );
}
