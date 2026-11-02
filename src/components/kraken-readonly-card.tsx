import { useState, type FormEvent } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, AlertTriangle, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';

type KrakenResult={
  verified:boolean;reason:string;environment:string;keysRetained:false;
  ordersEnabled:false;permissionSummary?:string[];apiKeyLabel?:string;
};
/** One-shot pre-login credential health check. No account session or broker trading rights. */
export function KrakenReadOnlyCard() {
  const [expanded,setExpanded]=useState(false);
  const [key,setKey]=useState('');
  const [secret,setSecret]=useState('');
  const [otp,setOtp]=useState('');
  const [visible,setVisible]=useState(false);
  const [checking,setChecking]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<KrakenResult|null>(null);
  const secure=typeof window!=='undefined' &&
    (window.isSecureContext && (window.location.protocol==='https:' ||
      ['localhost','127.0.0.1'].includes(window.location.hostname)));
  async function verify(event:FormEvent) {
    event.preventDefault();
    if(checking||!secure)return;
    setChecking(true);setError('');setResult(null);
    try {
      const response=await api<KrakenResult>('/api/kraken/check-readonly',{
        method:'POST',body:JSON.stringify({apiKey:key,apiSecret:secret,...(otp?{otp}:{})})
      });
      setResult(response);
    }catch{
      setError('Verification failed or permissions are unsafe. Check the key scope and retry later.');
    }finally {
      // Browser credentials are used once and never kept for a second request.
      setKey('');setSecret('');setOtp('');setChecking(false);
    }
  }
  return (
    <section className="mt-5 rounded-xl border border-border bg-surface/90 p-4" aria-label="Kraken API key diagnostic">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-lg border border-border bg-surface-2 p-2 text-primary"><KeyRound className="size-4"/></span>
          <div>
            <h3 className="text-sm font-semibold text-fg">Kraken Spot · API security check</h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">Optional one-time permission verification. No orders, balance queries, or connection persistence.</p>
          </div>
        </div>
        <button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg hover:bg-surface-2">
          {expanded?'Close':'Verify read-only key'}
        </button>
      </div>
      {expanded&&(
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="flex gap-2 text-xs leading-relaxed text-watch">
            <AlertTriangle className="size-4 shrink-0"/>
            This is a production Kraken Spot credential check, NOT a sandbox. Create a key with read-only permissions only—no order, funding changes, withdrawals, or transfer rights.
          </p>
          <a href="https://docs.kraken.com/api/docs/rest-api/get-api-key-info" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Kraken API permission documentation <ExternalLink className="size-3"/>
          </a>
          <form onSubmit={verify} className="space-y-3" autoComplete="off">
            <label className="block text-xs font-medium text-muted">Kraken Spot API key
              <input aria-label="Kraken Spot API key" type="password" autoComplete="off" required value={key}
                onChange={e=>setKey(e.target.value)} maxLength={200} spellCheck={false}
                className="mt-1.5 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg"/>
            </label>
            <label className="block text-xs font-medium text-muted">Kraken Spot API secret
              <div className="relative mt-1.5">
                <input aria-label="Kraken Spot API secret" type={visible?'text':'password'} autoComplete="off" required value={secret}
                  onChange={e=>setSecret(e.target.value)} maxLength={400} spellCheck={false}
                  className="h-10 w-full rounded-lg border border-border bg-bg px-3 pr-12 text-sm text-fg"/>
                <button type="button" aria-label={visible?'Hide Kraken secret':'Show Kraken secret'}
                  onClick={()=>setVisible(!visible)} className="absolute right-3 top-2.5 text-muted">
                  {visible?<EyeOff className="size-4"/>:<Eye className="size-4"/>}
                </button>
              </div>
            </label>
            <label className="block text-xs font-medium text-muted">API 2FA code (only when required)
              <input aria-label="Kraken API 2FA code" type="password" inputMode="numeric" pattern="[0-9]{6}"
                autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6}
                className="mt-1.5 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg"/>
            </label>
            {!secure&&<p className="text-xs text-watch" role="alert">Key entry requires HTTPS or localhost.</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs text-muted"><LockKeyhole className="size-3.5"/> Server checks permission scope; secrets discarded</p>
              <button type="submit" disabled={!secure||checking||!key||!secret}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-40">
                <ShieldCheck className="size-4"/>{checking?'Verifying…':'Verify once'}
              </button>
            </div>
          </form>
        </div>
      )}
      {error&&<p role="alert" className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-watch">{error}</p>}
      {result&&(
        <div role="status" className="mt-3 rounded-lg border border-border bg-bg p-3 text-xs">
          <p className="font-semibold text-fg">{result.verified?'Read-only permission check passed':'Key rejected'}</p>
          <p className="mt-1 text-muted">Environment: {result.environment}. Credentials discarded. Trading disabled.</p>
          {result.verified&&<p className="mt-1 text-muted">Allowed permissions: {result.permissionSummary?.join(', ')||'Not available'}</p>}
          <p className="mt-1 text-muted">This check does not sign you into the research desk or establish an ongoing broker connection.</p>
        </div>
      )}
    </section>
  );
}
