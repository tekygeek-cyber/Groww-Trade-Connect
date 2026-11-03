import { useState, useEffect } from 'react';
import { Desk } from './components/desk';
import { LoginScreen } from './components/login-screen';
import { OwnerIdentityLogin } from './components/owner-identity-login';
import { AccentInit } from './components/accent';
import { AlertsProvider } from './lib/alerts-context';
import { QuotesProvider } from './lib/quotes-context';
import { PortfolioProvider } from './lib/portfolio-context';
import { api, type SessionStatus } from './lib/api';

function LegacyApp() {
  const [view, setView] = useState<'checking' | 'login' | 'desk'>('checking');
  const [sample, setSample] = useState<boolean>(false);

  useEffect(() => {
    // Migrate away from old plaintext browser credential persistence,
    // including when an active session skips the login screen.
    try { localStorage.removeItem('groww-connect-login'); } catch {}
    // Check url search params first
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('sample') === 'true') {
        setSample(true);
        setView('desk');
        return;
      }
    }

    // Check server session
    api<SessionStatus>('/api/auth/status')
      .then((status) => {
        if (status.authenticated) {
          setSample(false);
          setView('desk');
        } else {
          setView('login');
        }
      })
      .catch(() => {
        setView('login');
      });
  }, []);

  const handleEnterDesk = (isSample: boolean) => {
    setSample(isSample);
    setView('desk');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (isSample) {
        url.searchParams.set('sample', 'true');
      } else {
        url.searchParams.delete('sample');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleSignOut = () => {
    setSample(false);
    setView('login');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('sample');
      window.history.replaceState({}, '', url.toString());
    }
  };

  if (view === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-muted text-xs">
        Connecting to Groww desk service…
      </div>
    );
  }

  return (
    <AlertsProvider>
      <QuotesProvider sample={sample}>
        <PortfolioProvider>
          <AccentInit />
          {view === 'desk' ? (
            <Desk sample={sample} onSignOut={handleSignOut} />
          ) : (
            <LoginScreen onEnterDesk={handleEnterDesk} />
          )}
        </PortfolioProvider>
      </QuotesProvider>
    </AlertsProvider>
  );
}


/**
 * Identity lab remains separate until the legacy Express APIs are migrated.
 * VITE_OWNER_AUTH_LAB=true replaces the entire app entry with owner login.
 * The dedicated /identity-lab route permits local UI smoke tests without
 * activating unported private account endpoints.
 */
export default function App() {
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const identityCallback =
    /^#(?:invite_token|recovery_token|confirmation_token|email_change_token|access_token)=/.test(hash);
  const identityLabRoute = typeof window !== 'undefined' &&
    window.location.pathname === '/identity-lab';

  if (import.meta.env.VITE_OWNER_AUTH_LAB === 'true' || identityLabRoute || identityCallback) {
    return <OwnerIdentityLogin />;
  }
  return <LegacyApp />;
}
