import { useEffect, useState } from 'react';
import { api, formatPrice, pct, signed } from '../lib/api';
import { useMarketQuotes } from '../lib/quotes-context';
import type { Strategy, Study, BoardRow, AutoState } from '../types/market';
import { MARKETS, getConstituents } from '../data/universes';
import { Play, TrendingUp, BarChart2 } from 'lucide-react';
import { MarketSelector } from './market-selector';

const fieldClass =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function StrategiesPanel() {
  const { market, sample, getQuote } = useMarketQuotes();
  const [list, setList] = useState<Strategy[]>([]);
  const [strategy, setStrategy] = useState('turtle');
  const [ticker, setTicker] = useState('RELIANCE');
  const [study, setStudy] = useState<Study | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [board, setBoard] = useState<BoardRow[]>([]);
  const [ranking, setRanking] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [auto, setAuto] = useState<AutoState | null>(null);

  const constituents = getConstituents(market);
  const mktConfig = MARKETS[market];

  // Update default ticker when market switches
  useEffect(() => {
    if (constituents.length > 0) {
      setTicker(constituents[0].ticker);
    }
  }, [market]);

  useEffect(() => {
    let cancel = false;
    api<{ strategies: Strategy[] }>('/api/strategies')
      .then((payload) => {
        if (!cancel) setList(payload.strategies);
      })
      .catch(() => {
        if (!cancel) setError('Could not load strategy list.');
      });

    api<AutoState>(`/api/automation?sample=${sample ? 'true' : 'false'}`)
      .then((state) => {
        if (!cancel) setAuto(state);
      })
      .catch(() => {});

    return () => {
      cancel = true;
    };
  }, [sample]);

  async function runBacktest() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<Study>('/api/strategies/backtest', {
        method: 'POST',
        body: JSON.stringify({ strategy, ticker, sample, market }),
      });
      setStudy(result);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Backtest failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runBoardRank() {
    setRanking(true);
    setBoardError(null);
    try {
      const result = await api<{ board: BoardRow[] }>('/api/strategies/board', {
        method: 'POST',
        body: JSON.stringify({ strategy, market, sample }),
      });
      setBoard(result.board || []);
    } catch (err: any) {
      setBoardError(err instanceof Error ? err.message : 'Ranking board failed.');
    } finally {
      setRanking(false);
    }
  }

  const liveQ = getQuote(ticker);
  const currentPrice = liveQ?.price ?? study?.last_close;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Strategies & Quantitative Models</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Backtest six published systematic models on {mktConfig.label}. Results evaluate past performance on daily closes
            without transmitting real orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MarketSelector />
        </div>
      </div>

      {/* Strategy Selector & Controls */}
      <div className="mt-5 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-muted">Strategy Model</label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className={fieldClass + ' mt-1'}
          >
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-muted">Symbol ({mktConfig.label})</label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className={fieldClass + ' mt-1'}
          >
            {constituents.map((c) => (
              <option key={c.ticker} value={c.ticker}>
                {c.ticker} — {c.name.slice(0, 24)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBacktest()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            <Play className="size-4 fill-current" />
            {busy ? 'Testing…' : 'Run Backtest'}
          </button>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            disabled={ranking}
            onClick={() => void runBoardRank()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold text-fg hover:bg-line disabled:opacity-50"
          >
            <BarChart2 className="size-4" />
            {ranking ? 'Ranking…' : `Rank ${mktConfig.label} Board`}
          </button>
        </div>
      </div>

      {error ? (
        <p className="note-down mt-4 rounded-lg border bg-surface px-4 py-3 text-sm text-down" role="alert">
          {error}
        </p>
      ) : null}

      {/* Study Results View */}
      {study ? (
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-fg">{study.ticker}</span>
                <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted border border-border">
                  {list.find((s) => s.id === study.strategy)?.name}
                </span>
                <span
                  className={
                    'rounded px-2 py-0.5 text-xs font-semibold ' +
                    (study.stance === 'LONG' ? 'tone-up' : 'tone-hold')
                  }
                >
                  {study.stance}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Source: <strong className="text-fg">{study.source}</strong> · {study.bars} bars · Period: {study.from} to {study.to}
              </p>
            </div>

            <div className="text-right">
              <div className="text-xs text-muted">Live Last Price / Last Close</div>
              <div className="flex items-center justify-end gap-2 text-sm font-semibold text-fg">
                <span>{formatPrice(currentPrice, market)}</span>
                <span className="text-xs text-muted font-normal">
                  (Close: {formatPrice(study.last_close, market)})
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <span className="text-[11px] text-muted uppercase tracking-wider">Total Return</span>
              <p className={'num mt-1 text-lg font-bold ' + (study.total_return >= 0 ? 'text-up' : 'text-down')}>
                {pct(study.total_return)}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <span className="text-[11px] text-muted uppercase tracking-wider">Max Drawdown</span>
              <p className="num mt-1 text-lg font-bold text-down">{pct(study.max_drawdown)}</p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <span className="text-[11px] text-muted uppercase tracking-wider">Win Rate</span>
              <p className="num mt-1 text-lg font-bold text-fg">
                {study.win_rate != null ? pct(study.win_rate) : '—'}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <span className="text-[11px] text-muted uppercase tracking-wider">Completed Trades</span>
              <p className="num mt-1 text-lg font-bold text-fg">{study.trades}</p>
            </div>
          </div>

          {/* Recent Trades Table */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Recent Trades</h3>
            <div className="mt-2 overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-muted uppercase text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Entry Date</th>
                    <th className="py-2 px-3">Exit Date</th>
                    <th className="py-2 px-3 text-right">Return</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {study.recent_trades.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted">
                        No trade triggers generated over the lookback history.
                      </td>
                    </tr>
                  ) : (
                    study.recent_trades.map((t, idx) => (
                      <tr key={idx} className="hover:bg-surface-2">
                        <td className="num py-2 px-3 text-muted">{t.entry_date}</td>
                        <td className="num py-2 px-3 text-muted">{t.exit_date ?? 'Open Position'}</td>
                        <td className={'num py-2 px-3 text-right font-medium ' + (t.return >= 0 ? 'text-up' : 'text-down')}>
                          {pct(t.return)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {t.open ? (
                            <span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px]">Open</span>
                          ) : (
                            <span className="text-muted text-[10px]">Closed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* Universe Ranked Board View */}
      {board.length > 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg">
              {mktConfig.label} Ranked Board: {list.find((s) => s.id === strategy)?.name}
            </h2>
            <span className="num text-xs text-muted">{board.length} symbols ranked</span>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-muted uppercase text-[11px]">
                <tr>
                  <th className="py-2 px-3">Rank</th>
                  <th className="py-2 px-3">Symbol</th>
                  <th className="py-2 px-3">Company</th>
                  {market === 'etfs' ? <th className="py-2 px-3">Asset Tag</th> : null}
                  <th className="py-2 px-3">Stance</th>
                  <th className="py-2 px-3 text-right">Total Return</th>
                  <th className="py-2 px-3 text-right">Max Drawdown</th>
                  <th className="py-2 px-3 text-right">Trades</th>
                  <th className="py-2 px-3 text-right">Win Rate</th>
                  <th className="py-2 px-3 text-right">Last Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {board.map((row) => {
                  const livePrice = getQuote(row.ticker)?.price ?? row.last_close;
                  return (
                    <tr key={row.ticker} className="hover:bg-surface-2 transition-colors">
                      <td className="num py-2 px-3 text-muted">{row.rank}</td>
                      <td className="py-2 px-3 font-semibold text-fg">{row.ticker}</td>
                      <td className="py-2 px-3 text-muted truncate max-w-48" title={row.company}>
                        {row.company}
                      </td>
                      {market === 'etfs' ? (
                        <td className="py-2 px-3">
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted border border-border">
                            {row.asset_tag || 'ETF'}
                          </span>
                        </td>
                      ) : null}
                      <td className="py-2 px-3">
                        <span
                          className={
                            'rounded px-2 py-0.5 text-[11px] font-medium ' +
                            (row.stance === 'LONG' ? 'tone-up' : 'tone-hold')
                          }
                        >
                          {row.stance}
                        </span>
                      </td>
                      <td className={'num py-2 px-3 text-right font-medium ' + (row.total_return >= 0 ? 'text-up' : 'text-down')}>
                        {pct(row.total_return)}
                      </td>
                      <td className="num py-2 px-3 text-right text-down">{pct(row.max_drawdown)}</td>
                      <td className="num py-2 px-3 text-right text-muted">{row.trades}</td>
                      <td className="num py-2 px-3 text-right text-muted">
                        {row.win_rate != null ? pct(row.win_rate) : '—'}
                      </td>
                      <td className="num py-2 px-3 text-right font-medium text-fg">
                        {formatPrice(livePrice, market)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
