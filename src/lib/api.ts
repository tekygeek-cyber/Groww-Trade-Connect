import type { MarketType, Profile, ScanJob, ScanMeta, ScanParams, SessionStatus, SignalRow, SimResult } from '../types/market';
import { MARKETS } from '../data/universes';

export type { Profile, ScanJob, ScanMeta, ScanParams, SessionStatus, SignalRow, SimResult };

function apiUrl(path: string): string {
  return path;
}

export function apiCandidates(path: string): string[] {
  return [path];
}

function errorDetail(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) return String(item.msg);
          return String(item);
        })
        .join(' ');
    }
  }
  return `Request failed (${status}).`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('The desk service is not reachable yet. Wait a moment and try again.');
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) throw new Error(errorDetail(data, response.status));
  return data as T;
}

export function inr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function usd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPrice(value: number | null | undefined, market: MarketType = 'nifty', currency?: string): string {
  if (value == null || !Number.isFinite(value)) return '—';

  const isINR = currency === 'INR' || (market === 'nifty' && currency !== 'USD');
  const isCrypto = market === 'crypto' || currency === 'USDT';

  if (isINR) {
    return `₹${inr(value)}`;
  }
  if (isCrypto) {
    const decimals = value < 1 ? 4 : value < 10 ? 3 : 2;
    return `₮${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
  return `$${usd(value)}`;
}

export function pct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}

export function signed(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function prettyDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return iso;
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function expiryLabel(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  const clock = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(when);
  return `${clock} IST`;
}
