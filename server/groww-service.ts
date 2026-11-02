import fs from 'fs';
import path from 'path';
import type { Profile, SessionStatus, GttRow, AutoState } from '../src/types/market';
import { getNext6AmIst as calculateSessionExpiry } from './auth-policy.mjs';
import { makeGrowwApprovalPayload, makeGrowwTotpPayload, extractGrowwAccessToken, GROWW_TOKEN_URL } from './groww-auth-flow.mjs';
import { generateSessionId, hashSessionId, matchesSessionId } from './session-policy.mjs';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const SESSION_PATH = path.join(DATA_DIR, 'session.json');
const DUMMY_GTT_PATH = path.join(DATA_DIR, 'dummy_gtt.json');
const AUTOMATION_PATH = path.join(DATA_DIR, 'automation.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getNext6AmIst(now: Date = new Date()): Date {
  return calculateSessionExpiry(now);
}

export type StoredSession = {
  accessToken: string;
  sessionHash: string;
  flow: 'approval' | 'totp' | string;
  createdAt: string;
  expiresAt: string;
};

let memorySession: StoredSession | null = null;

function loadStoredSession(): StoredSession | null {
  if (memorySession && new Date(memorySession.expiresAt).getTime() > Date.now()) return memorySession;
  memorySession = null;
  ensureDataDir();
  if (!fs.existsSync(SESSION_PATH)) return null;
  try {
    const data: StoredSession = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    if (!data || typeof data.accessToken !== 'string' || !data.accessToken.trim() ||
        data.accessToken.startsWith('groww_token_') || !/^[0-9a-f]{64}$/.test(data.sessionHash) ||
        !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) {
      fs.unlinkSync(SESSION_PATH); // Revoke unbound legacy sessions and expired data.
      return null;
    }
    memorySession = data;
    return data;
  } catch {
    return null;
  }
}

/** Never return broker credentials unless this exact caller owns the session cookie. */
export function readSession(sessionId?: string | null): StoredSession | null {
  const stored = loadStoredSession();
  return stored && matchesSessionId(sessionId, stored.sessionHash) ? stored : null;
}

export function writeSession(token: string, flow: string): { session: StoredSession; sessionId: string } {
  const sessionId = generateSessionId();
  const sessionHash = hashSessionId(sessionId);
  if (!sessionHash || typeof token !== 'string' || !token.trim()) {
    throw new TypeError('A genuine broker token and a session identifier are required');
  }
  ensureDataDir();
  const session: StoredSession = {
    accessToken: token.trim(),
    sessionHash,
    flow,
    createdAt: new Date().toISOString(),
    expiresAt: getNext6AmIst().toISOString(),
  };
  // Fail closed on disk failures; never advertise a session that cannot be recovered.
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session), { mode: 0o600 });
  memorySession = session;
  return { session, sessionId };
}

/** A request without the caller's session cookie must not revoke someone else's session. */
export function clearSession(sessionId?: string | null): boolean {
  if (!readSession(sessionId)) return false;
  memorySession = null;
  try {
    fs.unlinkSync(SESSION_PATH);
  } catch {
    // The memory session is revoked, but persistence cleanup needs deployment monitoring.
    throw new Error('Could not revoke persisted session');
  }
  return true;
}

export function getPublicSessionStatus(sessionId?: string | null): SessionStatus {
  const session = readSession(sessionId);
  if (!session) return { authenticated: false };
  return { authenticated: true, expires_at: session.expiresAt, flow: session.flow };
}

export async function loginGroww(
  body: { apiKey?: string; apiSecret?: string; requestToken?: string },
  existingSessionId?: string | null
): Promise<SessionStatus & { sessionId: string }> {
  // Single-tenant only: prevent a second anonymous browser from taking over shared server state.
  const previousSession = loadStoredSession();
  if (previousSession && !matchesSessionId(existingSessionId, previousSession.sessionHash)) {
    throw new Error('This single-user desk already has an active authenticated session.');
  }
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  const apiSecret = typeof body?.apiSecret === 'string' ? body.apiSecret.trim() : '';
  const requestToken = typeof body?.requestToken === 'string' ? body.requestToken.trim() : '';
  if (!apiKey || (!apiSecret && !requestToken)) {
    throw new Error('Groww API key and API secret or request token are required.');
  }
  const flow = requestToken ? 'totp' : 'approval';
  // Groww requires a subscription and either daily approved API-secret checksum
  // or a six-digit TOTP; no credentials are persisted or sent to an LLM.
  const payload = requestToken
    ? makeGrowwTotpPayload(requestToken)
    : makeGrowwApprovalPayload(apiSecret);
  let response: Response;
  try {
    response = await fetch(GROWW_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-VERSION': '1.0',
        'User-Agent': 'GrowwConnectDesk/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Groww authentication service unreachable. No session was created.');
  }
  if (!response.ok) throw new Error('Groww rejected authentication. No session was created.');
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('Invalid Groww authentication response.'); }
  const brokerToken = extractGrowwAccessToken(response.status, data);

  const { session, sessionId } = writeSession(brokerToken, flow);
  return { authenticated: true, expires_at: session.expiresAt, flow: session.flow, sessionId };
}

export function getProfile(sample: boolean = false, sessionId?: string | null): Profile {
  if (sample) {
    return {
      user_name: 'Demo Trader',
      user_id: 'DEMO9814',
      products: ['CASH', 'CNC', 'MIS', 'FNO'],
      exchanges: ['NSE', 'BSE'],
      ddpi_enabled: true,
      sample: true,
    };
  }

  const session = readSession(sessionId);
  return {
    user_name: session ? 'Groww Desk User' : null,
    user_id: session ? 'GROWW_SESSION' : null,
    products: ['CASH', 'CNC', 'MIS'],
    exchanges: ['NSE', 'BSE'],
    ddpi_enabled: true,
    sample: false,
  };
}

export function loadDummyGtts(): any[] {
  ensureDataDir();
  if (!fs.existsSync(DUMMY_GTT_PATH)) return [];
  try {
    const raw = fs.readFileSync(DUMMY_GTT_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveDummyGtts(rows: any[]): void {
  ensureDataDir();
  try {
    fs.writeFileSync(DUMMY_GTT_PATH, JSON.stringify(rows, null, 2));
  } catch {}
}

export function loadAutomationState(): AutoState {
  ensureDataDir();
  if (fs.existsSync(AUTOMATION_PATH)) {
    try {
      const raw = fs.readFileSync(AUTOMATION_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch {}
  }

  return {
    enabled: false,
    mode: 'paper',
    live_armed: false,
    strategy: 'turtle',
    quantity: 1,
    max_orders: 3,
    symbols: ['RELIANCE', 'TCS', 'INFY'],
    sample: false,
    positions: {},
    log: [],
    last_cycle: null,
  };
}

export function saveAutomationState(state: AutoState): void {
  ensureDataDir();
  try {
    fs.writeFileSync(AUTOMATION_PATH, JSON.stringify(state, null, 2));
  } catch {}
}
