import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, ArrowRight, Play } from 'lucide-react';
import { api, type SessionStatus } from '../lib/api';
import { AccentSwitch } from './accent';
import { Wordmark } from './wordmark';

const fieldClass =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary';

const SAVED_LOGIN_KEY = 'groww-connect-login';

type SavedLogin = {
  apiKey: string;
  apiSecret: string;
  requestToken: string;
};

function readSavedLogin(): SavedLogin | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVED_LOGIN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedLogin>;
    return {
      apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
      apiSecret: typeof data.apiSecret === 'string' ? data.apiSecret : '',
      requestToken: typeof data.requestToken === 'string' ? data.requestToken : '',
    };
  } catch {
    return null;
  }
}

export function LoginScreen({ onEnterDesk }: { onEnterDesk: (sample: boolean) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [requestToken, setRequestToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [apiState, setApiState] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    const saved = readSavedLogin();
    if (!saved) return;
    setApiKey(saved.apiKey);
    setApiSecret(saved.apiSecret);
    setRequestToken(saved.requestToken);
    if (saved.apiKey || saved.apiSecret || saved.requestToken) {
      setSavedNote('Saved details loaded from this browser.');
    }
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

  function saveDetails() {
    const details: SavedLogin = {
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      requestToken: requestToken.trim(),
    };
    if (!details.apiKey && !details.apiSecret && !details.requestToken) {
      setError('Enter the details you want to keep, then press Save.');
      return;
    }
    localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify(details));
    setSavedNote('Details stored in this browser for quick sign in.');
    setError(null);
  }

  function clearDetails() {
    localStorage.removeItem(SAVED_LOGIN_KEY);
    setApiKey('');
    setApiSecret('');
    setRequestToken('');
    setSavedNote(null);
    setError(null);
  }

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
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Wordmark />
          <AccentSwitch />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-surface-2 border border-border text-primary">
              <KeyRound className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-fg">Groww Connect Trading Desk</h1>
              <p className="text-xs text-muted">Direct institutional scanner & multi-market execution desk</p>
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

          {savedNote ? (
            <p className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs text-muted">
              {savedNote}
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

              <button
                type="button"
                onClick={saveDetails}
                className="h-11 rounded-lg border border-border px-3 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              >
                Save
              </button>
              {savedNote ? (
                <button
                  type="button"
                  onClick={clearDetails}
                  className="h-11 rounded-lg border border-border px-3 text-xs text-muted hover:bg-surface-2 hover:text-fg"
                >
                  Clear
                </button>
              ) : null}
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

        <div className="mt-6 text-center text-xs text-muted">
          Access tokens are created securely and preserved on the server until 06:00 IST. The browser never receives secrets.
        </div>
      </main>
    </div>
  );
}
