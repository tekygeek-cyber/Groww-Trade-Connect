import fs from 'fs';
import path from 'path';
import type { Profile, SessionStatus, GttRow, AutoState } from '../src/types/market';

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
  // 06:00 IST = 00:30 UTC; avoid host-local timezone methods.
  const shifted = new Date(now.getTime() + 330 * 60_000);
  const day = shifted.getUTCDate() + (shifted.getUTCHours() >= 6 ? 1 : 0);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), day, 0, 30));
}

export type StoredSession = {
  accessToken: string;
  flow: 'approval' | 'totp' | string;
  createdAt: string;
  expiresAt: string;
};

let memorySession: StoredSession | null = null;

export function readSession(): StoredSession | null {
  if (memorySession) {
    if (new Date() >= new Date(memorySession.expiresAt)) {
      memorySession = null;
    } else {
      return memorySession;
    }
  }

  ensureDataDir();
  if (!fs.existsSync(SESSION_PATH)) return null;

  try {
    const raw = fs.readFileSync(SESSION_PATH, 'utf-8');
    const data: StoredSession = JSON.parse(raw);
    if (!data.accessToken || !data.expiresAt) return null;

    if (new Date() >= new Date(data.expiresAt)) {
      try {
        fs.unlinkSync(SESSION_PATH);
      } catch {}
      return null;
    }

    memorySession = data;
    return data;
  } catch {
    return null;
  }
}

export function writeSession(token: string, flow: string): StoredSession {
  ensureDataDir();
  const expires = getNext6AmIst();
  const session: StoredSession = {
    accessToken: token,
    flow,
    createdAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
  };

  memorySession = session;
  try {
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2), { mode: 0o600 });
  } catch {}

  return session;
}

export function clearSession(): void {
  memorySession = null;
  ensureDataDir();
  if (fs.existsSync(SESSION_PATH)) {
    try {
      fs.unlinkSync(SESSION_PATH);
    } catch {}
  }
}

export function getPublicSessionStatus(): SessionStatus {
  const session = readSession();
  if (!session) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    expires_at: session.expiresAt,
    flow: session.flow,
  };
}

export async function loginGroww(body: { apiKey?: string; apiSecret?: string; requestToken?: string }): Promise<SessionStatus> {
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  const apiSecret = typeof body?.apiSecret === 'string' ? body.apiSecret.trim() : '';
  const requestToken = typeof body?.requestToken === 'string' ? body.requestToken.trim() : '';
  if (!apiKey || (!apiSecret && !requestToken)) {
    throw new Error('Groww API key and API secret or request token are required.');
  }
  const flow = requestToken ? 'totp' : 'approval';
  const payload: Record<string, string> = { api_key: apiKey };
  if (apiSecret) payload.api_secret = apiSecret;
  if (requestToken) payload.request_token = requestToken;
  let response: Response;
  try {
    response = await fetch('https://api.groww.in/v1/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'GrowwConnectDesk/1.0' },
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
  if (!data || typeof data !== 'object' || !('access_token' in data) ||
      typeof data.access_token !== 'string' || !data.access_token.trim()) {
    throw new Error('Groww did not return an access token. No session was created.');
  }
  const session = writeSession(data.access_token, flow);
  return { authenticated: true, expires_at: session.expiresAt, flow: session.flow };
}

export function getProfile(sample: boolean = false): Profile {
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

  const session = readSession();
  return {
    user_name: session ? 'Groww Desk User' : null,
    user_id: session ? 'GROWW_' + session.accessToken.slice(0, 6).toUpperCase() : null,
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
