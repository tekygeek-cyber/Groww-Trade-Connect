import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, ShieldCheck, Play, AlertTriangle, Activity, Clock3, Cpu, ClipboardCheck, Database, LockKeyhole } from 'lucide-react';
import { api } from '../lib/api';
import { TradingRehearsalPanel } from './trading-rehearsal-panel';
import { getConstituents } from '../data/universes';
import type { MarketType } from '../types/market';

type AgentStatus = {enabled:boolean;ready:boolean;model?:string|null;reason?:string|null;provider?:string;mode:string};
type AgentEvent = {type:string;agent?:string;tool?:string;step?:number;failed?:boolean;durationMs?:number;status?:string};
type AgentRun = {
  status:string;answer:string|null;error:string|null;runId:string;model:string;
  steps:number;toolCalls:number;events:AgentEvent[];
  agents:{name:string;status:string;runId:string;steps:number;toolCalls:number}[];
  evidence:{market:string;symbol:string;source:string;asOf:string;bars:number};
  tradingEnabled:boolean;disclaimer:string;
};
export function AiModePanel({ market, sample }: {market: MarketType;sample:boolean}) {
  const symbols = useMemo(()=>getConstituents(market).slice(0,50),[market]);
  const [symbol,setSymbol]=useState('');
  const [focus,setFocus]=useState('');
  const [state,setState]=useState<AgentStatus|null>(null);
  const [checking,setChecking]=useState(true);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<AgentRun|null>(null);

  useEffect(()=>{
    setSymbol(symbols[0]?.ticker||'');
    setResult(null);setError(null);
  },[market,symbols]);
  async function refreshStatus() {
    setChecking(true);
    try { setState(await api<AgentStatus>('/api/ai/status')); }
    catch {setState({enabled:false,ready:false,reason:'Model service not reachable',mode:'read_only'});}
    finally {setChecking(false);}
  }
  useEffect(()=>{ void refreshStatus(); },[]);
  async function analyze() {
    if(sample||running||!state?.ready||!symbol)return;
    setRunning(true);setError(null);setResult(null);
    try{
      const output=await api<AgentRun>('/api/ai/research',{method:'POST',
        body:JSON.stringify({market,symbol,focus:focus.trim()})});
      setResult(output);
    } catch(err) {setError(err instanceof Error?err.message:'AI research failed');}
    finally {setRunning(false);}
  }
  const disabled=checking||running||sample||!state?.ready||!symbol;
  return (
    <section className="space-y-5" aria-label="AI research mode">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap justify-between gap-5">
          <div className="max-w-xl">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-primary">
              <BrainCircuit className="size-4" /> Local research team
            </p>
            <h2 className="text-xl font-semibold text-fg">AI market research team</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A local analyst gathers verified market evidence and a separate risk reviewer
              checks the findings. Only the analyst has bounded read-only tools; neither can place trades.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className={'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold '+(state?.ready?'border-emerald-500/25 bg-emerald-500/10 text-emerald-400':'border-amber-500/25 bg-amber-500/10 text-amber-400')}>
              <span className={'size-2 rounded-full '+(state?.ready?'bg-emerald-400':'bg-amber-400')} />
              {checking?'Checking model…':state?.ready?'Local LLM ready':'LLM offline'}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted"><Cpu className="size-3.5" /> {state?.model||'qwen3:4b'} / Ollama · 2 agents</span>
            <button onClick={refreshStatus} type="button" className="text-xs font-medium text-primary hover:underline">Recheck model</button>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck className="size-4 text-emerald-400" /> No live order permissions</p>
          <p className="flex items-center gap-2 text-xs text-muted"><Clock3 className="size-4 text-primary" /> 2 sequential reviews</p>
          <p className="flex items-center gap-2 text-xs text-muted"><ClipboardCheck className="size-4 text-primary" /> Deterministic risk checks</p>
        </div>
      </div>

      {(!state?.ready || sample) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-400" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            {sample
              ? 'AI inference requires an authenticated research session. Sample mode lets you inspect the mode, but does not send anonymous requests to the local model.'
              : (state?.reason||'The server cannot find the configured local LLM.')}
            {!sample && <p className="mt-2 text-xs">On the server, install Ollama, run <code className="rounded bg-bg px-1.5 py-0.5">ollama pull qwen3:4b</code>, then start the Ollama service.</p>}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <label className="block text-xs font-semibold text-muted">
            Instrument
            <select aria-label="AI instrument" value={symbol} onChange={e=>setSymbol(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg focus-visible:ring-2 focus-visible:ring-primary">
              {symbols.map(item=><option key={item.ticker} value={item.ticker}>{item.ticker} — {item.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted">
            Research focus (optional)
            <input aria-label="AI research focus" maxLength={160} value={focus} onChange={e=>setFocus(e.target.value)}
              placeholder="e.g. Does the 20/50-day cross justify watching?"
              className="mt-2 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted"><LockKeyhole className="mr-1 inline size-3.5" /> Research only · no broker operations</p>
          <button type="button" onClick={analyze} disabled={disabled}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="size-4" /> {running?'Agent evaluating…':'Run AI research'}
          </button>
        </div>
      </div>
      {error&&<p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400" role="alert">{error}</p>}
      {result&&(
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6" role="status" aria-label="AI analysis results">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold"><BrainCircuit className="size-4 text-primary" /> AI research report</h3>
            <span className={'rounded-full border px-3 py-1 text-xs font-semibold '+(result.status==='completed'?'border-emerald-500/30 text-emerald-400':'border-amber-500/30 text-amber-400')}>
              {result.status.replace(/_/g,' ')}
            </span>
          </div>
          <div className="grid gap-3 text-xs text-muted sm:grid-cols-3">
            <span className="flex gap-2"><Database className="size-3.5" /> {result.evidence.source}</span>
            <span>As of: {result.evidence.asOf}</span>
            <span>Model steps: {result.steps} · Tool calls: {result.toolCalls}</span>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2" aria-label="Agent team runs">
            {result.agents.map((agent)=>(
              <li key={agent.runId} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs">
                <span className="font-semibold text-fg">{agent.name}</span>
                <span className="ml-2 text-muted">{agent.status.replace(/_/g,' ')}</span>
              </li>
            ))}
          </ol>
          {result.answer?<p className="whitespace-pre-wrap rounded-xl border border-border bg-bg p-4 text-sm leading-relaxed text-fg">{result.answer}</p>:
            <p className="text-sm text-watch">{result.error||'Agent did not complete an evidence-based assessment. No signal.'}</p>}
          <details className="rounded-xl border border-border bg-bg p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Harness execution audit · {result.events.length} events</summary>
            <ol className="mt-3 space-y-2 text-xs text-muted">
              {result.events.filter(e=>['tool_end','model_error','run_end'].includes(e.type)).map((event,i)=>
                <li key={i}>{event.agent||'Agent'} · {event.type} {event.tool||''} {event.failed?'(failed)':''} {event.durationMs!==undefined?event.durationMs+' ms':''}</li>
              )}
            </ol>
          </details>
          <p className="flex items-start gap-2 text-xs text-watch"><ShieldCheck className="size-4 shrink-0" /> {result.disclaimer}</p>
        </div>
      )}
      <TradingRehearsalPanel market={market} symbol={symbol} sample={sample} />
      <p className="text-xs text-muted">The model can be inaccurate. Historical experiments do not establish future profitability. No autonomous order submission or code execution.</p>
    </section>
  );
}
