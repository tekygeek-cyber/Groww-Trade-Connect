import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  acceptInvite, getUser, handleAuthCallback, login, logout,
  requestPasswordRecovery, updateUser,
} from '@netlify/identity';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { AccentSwitch } from './accent';
import { Wordmark } from './wordmark';
import { OwnerReadOnlyWorkspace } from './owner-readonly-workspace';

type Stage = 'checking' | 'login' | 'forgot' | 'invite' | 'reset' | 'authorized' | 'setup';
type OwnerCheck = { authenticated: boolean; authorized: boolean; mode?: string; code?: string; identityId?: string; setting?: string };
const inputStyle =
  'mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg ' +
  'outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary';

export function OwnerIdentityLogin() {
  const [stage, setStage] = useState<Stage>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupIdentityId, setSetupIdentityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Prevent StrictMode's effect replay from redeeming the same callback twice.
  const callbackPromise = useRef<ReturnType<typeof handleAuthCallback> | null>(null);

  async function verifyOwner(): Promise<boolean> {
    const response = await fetch('/api/identity/session', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const result = await response.json() as OwnerCheck;
      if (result.authenticated === true && result.authorized === true &&
          result.mode === 'identity_owner') {
        setError(null);
        setStage('authorized');
        return true;
      }
      throw new Error('Unexpected identity verification response');
    }

    if (response.status === 503) {
      const setup = await response.json().catch(() => null) as OwnerCheck | null;
      if (setup?.code === 'OWNER_NOT_CONFIGURED' && setup.authenticated === true &&
          setup.authorized === false && setup.setting === 'OWNER_IDENTITY_USER_ID' &&
          typeof setup.identityId === 'string' && setup.identityId.length > 0) {
        // The backend verified the current Identity session before returning this ID.
        // This is configuration guidance, never an authorization bypass.
        setSetupIdentityId(setup.identityId);
        setError(null);
        setStage('setup');
        return false;
      }
      setError('Identity verification is temporarily unavailable.');
    } else if (response.status === 403) {
      // Do not retain an unauthorized browser session for the private workspace.
      await logout().catch(() => {});
      setError('This account is not authorized to access the private workspace.');
    } else if (response.status === 401) {
      setError(null);
    } else {
      setError('Owner verification is unavailable. Check the private Identity setup.');
    }
    setStage('login');
    return false;
  }

  useEffect(() => {
    let cancelled = false;
    if (!callbackPromise.current) callbackPromise.current = handleAuthCallback();

    void (async () => {
      try {
        const callback = await callbackPromise.current;
        if (cancelled) return;
        if (callback && window.location.hash) {
          // Clear consumed invitation/recovery tokens from browser navigation history.
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }

        if (callback?.type === 'invite' && callback.token) {
          setInviteToken(callback.token);
          setStage('invite');
          return;
        }
        if (callback?.type === 'recovery') {
          // A password reset may proceed only for the configured owner.
          const authenticated = await verifyOwner();
          if (!cancelled && authenticated) setStage('reset');
          return;
        }

        const user = await getUser();
        if (cancelled) return;
        if (!user) {
          setStage('login');
          return;
        }
        await verifyOwner();
      } catch {
        if (!cancelled) {
          setError('Authentication is not configured or could not be verified.');
          setStage('login');
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await login(email.trim(), password);
      setPassword('');
      await verifyOwner();
    } catch {
      setPassword('');
      setError('Sign-in unsuccessful. Check your credentials and private-site access.');
      setStage('login');
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !inviteToken || password.length < 12) return;
    setBusy(true);
    setError(null);
    try {
      await acceptInvite(inviteToken, password);
      setInviteToken(null);
      setPassword('');
      await verifyOwner();
    } catch {
      setError('Invite activation failed. Check that the invitation is valid.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || password.length < 12) return;
    setBusy(true);
    setError(null);
    try {
      await updateUser({ password });
      setPassword('');
      await verifyOwner();
      setNotice('Password updated.');
    } catch {
      setError('Password update failed. Request another recovery link if needed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordRecovery(email.trim());
      setNotice('If this address is registered, password recovery instructions have been sent.');
      setStage('login');
    } catch {
      setError('Password recovery is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await logout();
      setPassword('');
      setNotice(null);
      setError(null);
      setStage('login');
    } catch {
      setError('Could not complete sign-out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const awaitingSecret = stage === 'login' || stage === 'invite' || stage === 'reset';

  return (
    <div className="desk-shell flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border bg-bg/90 px-4 py-4 backdrop-blur-lg sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Wordmark />
          <AccentSwitch />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
        <section className="w-full rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8"
          aria-label="Private application sign in">
          <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-primary">
            {stage === 'authorized' ? <ShieldCheck className="size-6" /> :
              <LockKeyhole className="size-6" />}
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {stage === 'authorized' ? 'Owner identity verified' :
              stage === 'setup' ? 'Finish owner setup' :
              stage === 'invite' ? 'Accept your private invitation' :
                stage === 'reset' ? 'Choose a new password' :
                  stage === 'forgot' ? 'Recover your account' :
                    'Welcome to your private research desk'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {stage === 'authorized'
              ? 'You are signed in as the verified application owner.'
              : 'Application sign-in is separate from Groww, Kraken and other broker connections.'}
          </p>

          {error && <p role="alert" className="mt-4 rounded-lg border border-border bg-bg p-3 text-sm text-down">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-lg border border-border bg-bg p-3 text-sm text-fg">{notice}</p>}

          {stage === 'checking' && <p role="status" className="mt-5 text-sm text-muted">Checking your secure session…</p>}

          {stage === 'setup' && (
            <div className="mt-6 space-y-4" aria-label="Owner authorization setup">
              <p role="status" className="rounded-lg border border-border bg-bg p-3 text-sm text-muted">
                Your Identity session is verified, but private APIs remain locked until
                this exact user ID is authorized in the server environment.
              </p>
              <div className="space-y-1.5">
                <h2 className="text-sm font-semibold text-fg">1. Your verified identity</h2>
                <label htmlFor="verified-owner-id" className="text-xs text-muted">Verified Netlify Identity user ID</label>
                <input id="verified-owner-id" readOnly value={setupIdentityId ?? ''}
                  onFocus={event => event.currentTarget.select()}
                  className={inputStyle + ' font-mono text-xs'} />
                <button type="button" onClick={() => {
                  if (!setupIdentityId) return;
                  void navigator.clipboard.writeText(setupIdentityId)
                    .then(() => setNotice('Verified Identity user ID copied.'))
                    .catch(() => setNotice('Select and copy the ID from the field above.'));
                }} className="text-sm font-medium text-primary">
                  Copy verified ID
                </button>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-sm font-semibold text-fg">2. Authorize it in Netlify</h2>
                <p className="text-xs leading-relaxed text-muted">
                  In the Netlify dashboard, open this project’s Environment variables.
                  Add the server-side variable below using the verified ID above as its value.
                  Enable it for Functions and the intended deployment context. Then create
                  an approved new deploy so the Function receives the updated setting.
                </p>
                <code className="block select-all rounded-lg border border-border bg-bg p-3 text-xs text-fg">
                  OWNER_IDENTITY_SUB
                </code>
                <p className="text-xs text-muted">
                  Never use your email address, a Groww key, a VITE_ variable or a GitHub file.
                  This screen cannot change Netlify configuration for you.
                </p>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-sm font-semibold text-fg">3. Optional hardening</h2>
                <p className="text-xs leading-relaxed text-muted">
                  Set Identity registration to Invite only. Protect production and Deploy
                  Previews with private project visibility, and review Identity users.
                </p>
              </div>
              <button type="button" disabled={busy}
                onClick={() => void verifyOwner()}
                className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-fg disabled:opacity-50">
                Check owner authorization again
              </button>
              <button type="button" disabled={busy} onClick={() => void signOut()}
                className="h-11 w-full rounded-lg border border-border text-sm font-semibold text-fg disabled:opacity-50">
                Sign out
              </button>
            </div>
          )}

          {stage === 'authorized' && (
            <div className="mt-6 space-y-4">
              <p className="rounded-xl border border-border bg-bg p-4 text-sm leading-relaxed text-muted">
                Owner authentication is operational in the lab. The legacy Express private APIs
                still depend on the old broker session and are not connected to this identity yet.
                The full dashboard will be enabled after the Step 3 API migration and security tests.
              </p>
              <OwnerReadOnlyWorkspace />
              <button type="button" disabled={busy} onClick={() => void signOut()}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-surface-2 text-sm font-semibold text-fg disabled:opacity-50">
                Sign out securely
              </button>
            </div>
          )}

          {stage === 'login' && (
            <form className="mt-6 space-y-4" onSubmit={submitCredentials}>
              <div>
                <label htmlFor="owner-email" className="block text-xs font-medium text-muted">Email address</label>
                <input id="owner-email" type="email" autoComplete="username" required
                  value={email} onChange={event => setEmail(event.target.value)} className={inputStyle}
                  placeholder="Owner email address" />
              </div>
              <div>
                <label htmlFor="owner-password" className="block text-xs font-medium text-muted">Password</label>
                <div className="relative">
                  <input id="owner-password" type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password" required value={password}
                    onChange={event => setPassword(event.target.value)}
                    className={inputStyle + ' pr-12'} placeholder="Your password" />
                  <button type="button" onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-4 text-muted">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50">
                <KeyRound className="size-4" />
                {busy ? 'Verifying…' : 'Sign in securely'} <ArrowRight className="size-4" />
              </button>
              <button type="button" onClick={() => { setError(null); setStage('forgot'); }}
                className="block w-full text-center text-xs font-medium text-primary">
                Forgot password?
              </button>
            </form>
          )}

          {stage === 'forgot' && (
            <form className="mt-6 space-y-4" onSubmit={submitRecovery}>
              <label htmlFor="recovery-email" className="block text-xs font-medium text-muted">Account email</label>
              <input id="recovery-email" type="email" autoComplete="email" required
                value={email} onChange={event => setEmail(event.target.value)} className={inputStyle} />
              <button type="submit" disabled={busy}
                className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-fg disabled:opacity-50">
                {busy ? 'Sending…' : 'Send recovery instructions'}
              </button>
              <button type="button" onClick={() => setStage('login')}
                className="w-full text-center text-xs text-muted">Return to sign in</button>
            </form>
          )}

          {(stage === 'invite' || stage === 'reset') && (
            <form className="mt-6 space-y-4" onSubmit={stage === 'invite' ? submitInvite : submitReset}>
              <label htmlFor="new-owner-password" className="block text-xs font-medium text-muted">
                New password (at least 12 characters)
              </label>
              <input id="new-owner-password" type="password" autoComplete="new-password"
                minLength={12} required value={password} onChange={event => setPassword(event.target.value)}
                className={inputStyle} />
              <button type="submit" disabled={busy || password.length < 12}
                className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-fg disabled:opacity-50">
                {busy ? 'Saving…' : stage === 'invite' ? 'Activate invited account' : 'Update password'}
              </button>
            </form>
          )}

          <p className="mt-8 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted">
            <ShieldCheck className="size-4 shrink-0" />
            Invite-only owner access. No trading execution enabled.
          </p>
          {awaitingSecret && <p className="mt-2 text-xs text-muted">Do not enter broker API keys here. Connect providers after application login.</p>}
        </section>
      </main>
    </div>
  );
}
