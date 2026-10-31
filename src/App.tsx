import { useState, useEffect } from 'react';
import { Desk } from './components/desk';
import { LoginScreen } from './components/login-screen';
import { AccentInit } from './components/accent';
import { AlertsProvider } from './lib/alerts-context';
import { QuotesProvider } from './lib/quotes-context';
import { PortfolioProvider } from './lib/portfolio-context';
import { api, type SessionStatus } from './lib/api';

export default function App() {
  const [view, setView] = useState<'checking' | 'login' | 'desk'>('checking');
  const [sample, setSample] = useState<boolean>(false);

  useEffect(() => {
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
