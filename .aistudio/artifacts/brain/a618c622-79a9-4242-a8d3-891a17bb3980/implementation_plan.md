# Groww Connect: Multi-Market Trading Desk & Real-Time Alerts (Revised)

A dark, high-density professional trading desk extending the existing Groww Connect architecture with three new live universes (Crypto, NASDAQ, ETFs), real-time streaming quotes, throttled multi-condition alerts, and bit-for-bit algorithmic parity across all quant engines.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following refined architectural decisions govern the revised implementation plan:

- **1. Backend Architecture & Runtime Decision**:
  - **Chosen Approach**: **Unified Node/Express + TypeScript Full-Stack Server** (`server.ts` with Vite middlewares mounted in development on port 3000).
  - **Groww Session & Auth Invariants**: Ports the Groww proxy and session authentication directly into TypeScript (`server/groww-service.ts`). Supports both API Key + Secret and TOTP 6-digit flows via official Groww HTTP endpoints (`https://api.groww.in`). The minted token is saved exclusively on the server (`server/data/session.json` and in-memory cache) with 06:00 AM IST daily expiration and is **never returned to the browser**.
  - **Quant Parity**: Complete bit-for-bit TypeScript port of SMA crossover detection, 1,000-path Monte Carlo return resampler, the six published quantitative strategies, high-volume breakout scanner, and dummy GTT generator. Eliminates external Python runtime dependencies for 100% cloud build reliability.
- **2. Real-Time Streaming & Fallback Chain**:
  - **Crypto Majors**: Client-side multiplexed WebSocket to Binance spot streams (`wss://data-stream.binance.vision/stream`) with `miniTicker` subscription for all 25 majors.
  - **US Equities & ETFs**: Primary connection via Binance Equity public streams (`wss://nbstream.binance.com/equity/stream`) subscribing to `{SYMBOL}@quote`.
  - **Mandatory Fallback Hierarchy**:
    $$\text{Venue WebSocket Stream} \;\longrightarrow\; \text{Backend 15s REST Polling} \;\longrightarrow\; \text{Stooq / Yahoo Chart API} \;\longrightarrow\; \text{Local Synthetic Tick Tape}$$
  - **Explicit Status Stamp**: Every quote displays a strict status badge: `Live` (real-time stream active), `Delayed` (REST polling active), `Closed` (outside market session with last trade frozen), or `Sample` (offline synthetic animation).
- **3. Keyless Historical Candle Feeds**:
  - Stooq daily historical CSV + Yahoo Finance v8 chart API for daily equity/ETF bars; Binance 1-day klines for crypto.
  - 15-minute in-memory caching for daily bars, 1-minute caching for crypto, and 24-hour constituent list caching.
  - Fully normalized OHLCV format: `YYYY-MM-DD` (or ISO for crypto), numeric open, high, low, close, and volume, sorted oldest-first.
- **4. Alerts Engine Efficiency & Zero UI Lockup**:
  - Direct evaluation against the in-memory live quote store on incoming ticks (price crosses above/below, % move from previous close).
  - Heavy calculations (SMA crossover and Monte Carlo rating shifts) evaluate on a throttled 30–60s cadence or upon threshold price displacement—never recalculating 1,000 Monte Carlo paths per raw WebSocket tick.
  - Delivery: In-app desk alert drawer + synthesized Web Audio API bell chime + optional browser `Notification` API with user permission.
  - Strictly stored in browser `localStorage` (max 50 alerts). Fired once when triggered; re-arms only after condition clears or user resets.
- **5. Strict Zero-Order & Paper Trading Discipline**:
  - Dummy GTT remains strictly confined to Nifty 100 (`DUMMY-` IDs). Crypto, NASDAQ, and ETFs explicitly render `"Not available for crypto/US"` on order trigger slots.
  - The strategy paper ledger and automation cycle are extended across all markets for safe, simulated portfolio tracking without transmitting orders.
- **6. 100% Offline Sample Mode Resiliency**:
  - Embedded static snapshot tapes for Nifty 100, Crypto 25, Nasdaq-100, and liquid ETFs guarantee full functionality (scanning, Monte Carlo, 6 strategies, breakout, and alerts) with zero external network connectivity required.

---

## 1. Overview & Core Concept

Groww Connect is a high-density institutional trading desk designed for multi-market quantitative analysis. It merges real-time streaming market data, technical screening, statistical risk simulations, and automated strategy evaluation into a unified, dark-themed command center.

