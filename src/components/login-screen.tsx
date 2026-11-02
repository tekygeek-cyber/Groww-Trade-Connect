import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, ArrowRight, Play } from 'lucide-react';
import { api, type SessionStatus } from '../lib/api';
import { AccentSwitch } from './accent';
import { Wordmark } from './wordmark';

const fieldClass =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary';

const SAVED_LOGIN_KEY = 'groww-connect-login';

export function LoginScreen({ onEnterDesk }: { onEnterDesk: (sample: boolean) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [requestToken, setRequestToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiState, setApiState] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    // Purge credentials saved by previous versions; never persist broker secrets in web storage.
    try { localStorage.removeItem(SAVED_LOGIN_KEY); } catch {}
  }, []);

  useEffect(() => {
    let cancel = false;
    api<SessionStatus>('/api/auth/status')
      .then((status) => {
        if (cancel) return;
        setApiState('up');
        if (status.authenticated) {
          setNotice('A saved session is active on the server until 06:00 IST. Opening desk...');
          setTimeout(() => onEnterDesk(false), 800);
        }
      })
      .catch(() => {
        if (!cancel) setApiState('down');
      });

    return () => {
      cancel = true;
    };
  }, [onEnterDesk]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        requestToken: requestToken.trim(),
      };
      const res = await api<SessionStatus>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.authenticated) {
        onEnterDesk(false);
      } else {
        setError('Authentication was not successful.');
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk-shell flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border bg-bg/90 px-4 py-4 backdrop-blur-lg sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Wordmark />
          <AccentSwitch />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16 lg:px-8">
        <aside className="relative hidden min-w-0 flex-col justify-center lg:flex">
          <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <ShieldCheck className="size-3.5" /> Research-first trading workspace
          </span>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.1] tracking-[-0.04em] text-fg">
            Better decisions start with <span className="text-primary">better evidence.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
            Discover signals, examine market data and model portfolio allocations in one focused workspace. Every source and execution limitation is clearly identified.
          </p>
          <div className="mt-9 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface/90 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">01 / Research</p>
              <p className="mt-2 text-sm font-medium text-fg">Market intelligence</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">Candle-backed technical signals when verified data is available.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface/90 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">02 / Model</p>
              <p className="mt-2 text-sm font-medium text-fg">Portfolio allocation</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">Clear constraints, indicative valuations and paper proposals.</p>
            </div>
          </div>
          <p className="mt-7 flex items-center gap-2 text-xs text-watch"><ShieldCheck className="size-4" /> Live order routing is disabled.</p>
        </aside>
        <div className="rounded-2xl border border-border bg-surface/95 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.30)] sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-surface-2 border border-border text-primary">
              <KeyRound className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-fg">Access your research desk</h2>
              <p className="text-xs text-muted">Single-user research session · live trading disabled</p>
            </div>
          </div>

          {notice ? (
            <p className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-fg" role="status">
              {notice}
            </p>
          ) : null}

          {error ? (
            <p className="note-down mt-4 rounded-lg border bg-bg px-4 py-3 text-sm text-down" role="alert">
              {error}
            </p>
          ) : null}


          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="apiKey" className="block text-xs font-medium text-muted uppercase tracking-wider">
                Groww API Key
              </label>
              <input
                id="apiKey"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Groww API Key"
                className={fieldClass + ' mt-1.5'}
                autoComplete="off"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="apiSecret" className="block text-xs font-medium text-muted uppercase tracking-wider">
                  API Secret (Flow 1)
                </label>
                <span className="text-[11px] text-muted">API Secret flow</span>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="apiSecret"
                  type={showSecret ? 'text' : 'password'}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter your Groww API Secret"
                  className={fieldClass}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-2.5 text-muted hover:text-fg"
                  aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                >
                  {showSecret ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-4 text-xs text-muted uppercase">or</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="requestToken" className="block text-xs font-medium text-muted uppercase tracking-wider">
                  TOTP Code / Request Token (Flow 2)
                </label>
                <span className="text-[11px] text-muted">6-digit TOTP</span>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="requestToken"
                  type={showToken ? 'text' : 'password'}
                  value={requestToken}
                  onChange={(e) => setRequestToken(e.target.value)}
                  placeholder="6-digit authenticator code"
                  className={fieldClass}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-2.5 text-muted hover:text-fg"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
              >
                <ShieldCheck className="size-4" />
                {busy ? 'Authenticating…' : 'Sign in to Groww Desk'}
              </button>

            </div>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-fg">Try Sample Mode</p>
                <p className="text-xs text-muted">Scan all 4 markets, backtest, and test alerts with zero API keys</p>
              </div>
              <button
                type="button"
                onClick={() => onEnterDesk(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-xs font-semibold text-fg hover:bg-line transition-colors"
              >
                <Play className="size-3.5 fill-current text-primary" />
                Open Sample Desk
              </button>
            </div>
          </div>
        </div>

        <div className="text-center text-xs leading-relaxed text-muted lg:col-start-2">
          Credentials are submitted for server-side authentication and are not saved in browser storage. The session expires at 06:00 IST. Do not share API credentials.
        </div>
      </main>
    </div>
  );
}
