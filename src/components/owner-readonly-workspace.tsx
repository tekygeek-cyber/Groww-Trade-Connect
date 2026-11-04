import { useEffect, useState } from 'react';
import { CircleAlert, CheckCircle2, DatabaseZap, ShieldCheck } from 'lucide-react';

type Connections = {
  brokerCredentialIntakeEnabled: boolean;
  credentialVaultConfigured: boolean;
  connections: Array<{ provider: string; state: string; secretExposed: boolean }>;
};
type Capabilities = {
  mode: string;
  liveOrdersEnabled: boolean;
  brokerCredentialIntakeEnabled: boolean;
  privateApiMigrationComplete: boolean;
};

async function readProtected<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Private backend authorization or service unavailable');
  return response.json() as Promise<T>;
}

/** This view deliberately cannot accept or display broker credentials.
 * Every backend request independently verifies the owner's Identity session.
 */
export function OwnerReadOnlyWorkspace() {
  const [connections, setConnections] = useState<Connections | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [state, setState] = useState<'loading'|'ready'|'unavailable'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readProtected<Connections>('/api/app/connections', controller.signal),
      readProtected<Capabilities>('/api/app/capabilities', controller.signal),
    ]).then(([links, caps]) => {
      if (controller.signal.aborted) return;
      setConnections(links);
      setCapabilities(caps);
      setState('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  return (
    <section aria-label="Owner-only workspace" className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-primary" /> Owner-only backend
      </h2>
      {state === 'loading' && <p role="status" className="text-xs text-muted">Checking owner-only API endpoints…</p>}
      {state === 'unavailable' && (
        <p role="alert" className="flex items-start gap-2 text-xs text-muted">
          <CircleAlert className="size-4 shrink-0" />
          Backend verification unavailable. No private connections or trading controls have been enabled.
        </p>
      )}
      {state === 'ready' && connections && capabilities && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-muted">
            <CheckCircle2 className="size-4 text-primary" />
            Identity was independently verified for the protected backend request.
          </p>
          <div className="space-y-2">
            {connections.connections.map(item => (
              <div key={item.provider} className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-xs">
                <span className="font-semibold capitalize text-fg">{item.provider}</span>
                <span className="text-muted">
                  {item.state === 'not_migrated' ? 'Connection migration pending' : 'Unavailable'}
                </span>
              </div>
            ))}
          </div>
          <p className="flex gap-2 text-xs leading-relaxed text-muted">
            <DatabaseZap className="size-4 shrink-0" />
            Broker credentials are not accepted or saved in this lab. A separate encrypted, durable server-side vault is required.
          </p>
          <p className="text-xs text-muted">
            Research API migration: {capabilities.privateApiMigrationComplete ? 'complete' : 'pending'}.
            Live trading: {capabilities.liveOrdersEnabled ? 'enabled' : 'disabled'}.
          </p>
        </div>
      )}
    </section>
  );
}