### Core Capabilities
- **Four Global Asset Universes**:
  1. **Nifty 100**: Official constituent snapshot, NSE tokens, INR (`₹`), IST session (`09:15–15:30 IST`), Groww feed / sample tape.
  2. **Crypto (25 Majors)**: Top liquid USDT pairs (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, DOT, etc.), USDT (`₮`), 24/7 continuous session.
  3. **NASDAQ-100**: Complete constituent snapshot, USD (`$`), regular US cash session (`09:30–16:00 ET`), Stooq/Yahoo candles + Binance equity streams.
  4. **Liquid ETFs**: Curated US & Indian funds (SPY, QQQ, IWM, DIA, VTI, EEM, GLD, TLT, NIFTYBEES, BANKBEES) tagged by asset class (`Equity`, `Bond`, `Commodity`, `Broad Market`).
- **Unified Navigation & Views**:
  - `User`: Account details, Groww authentication status, session duration, products/exchanges, DDPI indicator.
  - `Signals`: Short/Long SMA crossover scanner, freshness ranking, multi-selection Monte Carlo risk simulation (BUY / HOLD / SELL / WATCH).
  - `Strategies`: Single-symbol backtester and ranked universe board for 6 published models: Turtle Breakout, Golden Cross, Connors RSI-2, Bollinger Revert, MACD Cross, and 6-Month Momentum.
  - `Algo Signals`: High-volume breakout scanner (3× volume surge + pullback within 1% of breakout midpoint) with volume sparsity warnings.
  - `GTT Placement`: Dummy GTT generator with read-only state checks (Nifty 100 only).
  - `Alerts` (New): Real-time symbol monitoring engine with sound and desktop notifications.

---

## 2. User Experience & Visual Design

Adhering strictly to **SaaS & Dashboard Guidelines** (`references/3_saas_dashboard.md`) and the **Frontend Design Constitution**:

### Visual System & Palette
- **Canvas & Surfaces**:
  - Background: Deep slate neutral (`#0b0e14`)
  - Structural Panels & Card Containers: Subtle slate (`#121722`) with hairline border (`#1e2638`)
  - Header & Top Bar: Flat 3-zone layout with Wordmark, Market Selector, Exchange Clock, and Accent Switcher
- **Accent Themes**:
  - `blue`: `#3b82f6` (Sapphire focus)
  - `sea`: `#06b6d4` (Teal focus)
  - `brass`: `#f59e0b` (Amber focus)
- **Market State Indicators**:
  - Upward / Bullish: Emerald green (`#10b981`)
  - Downward / Bearish: Crimson red (`#ef4444`)
  - Volume Warning Badge: Soft amber badge (`text-amber-400 bg-amber-400/10 border-amber-400/20`) when 20-day average volume is below reliability thresholds.
- **Typographic Discipline**:
  - Display & Headings: `Outfit` / `Plus Jakarta Sans`
  - Tables, Metrics, Clocks, & Financials: Strictly `font-mono tabular-nums` (`IBM Plex Mono`) to eliminate numeric jitter.
  - Zero-Pill Rule: Clean inline metadata separated by quiet dots (`·`); segmented controls used only for interactive filters.

### Header Contract
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ GROWW CONNECT · [Market: NIFTY 100 ▾] · 14:22:05 IST · Tape: Live (Binance WS) · [Accent] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- Changing the market selector updates:
  - Active symbol universe
  - Display currency symbol (`₹`, `$`, `₮`)
  - Active exchange clock (`IST` for India, `ET` for US, `UTC` for Crypto)
  - Active data source indicator and quote feed
  - Preserved in browser `localStorage` (`groww_desk_market`)

---

## 3. Alerts Engine Architecture

```
                       ┌─────────────────────────┐
                       │  In-Memory Quote Store  │
                       │   (Updated via ticks)   │
                       └────────────┬────────────┘
                                    │ Live Price / Ticks
                                    ▼
                       ┌─────────────────────────┐
                       │   Fast Alert Evaluator  │
                       │  - Price Crosses Above  │
                       │  - Price Crosses Below  │
                       │  - % Move from Close    │
                       └────────────┬────────────┘
                                    │ (Every 30–60s Throttled)
                                    ▼
                       ┌─────────────────────────┐
                       │   Heavy Alert Evaluator │
                       │  - SMA Crossover Shift  │
                       │  - Monte Carlo Stance   │
                       └────────────┬────────────┘
                                    │ Condition Met (One-Shot)
                                    ▼
       ┌────────────────────────────┼───────────────────────────┐
       ▼                            ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│ In-App Feed   │           │ Web Audio     │           │ Browser       │
│ & Desk Drawer │           │ Synthesizer   │           │ Notification  │
│ (Max 50 Rows) │           │ (880Hz Chime) │           │ (Permitted)   │
└───────────────┘           └───────────────┘           └───────────────┘
```

