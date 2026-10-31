import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { PortfolioHolding, MarketOpportunity, PortfolioSummary } from '../types/portfolio';
import { MARKETS } from '../data/universes';
import type { MarketType } from '../types/market';
import { convertToINR, convertToUSD } from './portfolio-engine';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

// Initialize Firebase App safely (singleton)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to track sign-in in progress
let isSigningIn = false;
// STRICT REQUIREMENT: In-memory caching for OAuth access token only. NEVER store in localStorage/sessionStorage.
let cachedAccessToken: string | null = null;
let currentUser: User | null = null;

export interface SheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

/**
 * Initialize auth listener. In-memory access token is cleared upon sign-out.
 */
export function initAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentUser = user;
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token must be retrieved via user sign-in flow
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

/**
 * Sign in with Google Popup and cache access token in-memory.
 */
export async function googleSignIn(): Promise<{ user: User; accessToken: string } | null> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google OAuth access token from Firebase credential');
    }

    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

/**
 * Sign out and clear in-memory token.
 */
export async function googleSignOut(): Promise<void> {
  await signOut(auth);
  cachedAccessToken = null;
  currentUser = null;
}

export async function getAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export function getCurrentUser(): User | null {
  return currentUser || auth.currentUser;
}

export function hasAccessToken(): boolean {
  return !!cachedAccessToken;
}

/**
 * Fetch list of recent Google Sheets created or modified by user via Google Drive API
 */
export async function listUserSpreadsheets(): Promise<SheetFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,modifiedTime,webViewLink)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to list spreadsheets: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Create a new structured Google Spreadsheet with 3 tabs:
 * 1. Holdings
 * 2. Opportunity Mix
 * 3. Desk Summary
 */
export async function createPortfolioSpreadsheet(title: string): Promise<{ id: string; url: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const payload = {
    properties: {
      title: title || `Groww Desk - Portfolio & Opportunity Mix (${new Date().toLocaleDateString('en-GB')})`,
    },
    sheets: [
      { properties: { title: 'Holdings', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Opportunity Mix', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Desk Summary', gridProperties: { frozenRowCount: 1 } } },
    ],
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create spreadsheet: ${res.status} ${err}`);
  }

  const result = await res.json();
  return {
    id: result.spreadsheetId,
    url: result.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`,
  };
}

/**
 * Write values to a specific sheet range using values.update (USER_ENTERED)
 */
export async function writeSheetValues(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update sheet range ${range}: ${res.status} ${err}`);
  }
}

/**
 * Read values from a specific sheet range
 */
export async function readSheetValues(spreadsheetId: string, range: string): Promise<any[][]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to read sheet values: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.values || [];
}

/**
 * Full export of Portfolio Holdings, Opportunity Mix, and Desk Summary into Google Sheets
 */
export async function exportPortfolioDataToSheet({
  spreadsheetId,
  holdings,
  opportunities,
  summary,
  quotes,
  currency = 'INR',
}: {
  spreadsheetId: string;
  holdings: PortfolioHolding[];
  opportunities: MarketOpportunity[];
  summary: PortfolioSummary;
  quotes: Record<string, { price: number; changePct: number }>;
  currency?: 'INR' | 'USD';
}): Promise<void> {
  const now = new Date().toLocaleString();

  // 1. Prepare Holdings Data
  const holdingsHeader = [
    'Symbol',
    'Name',
    'Market Universe',
    'Shares / Units',
    'Avg Buy Price (Native)',
    'Live Price (Native)',
    'Invested (Native)',
    'Market Value (Native)',
    'Valuation (INR ₹)',
    'Valuation (USD $)',
    'Unrealized P&L (Native)',
    'Return %',
    'Portfolio Weight %',
    'Purchase Date',
    'Thesis / Notes',
    'Last Synced',
  ];

  const holdingsRows = holdings.map((h) => {
    const q = quotes[h.ticker];
    const livePrice = q?.price ?? h.averageBuyPrice;
    const invested = h.shares * h.averageBuyPrice;
    const value = h.shares * livePrice;
    const pnl = value - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const inrValue = convertToINR(value, h.market);
    const usdValue = convertToUSD(value, h.market);
    const weight = summary.totalDeskValue > 0 ? (inrValue / summary.totalDeskValue) * 100 : 0;
    const mkt = MARKETS[h.market]?.label || h.market;

    return [
      h.ticker,
      h.name,
      mkt,
      h.shares,
      Number(h.averageBuyPrice.toFixed(4)),
      Number(livePrice.toFixed(4)),
      Number(invested.toFixed(2)),
      Number(value.toFixed(2)),
      Number(inrValue.toFixed(2)),
      Number(usdValue.toFixed(2)),
      Number(pnl.toFixed(2)),
      `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
      `${weight.toFixed(2)}%`,
      h.buyDate || '',
      h.notes || '',
      now,
    ];
  });

  // 2. Prepare Opportunity Mix Data
  const oppsHeader = [
    'Ticker',
    'Asset Name',
    'Market Universe',
    'Opportunity Signal',
    'Entry Price',
    'Target Price',
    'Stop Loss',
    'Expected Stat Edge %',
    'Desk Confidence %',
    'Target Weight %',
    'Timeframe',
    'Quant Catalyst & Rationale',
    'Evaluation Date',
  ];

  const oppsRows = opportunities.map((opp) => {
    const mkt = MARKETS[opp.market]?.label || opp.market;
    return [
      opp.ticker,
      opp.name,
      mkt,
      opp.opportunityType,
      opp.entryPrice,
      opp.targetPrice,
      opp.stopLoss,
      `+${opp.expectedEdgePct}%`,
      `${opp.confidenceScore}%`,
      `${opp.recommendedWeightPct}%`,
      opp.timeframe,
      opp.catalystReason,
      now,
    ];
  });

  // 3. Prepare Desk Summary Data
  const summaryRows = [
    ['Metric', 'Value (INR ₹)', 'Value (USD $)', 'Notes / Status'],
    ['Total Desk Valuation', summary.totalDeskValue, convertToUSD(summary.totalDeskValue, 'nifty'), 'Combined active capital deployed + reserves'],
    ['Total Invested Capital', summary.totalInvested, convertToUSD(summary.totalInvested, 'nifty'), 'Cost basis of all open positions'],
    ['Total Unrealized Return', summary.unrealizedPnL, convertToUSD(summary.unrealizedPnL, 'nifty'), `${summary.unrealizedPnLPct.toFixed(2)}% overall return`],
    ['Day P&L (Live Session)', summary.dayPnL, convertToUSD(summary.dayPnL, 'nifty'), `${summary.dayPnLPct.toFixed(2)}% session change`],
    ['Cash Reserve Buffer', summary.cashReserve, convertToUSD(summary.cashReserve, 'nifty'), 'Liquid capital ready for tactical allocation'],
    ['Nifty 100 Allocation Weight', `${summary.byMarket.nifty.weight}%`, `${summary.byMarket.nifty.weight}%`, `${summary.byMarket.nifty.count} assets`],
    ['NASDAQ Allocation Weight', `${summary.byMarket.nasdaq.weight}%`, `${summary.byMarket.nasdaq.weight}%`, `${summary.byMarket.nasdaq.count} assets`],
    ['Crypto Allocation Weight', `${summary.byMarket.crypto.weight}%`, `${summary.byMarket.crypto.weight}%`, `${summary.byMarket.crypto.count} assets`],
    ['Liquid ETFs Allocation Weight', `${summary.byMarket.etfs.weight}%`, `${summary.byMarket.etfs.weight}%`, `${summary.byMarket.etfs.count} assets`],
    ['Desk Export Timestamp', now, now, 'Generated via Groww Connect Quantitative Desk'],
  ];

  // Write Holdings
  await writeSheetValues(spreadsheetId, 'Holdings!A1:P' + (holdingsRows.length + 1), [
    holdingsHeader,
    ...holdingsRows,
  ]);

  // Write Opportunity Mix
  await writeSheetValues(spreadsheetId, 'Opportunity Mix!A1:M' + (oppsRows.length + 1), [
    oppsHeader,
    ...oppsRows,
  ]);

  // Write Desk Summary
  await writeSheetValues(spreadsheetId, 'Desk Summary!A1:D' + summaryRows.length, summaryRows);
}

