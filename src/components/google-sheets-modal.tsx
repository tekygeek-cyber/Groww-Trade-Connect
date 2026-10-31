import { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  LogOut,
  Upload,
  Download,
  FolderOpen,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import {
  googleSignIn,
  googleSignOut,
  initAuth,
  hasAccessToken,
  createPortfolioSpreadsheet,
  exportPortfolioDataToSheet,
  listUserSpreadsheets,
  importHoldingsFromGoogleSheet,
  type SheetFile,
} from '../lib/google-sheets';
import type { User } from 'firebase/auth';
import { usePortfolio } from '../lib/portfolio-context';
import { useMarketQuotes } from '../lib/quotes-context';
import type { PortfolioHolding } from '../types/portfolio';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: 'INR' | 'USD';
}

export function GoogleSheetsModal({ isOpen, onClose, currency }: GoogleSheetsModalProps) {
  const { holdings, mixPlan, summary, importHoldings } = usePortfolio();
  const { quotes } = useMarketQuotes();

  const [user, setUser] = useState<User | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab: 'export' or 'import'
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Export state
  const [exportMode, setExportMode] = useState<'new' | 'existing'>('new');
  const [customTitle, setCustomTitle] = useState(
    `Groww Desk - Portfolio & Opportunity Mix (${new Date().toLocaleDateString('en-GB')})`
  );
  const [existingSheets, setExistingSheets] = useState<SheetFile[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [loadingSheets, setLoadingSheets] = useState(false);

  // Mandatory confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'export-new' | 'export-overwrite' | 'import-replace';
    targetName: string;
    details: string;
  } | null>(null);

  // Export success state
  const [exportSuccess, setExportSuccess] = useState<{ id: string; url: string } | null>(null);

  // Import state
  const [importSheetId, setImportSheetId] = useState<string>('');
  const [importPreview, setImportPreview] = useState<PortfolioHolding[] | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Listen to auth changes
    const unsub = initAuth(
      (u) => {
        setUser(u);
        setAuthed(hasAccessToken());
        if (hasAccessToken()) {
          loadSpreadsheets();
        }
      },
      () => {
        setUser(null);
        setAuthed(false);
      }
    );

    setAuthed(hasAccessToken());
    if (hasAccessToken()) {
      loadSpreadsheets();
    }

    return () => unsub();
  }, [isOpen]);

  async function loadSpreadsheets() {
    setLoadingSheets(true);
    try {
      const files = await listUserSpreadsheets();
      setExistingSheets(files);
      if (files.length > 0 && !selectedSheetId) {
        setSelectedSheetId(files[0].id);
      }
    } catch (err: any) {
      console.warn('Could not load spreadsheets:', err);
    } finally {
      setLoadingSheets(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAuthed(true);
        loadSpreadsheets();
      }
    } catch (err: any) {
      setError(err?.message || 'Google sign-in was cancelled or encountered an error.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogout() {
    await googleSignOut();
    setUser(null);
    setAuthed(false);
    setExistingSheets([]);
    setExportSuccess(null);
    setImportPreview(null);
  }

  // Pre-trigger confirmation before export
  function initiateExport() {
    setError(null);
    if (exportMode === 'new') {
      setConfirmDialog({
        type: 'export-new',
        targetName: customTitle,
        details: `Create a new Google Spreadsheet with 3 tabs: 'Holdings' (${holdings.length} positions), 'Opportunity Mix' (${mixPlan.opportunities.length} quant setups), and 'Desk Summary' (capital & risk metrics).`,
      });
    } else {
      const sheet = existingSheets.find((s) => s.id === selectedSheetId);
      const name = sheet ? sheet.name : selectedSheetId;
      setConfirmDialog({
        type: 'export-overwrite',
        targetName: name,
        details: `WARNING: This will update and overwrite the 'Holdings', 'Opportunity Mix', and 'Desk Summary' sheets in '${name}' with current desk data (${holdings.length} holdings, ${mixPlan.opportunities.length} opportunities).`,
      });
    }
  }

  // Execute export once user explicitly confirms in dialog
  async function executeConfirmedExport() {
    if (!confirmDialog) return;
    setConfirmDialog(null);
    setLoading(true);
    setError(null);
    setExportSuccess(null);

    try {
      let sheetId = selectedSheetId;
      let sheetUrl = '';

      if (confirmDialog.type === 'export-new') {
        const created = await createPortfolioSpreadsheet(customTitle);
        sheetId = created.id;
        sheetUrl = created.url;
      } else {
        const existing = existingSheets.find((s) => s.id === sheetId);
        sheetUrl = existing?.webViewLink || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
      }

      // Quotes mapping
      const qMap: Record<string, { price: number; changePct: number }> = {};
      for (const [k, v] of Object.entries(quotes)) {
        qMap[k] = { price: v.price, changePct: v.changePct };
      }

      await exportPortfolioDataToSheet({
        spreadsheetId: sheetId,
        holdings,
        opportunities: mixPlan.opportunities,
        summary,
        quotes: qMap,
        currency,
      });

      setExportSuccess({ id: sheetId, url: sheetUrl });
      loadSpreadsheets();
    } catch (err: any) {
      setError(err?.message || 'Failed to export data to Google Sheets.');
    } finally {
      setLoading(false);
    }
  }

  // Load preview of holdings from Google Sheets before importing
  async function handlePreviewImport() {
    if (!importSheetId.trim()) return;
    setLoading(true);
    setError(null);
    setImportSuccessMsg(null);
    try {
      const preview = await importHoldingsFromGoogleSheet(importSheetId.trim());
      setImportPreview(preview);
    } catch (err: any) {
      setError(err?.message || 'Failed to read holdings from spreadsheet. Ensure it has a "Holdings" sheet tab.');
    } finally {
      setLoading(false);
    }
  }

  function initiateImportConfirmation() {
    if (!importPreview || importPreview.length === 0) return;
    setConfirmDialog({
      type: 'import-replace',
      targetName: 'Local Desk Portfolio',
      details: `Replace current desk holdings with ${importPreview.length} imported positions from Google Sheets? This will update your active portfolio allocation and live tracking.`,
    });
  }

  function executeConfirmedImport() {
    if (!importPreview) return;
    importHoldings(importPreview);
    setConfirmDialog(null);
    setImportSuccessMsg(`Successfully imported ${importPreview.length} positions into your active portfolio!`);
    setImportPreview(null);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-fg">Google Sheets Portfolio Integration</h2>
              <p className="text-xs text-muted">Sync live desk holdings, P&L, and Opportunity Mix to your Google Drive</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-xs text-muted hover:text-fg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Auth / Account Bar */}
        <div className="mt-4 rounded-lg border border-border bg-bg p-3.5 flex flex-wrap items-center justify-between gap-3">
          {authed && user ? (
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'Google User'} className="size-8 rounded-full border border-border" />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-xs">
                <p className="font-semibold text-fg">{user.displayName || 'Connected Google Account'}</p>
                <p className="text-muted text-[11px] truncate max-w-56">{user.email}</p>
              </div>
            </div>
          ) : (
            <div className="text-xs">
              <p className="font-medium text-fg">Sign in with Google to enable Sheets sync</p>
              <p className="text-muted text-[11px]">Permission requested: Read and write Google Sheets spreadsheets</p>
            </div>
          )}

          <div>
            {authed && user ? (
              <button
                type="button"
                onClick={handleGoogleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-fg hover:bg-surface-2 transition-colors"
              >
                <LogOut className="size-3" />
                Disconnect
              </button>
            ) : (
              /* Compliant Google Sign-In Material Button */
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      xmlnsXlink="http://www.w3.org/1999/xlink"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      ></path>
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      ></path>
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      ></path>
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      ></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {loading ? 'Signing in…' : 'Sign in with Google'}
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3.5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Tab Toggle: Export vs Import */}
        <div className="mt-5 border-b border-border flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={
              'pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ' +
              (activeTab === 'export' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')
            }
          >
            <Download className="size-3.5" />
            Export to Google Sheets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={
              'pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ' +
              (activeTab === 'import' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')
            }
          >
            <Upload className="size-3.5" />
            Import from Google Sheets
          </button>
        </div>

        {/* TAB 1: EXPORT */}
        {activeTab === 'export' && (
          <div className="mt-4 space-y-4">
            {/* Mode selection: New vs Existing */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setExportMode('new')}
                className={
                  'rounded-lg border p-3 text-left transition-colors ' +
                  (exportMode === 'new'
                    ? 'border-primary bg-primary/10 text-fg'
                    : 'border-border bg-bg text-muted hover:text-fg')
                }
              >
                <div className="flex items-center gap-1.5 font-semibold text-fg">
                  <Plus className="size-3.5 text-primary" />
                  Create New Spreadsheet
                </div>
                <p className="mt-1 text-[11px] text-muted">Generate a clean spreadsheet with formatted tabs</p>
              </button>

              <button
                type="button"
                onClick={() => setExportMode('existing')}
                disabled={!authed || existingSheets.length === 0}
                className={
                  'rounded-lg border p-3 text-left transition-colors ' +
                  (exportMode === 'existing'
                    ? 'border-primary bg-primary/10 text-fg'
                    : 'border-border bg-bg text-muted hover:text-fg') +
                  (!authed || existingSheets.length === 0 ? ' opacity-50 cursor-not-allowed' : '')
                }
              >
                <div className="flex items-center gap-1.5 font-semibold text-fg">
                  <FolderOpen className="size-3.5 text-primary" />
                  Update Existing Sheet
                </div>
                <p className="mt-1 text-[11px] text-muted">Sync into an existing spreadsheet from your Drive</p>
              </button>
            </div>

            {/* Config inputs */}
            {exportMode === 'new' ? (
              <div>
                <label className="block text-xs font-medium text-muted uppercase">Spreadsheet Title</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
                  placeholder="Groww Desk - Portfolio & Opportunity Mix"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-muted uppercase">Select Spreadsheet</label>
                  <button
                    type="button"
                    onClick={loadSpreadsheets}
                    disabled={loadingSheets}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className={'size-2.5 ' + (loadingSheets ? 'animate-spin' : '')} />
                    Refresh
                  </button>
                </div>
                <select
                  value={selectedSheetId}
                  onChange={(e) => setSelectedSheetId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
                >
                  {existingSheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Data Payload Overview */}
            <div className="rounded-lg border border-border bg-bg p-3.5 text-xs space-y-2">
              <p className="font-semibold text-fg text-[11px] uppercase tracking-wider">Sheets to be Generated:</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-border/60 bg-surface p-2">
                  <p className="text-muted text-[10px]">Tab 1</p>
                  <p className="font-semibold text-fg">Holdings</p>
                  <p className="num text-primary text-[11px]">{holdings.length} Positions</p>
                </div>
                <div className="rounded border border-border/60 bg-surface p-2">
                  <p className="text-muted text-[10px]">Tab 2</p>
                  <p className="font-semibold text-fg">Opportunity Mix</p>
                  <p className="num text-primary text-[11px]">{mixPlan.opportunities.length} Setups</p>
                </div>
                <div className="rounded border border-border/60 bg-surface p-2">
                  <p className="text-muted text-[10px]">Tab 3</p>
                  <p className="font-semibold text-fg">Desk Summary</p>
                  <p className="num text-primary text-[11px]">Valuation & Sharpe</p>
                </div>
              </div>
            </div>

            {/* Success Banner */}
            {exportSuccess && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3.5 flex items-center justify-between text-xs text-emerald-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Portfolio successfully synchronized to Google Sheets!</span>
                </div>
                <a
                  href={exportSuccess.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                >
                  Open in Sheets
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}

            {/* Action Button */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border bg-bg px-3.5 py-2 text-xs font-medium text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={initiateExport}
                disabled={!authed || loading || (exportMode === 'existing' && !selectedSheetId)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    Syncing Data…
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="size-3.5" />
                    Proceed to Sync
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: IMPORT */}
        {activeTab === 'import' && (
          <div className="mt-4 space-y-4 text-xs">
            <div>
              <label className="block text-xs font-medium text-muted uppercase">Select or Enter Spreadsheet</label>
              {existingSheets.length > 0 ? (
                <select
                  value={importSheetId}
                  onChange={(e) => setImportSheetId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
                >
                  <option value="">-- Choose a spreadsheet from Drive --</option>
                  {existingSheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={importSheetId}
                  onChange={(e) => setImportSheetId(e.target.value)}
                  placeholder="Paste Google Spreadsheet ID or URL"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-fg outline-none focus:border-primary"
                />
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handlePreviewImport}
                disabled={!authed || !importSheetId || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {loading ? <RefreshCw className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
                Preview Holdings
              </button>
            </div>

            {/* Import Preview Table */}
            {importPreview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-fg">Parsed Positions ({importPreview.length}):</span>
                  <span className="text-[11px] text-muted">Verify before importing into desk</span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-bg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-muted border-b border-border">
                      <tr>
                        <th className="p-2">Ticker</th>
                        <th className="p-2">Market</th>
                        <th className="p-2 text-right">Shares</th>
                        <th className="p-2 text-right">Avg Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importPreview.map((p) => (
                        <tr key={p.id}>
                          <td className="p-2 font-mono font-semibold text-fg">{p.ticker}</td>
                          <td className="p-2 uppercase text-[10px] text-muted">{p.market}</td>
                          <td className="p-2 text-right num">{p.shares}</td>
                          <td className="p-2 text-right num">{p.averageBuyPrice}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setImportPreview(null)}
                    className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-muted hover:text-fg"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={initiateImportConfirmation}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 transition-opacity"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Confirm Import
                  </button>
                </div>
              </div>
            )}

            {importSuccessMsg && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                {importSuccessMsg}
              </div>
            )}
          </div>
        )}

        {/* MANDATORY USER CONFIRMATION MODAL FOR WORKSPACE MUTATIONS */}
        {confirmDialog && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-md rounded-xl border border-amber-500/30 bg-surface p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ShieldAlert className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-fg">Confirm Google Sheets Operation</h3>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    Target:{' '}
                    <span className="font-semibold text-fg">
                      {confirmDialog.targetName}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-fg leading-relaxed bg-bg p-3 rounded-lg border border-border">
                    {confirmDialog.details}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4 text-xs">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="rounded-lg border border-border bg-bg px-3.5 py-2 font-medium text-muted hover:text-fg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDialog.type === 'import-replace') {
                      executeConfirmedImport();
                    } else {
                      executeConfirmedExport();
                    }
                  }}
                  className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-fg hover:opacity-90 transition-opacity"
                >
                  Confirm & Proceed
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