- **Armed State**: An alert is created as `armed: true`. When its condition is triggered by live quotes, it transitions to `armed: false` and emits a `FiredAlert` record.
- **Re-Arming**: The alert does not spam repeated notifications; it can be re-armed manually by the user or automatically when the price retraces across the threshold boundary.
- **Web Audio Chime**: Uses browser native `AudioContext` with an exponential decay sine oscillator (two-tone chime: 659.25Hz `E5` $\to$ 880Hz `A5`), requiring no external MP3/audio assets.

---

## 4. Technical Architecture & Endpoints

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             Browser Client (React 19)                           │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────────┐  │
│  │ Desk Layout & Tabs   │  │ Market Data Provider │  │ Alerts Store & Audio  │  │
│  │ - User               │  │ - Binance WS (Crypto)│  │ - LocalStorage (50)   │  │
│  │ - Signals & Sim      │  │ - Binance WS (US/ETF)│  │ - Web Audio Chime     │  │
│  │ - 6 Strategies       │  │ - 15s REST Polling   │  │ - Desktop Notify API  │  │
│  │ - Algo Breakout      │  │ - Synthetic Ticks    │  │ - Condition Evaluator │  │
│  │ - GTT (Nifty Only)   │  │ - Visibility Handler │  │                       │  │
│  │ - Alerts Panel       │  │                      │  │                       │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────────────┘  │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ HTTP REST
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Unified Full-Stack Server (Express / tsx)                   │
│                                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐  │
│  │ Market Universe API     │  │ Candle & Quote Service  │  │ Quant Engine    │  │
│  │ /api/universe/:market   │  │ /api/candles/:mkt/:sym  │  │ - SMA Crossover │  │
│  │ - Nifty 100 Snapshot    │  │ /api/quotes/:market     │  │ - Monte Carlo   │  │
│  │ - Crypto 25 Majors      │  │ - Stooq Daily Parser    │  │ - 6 Strategies  │  │
│  │ - Nasdaq-100 Snapshot   │  │ - Yahoo Chart Fallback  │  │ - Breakout Math │  │
│  │ - Liquid ETFs Registry  │  │ - 15m/1m Memory Cache   │  │ - Dummy GTT     │  │
│  └─────────────────────────┘  └─────────────────────────┘  └─────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ Groww Proxy & Auth Gateway (/api/auth/*, /api/profile, /api/scan/*)       │  │
│  │ - In-memory / file session storage until 06:00 IST                        │  │
│  │ - Read-only Groww state checks; zero order transmission                   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Server API Routes
1. `GET /api/auth/status` & `POST /api/auth/login` & `POST /api/auth/logout`: Groww session gateway.
2. `GET /api/profile` & `GET /api/demo/profile`: User account metadata.
3. `GET /api/universe/:market`: Constituents with ticker, name, currency, sector, and asset tags.
4. `GET /api/candles/:market/:symbol`: Oldest-first normalized OHLCV history with data source header.
5. `GET /api/quotes/:market`: Current quote snapshot for fallback polling.
6. `POST /api/scan`: Initiates SMA scanning across any selected universe.
7. `POST /api/sim`: 1,000-path Monte Carlo risk simulation on selected tickers.
8. `GET /api/strategies/catalog` & `POST /api/strategies/backtest`: 6 quant strategies engine.
9. `GET /api/scanner-data`: High-volume breakout and retest scanner.
10. `POST /api/gtt/create` & `GET /api/gtt/list`: Dummy GTT simulation (Nifty 100 only).

---

## 5. Algorithmic Parity Verification Plan

| Metric / Engine | Validation Test & Expected Parity |
| :--- | :--- |
| **SMA Crossover** | Verified against original Python calculations: Short SMA 6, Long SMA 30, crossover detection dates, and freshness ranking match bit-for-bit on standard Nifty 100 tape. |
| **Monte Carlo Simulation** | Resampling of daily returns over 1,000 paths produces standard error distributions adhering to identical thresholds: BUY ($P_{\text{up}} \ge 0.58$, median $> 0$), SELL ($P_{\text{up}} \le 0.42$, median $< 0$), WATCH (cross $\le 4$ days old, edge small), HOLD otherwise. |
| **6 Strategies** | Exact indicator formulas: Turtle (20/10 day Donchian channels), Golden Cross (50/200 SMA), Connors RSI-2, Bollinger Revert (20-day 2$\sigma$), MACD Cross (12, 26, 9), and 6-Month Momentum (126-day return). |
| **High-Volume Breakout** | 20-candle volume baseline, $\ge 3\times$ surge volume, 20-candle high breakout, max 20 candles age, and $\le 1\%$ pullback tolerance to breakout candle midpoint. |
| **Build & Compilation** | Full production build (`npm run build`) succeeds cleanly without broken imports or references to gitignored folders. |
