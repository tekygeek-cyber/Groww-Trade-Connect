import { useEffect, useState, type FormEvent } from 'react';
import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  requestPasswordRecovery,
  updateUser,
} from '@netlify/identity';
import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { checkOwnerIdentity } from '../lib/identity-owner-client.mjs';
import { Wordmark } from './wordmark';

type Stage = 'checking' | 'login' | 'invite' | 'forgot' | 'reset' |
  'owner' | 'forbidden' | 'unavailable' | 'unconfigured';
type AuthCallback = { type: string; token?: string | null; user?: unknown } | null;

const inputClass =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function IdentityLabScreen() {
  const [stage, setStage] = useState<Stage>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // This isolated route is NOT the production dashboard authentication yet.
  // Step 3 must migrate all Express private APIs away from the Groww session.
  async function checkTrustedOwner() {
    const user = await getUser();
    if (!user) {
      setStage('login');
      return;
    }
    const result = await checkOwnerIdentity();
    if (result === 'authorized') {
      setStage('owner');
    } else if (result === 'forbidden') {
      await logout();
      setStage('forbidden');
    } else if (result === 'unauthenticated') {
      setStage('login');
      setError('The application session is not available. Please sign in again.');
    } else {
      setStage('unconfigured');
    }
  }

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const callback = (await handleAuthCallback()) as AuthCallback;
        if (!active) return;
        if (callback) {
          // Invite and recovery tokens should not remain visible in the address bar.
          window.history.replaceState({}, '', '/identity-lab');
          if (callback.type === 'invite') {
            if (!callback.token) throw new Error('Invite token missing');
            setInviteToken(callback.token);
            setStage('invite');
            return;
          }
          if (callback.type === 'recovery') {
            setStage('reset');
            return;
          }
          setNotice('Identity email verification processed.');
        }
        if (active) await checkTrustedOwner();
      } catch {
        if (!active) return;
        if (window.location.hash) {
          window.history.replaceState({}, '', '/identity-lab');
        }
        setError('Identity is not configured or the sign-in link has expired. Check the private Netlify Identity settings.');
        setStage('unavailable');
      }
    };
    void start();
    return () => { active = false; };
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      setPassword('');
      await checkTrustedOwner();
    } catch {
      setError('Unable to sign in. Check your credentials and private Identity configuration.');
    } finally {
      setBusy(false);
    }
  }

  async function completeInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !inviteToken || password.length < 12) return;
    setBusy(true);
    setError('');
    try {
      await acceptInvite(inviteToken, password);
      setInviteToken(null);
      setPassword('');
      await checkTrustedOwner();
    } catch {
      setError('Unable to accept this invite. Request a new invitation from the Netlify project owner.');
    } finally {
      setBusy(false);
    }
  }

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestPasswordRecovery(email.trim());
      setNotice('If this invited account exists, check its email for a recovery link.');
      setStage('login');
    } catch {
      // Do not reveal whether an email is registered.
      setNotice('If this invited account exists, check its email for a recovery link.');
      setStage('login');
    } finally {
      setBusy(false);
    }
  }

  async function completeRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || password.length < 12) return;
    setBusy(true);
    setError('');
    try {
      await updateUser({ password });
      setPassword('');
      setNotice('Password updated. Confirming your owner access.');
      await checkTrustedOwner();
    } catch {
      setError('Password reset failed. Request a new recovery link.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await logout();
      setPassword('');
      setInviteToken(null);
      setStage('login');
      setNotice('Signed out of the application Identity session.');
    } catch {
      setError('Could not complete sign-out. Retry before closing this browser.');
    } finally {
      setBusy(false);
    }
  }

  const isPasswordStep = stage === 'login' || stage === 'invite' || stage === 'reset';
  const isForm = isPasswordStep || stage === 'forgot';
  return (
    <div className="desk-shell flex min-h-screen flex-col bg-bg text-fg">
      <header className="border-b border-border bg-bg/90 px-5 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <Wordmark />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted">
            <LockKeyhole className="size-3.5" /> Owner Identity Lab
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8" aria-label="Netlify Identity login lab">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-lg border border-border bg-surface-2 p-3">
              <KeyRound className="size-5 text-primary" />
            </span>
            <div>
              <h1 className="text-xl font-semibold">Owner sign-in lab</h1>
              <p className="text-xs text-muted">Netlify Identity · Invite-only application account</p>
            </div>
          </div>

          <p className="mb-5 rounded-lg border border-border bg-bg/50 p-3 text-xs text-muted">
            Engineering preview only. This sign-in verifies the application identity;
            existing Groww-backed dashboard APIs will be migrated in Step 3.
          </p>

          {error ? <p className="mb-4 text-sm text-down" role="alert">{error}</p> : null}
          {notice ? <p className="mb-4 text-sm text-muted" role="status">{notice}</p> : null}

          {stage === 'checking' ? <p role="status" className="text-sm text-muted">Checking Identity session…</p> : null}
          {stage === 'owner' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-fg">
                <ShieldCheck className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">Owner identity verified</p>
                  <p className="text-muted">The server checked your Identity user ID. Broker credentials were not required.</p>
                </div>
              </div>
              <p className="text-xs text-muted">
                The legacy Groww-protected API routes are not yet migrated. This lab does not unlock the dashboard.
              </p>
              <button type="button" onClick={()=>void signOut()} disabled={busy}
                className="h-11 w-full rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50">
                Sign out
              </button>
            </div>
          ) : null}
          {stage === 'forbidden' ? (
            <div role="alert" className="space-y-3 text-sm">
              <p>This Identity account is not authorized as the sole owner. The session has been signed out.</p>
              <button type="button" className="text-primary underline" onClick={()=>setStage('login')}>Return to login</button>
            </div>
          ) : null}
          {stage === 'unconfigured' || stage === 'unavailable' ? (
            <div role="status" className="space-y-3 text-sm text-muted">
              <p>Identity verification is unavailable. Enable Netlify Identity, use Invite only, and configure the backend OWNER_IDENTITY_USER_ID on a private Netlify project.</p>
              <button type="button" className="text-primary underline" onClick={()=>setStage('login')}>Try signing in</button>
            </div>
          ) : null}

          {isForm ? (
            <form className="space-y-4" onSubmit={stage==='invite' ? completeInvite : stage==='reset' ? completeRecovery : stage==='forgot' ? requestRecovery : submitLogin}>
              <h2 className="text-sm font-semibold">
                {stage === 'invite' ? 'Accept your invitation' :
                 stage === 'reset' ? 'Choose a new password' :
                 stage === 'forgot' ? 'Recover your password' : 'Sign in to your account'}
              </h2>
              {stage === 'login' || stage === 'forgot' ? (
                <div>
                  <label htmlFor="identity-email" className="block pb-1.5 text-xs font-medium">Email address</label>
                  <input id="identity-email" type="email" autoComplete="email" required
                    className={inputClass} value={email} onChange={event=>setEmail(event.target.value)}
                    placeholder="Owner account email" />
                </div>
              ) : null}
              {isPasswordStep ? (
                <div>
                  <label htmlFor="identity-password" className="block pb-1.5 text-xs font-medium">
                    {stage === 'login' ? 'Password' : 'New password'}
                  </label>
                  <div className="relative">
                    <input id="identity-password" type={showPassword?'text':'password'}
                      autoComplete={stage==='login'?'current-password':'new-password'}
                      minLength={stage==='login'?undefined:12}
                      required className={inputClass + ' pr-12'} value={password}
                      onChange={event=>setPassword(event.target.value)} />
                    <button type="button" onClick={()=>setShowPassword(value=>!value)}
                      aria-label={showPassword?'Hide password':'Show password'}
                      className="absolute right-3 top-3 text-muted">
                      {showPassword?<EyeOff className="size-4"/>:<Eye className="size-4"/>}
                    </button>
                  </div>
                  {stage !== 'login' ? <p className="mt-1 text-xs text-muted">Use at least 12 characters.</p> : null}
                </div>
              ) : null}
              <button type="submit" disabled={busy}
                className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50">
                {busy ? 'Processing…' :
                 stage==='invite'?'Accept invite' :
                 stage==='reset'?'Update password' :
                 stage==='forgot'?'Request reset email':'Sign in securely'}
              </button>
              {stage==='login'?(
                <button type="button" className="block w-full text-center text-xs text-primary underline"
                  onClick={()=>{setError('');setStage('forgot');}}>Forgot password?</button>
              ):stage==='forgot'?(
                <button type="button" className="block w-full text-center text-xs text-primary underline"
                  onClick={()=>{setError('');setStage('login');}}>Back to login</button>
              ):null}
            </form>
          ) : null}
        </section>
        <p className="mt-4 text-center text-xs text-muted">
          No public registration · No Groww API key required for owner identity
        </p>
      </main>
    </div>
  );
}