/**
 * Import holdings from an existing Google Sheet.
 * Reads the first tab or 'Holdings' tab, parses tickers, shares, buy prices.
 */
export async function importHoldingsFromGoogleSheet(spreadsheetId: string): Promise<PortfolioHolding[]> {
  const values = await readSheetValues(spreadsheetId, 'Holdings!A1:O100');
  if (!values || values.length < 2) {
    throw new Error('Spreadsheet does not contain data or is missing the Holdings tab with header rows.');
  }

  const [header, ...rows] = values;
  const colIndex = {
    symbol: header.findIndex((h: string) => /symbol|ticker/i.test(h)),
    name: header.findIndex((h: string) => /name/i.test(h)),
    market: header.findIndex((h: string) => /market/i.test(h)),
    shares: header.findIndex((h: string) => /shares|units|qty/i.test(h)),
    avgPrice: header.findIndex((h: string) => /avg|buy price|cost/i.test(h)),
    buyDate: header.findIndex((h: string) => /date/i.test(h)),
    notes: header.findIndex((h: string) => /notes|thesis/i.test(h)),
  };

  const imported: PortfolioHolding[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ticker = String(r[colIndex.symbol >= 0 ? colIndex.symbol : 0] || '').trim().toUpperCase();
    if (!ticker) continue;

    const name = String(r[colIndex.name >= 0 ? colIndex.name : 1] || ticker).trim();
    const rawMarket = String(r[colIndex.market >= 0 ? colIndex.market : 2] || '').toLowerCase();
    let market: MarketType = 'nifty';
    if (rawMarket.includes('nasdaq') || rawMarket.includes('us')) market = 'nasdaq';
    else if (rawMarket.includes('crypto')) market = 'crypto';
    else if (rawMarket.includes('etf')) market = 'etfs';

    const rawShares = parseFloat(String(r[colIndex.shares >= 0 ? colIndex.shares : 3]).replace(/,/g, ''));
    const shares = isNaN(rawShares) || rawShares <= 0 ? 10 : rawShares;

    const rawPrice = parseFloat(String(r[colIndex.avgPrice >= 0 ? colIndex.avgPrice : 4]).replace(/[₹$₮,]/g, ''));
    const averageBuyPrice = isNaN(rawPrice) || rawPrice <= 0 ? 100 : rawPrice;

    const buyDate = colIndex.buyDate >= 0 && r[colIndex.buyDate] ? String(r[colIndex.buyDate]) : new Date().toISOString().split('T')[0];
    const notes = colIndex.notes >= 0 && r[colIndex.notes] ? String(r[colIndex.notes]) : 'Imported from Google Sheets';

    imported.push({
      id: `imported-${ticker}-${Date.now()}-${i}`,
      ticker,
      name,
      market,
      shares,
      averageBuyPrice,
      buyDate,
      notes,
    });
  }

  return imported;
}
