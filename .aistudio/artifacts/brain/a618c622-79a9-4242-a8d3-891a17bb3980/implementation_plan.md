# Portfolio Rebalance Tool & Multi-Factor Core Value Scoring

Implementation of a specialized **Rebalance** tool within the **Portfolio** tab. It calculates portfolio drift against target allocations for the active market, provides preset and slider-based target modeling, generates automated buy/sell batch orders with one-click execution, and continuously scores portfolio health with scheduled Friday close and Monday open revision audits and manual refresh capabilities.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed via interactive user clarification:
> - **Target Allocation Strategy**: Presets (**Equal Weight**, **Market Cap**, and **Momentum / Alpha Tilt**) paired with interactive fine-tuning sliders that auto-normalize to 100%.
> - **Portfolio Scoring Formula**: Comprehensive multi-factor score (0–100) combining **Allocation Drift Error** (40%), **Technical Signal Alignment** (35%), and **Diversification Concentration Index (HHI)** (25%).
> - **Trade Execution Flow**: Interactive Rebalance Review Table with one-click **"Execute All Rebalance Orders"** batch order placement that directly updates portfolio holdings and cash balances.
> - **Audit & Revision Cadence**: Tested time-to-time with automated tracking for **Friday Close** and **Monday Open** revisions, accompanied by a **Manual Refresh & Audit** button and an on-demand audit trigger with historical score snapshots.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Provides institutional-grade asset allocation management directly inside the Portfolio tab.
  - Automatically isolates holdings for the active market (`Nifty 100`, `Crypto Majors`, `NASDAQ-100`, or `Liquid ETFs`) and compares their live weights against target model allocations.
  - Generates recommended trade orders (Buy/Sell share quantities and total currency value) required to restore target equilibrium.
  - Evaluates portfolio core values via a 0–100 Multi-Factor Alignment Score, tracking allocation variance, cross-signal momentum, and asset concentration.
  - Implements scheduled audit milestones ("Friday Close Pre-Weekend Audit" and "Monday Open Market Reassessment") and stores a snapshot log of scoring revisions.
- **Target Audience**: Quant traders and portfolio managers looking to maintain disciplined asset allocations, prevent unhedged drift, and test risk profiles across weekend closes and opening gaps.
- **Key Value**: Eliminates manual rebalancing math, provides one-click batch order execution, and gives algorithmic certainty on whether the active portfolio conforms to strategic target weights.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Navigate to Portfolio > Rebalance Sub-Tab**:
   - The user opens the Portfolio tab and clicks the new **"Rebalance Portfolio"** sub-tab alongside "Stock Holdings" and "Opportunity Mix".
2. **Review Allocation Drift & Target Modeling**:
   - The user selects a target model preset (**Equal Weight**, **Market Cap Weighted**, **Momentum / Trend Tilt**) or uses sliders to adjust individual asset percentages.
   - A dual-layer segmented allocation bar visually compares **Current Allocation vs. Target Allocation**.
3. **Inspect Suggested Rebalance Trades**:
   - The interactive Rebalance Review Table displays for each asset: current shares, current price, current weight, target weight, drift variance, recommended action (`BUY +N` / `SELL -N` / `BALANCED`), and trade order value.
   - Summary telemetry cards display total capital required or liquidity generated, number of buy orders, and number of sell orders.
4. **One-Click Batch Execution**:
   - Clicking **"Execute All Rebalance Orders"** commits the batch trades into the portfolio, instantly updating share quantities and the cash reserve.
5. **Score Evaluation & Audit Schedule Testing**:
   - Immediately post-rebalance, the **Portfolio Core Value Score** updates (e.g. from 68/100 to 98/100).
   - The score card highlights:
     - Allocation Drift Error Score
     - Technical Signal Alignment Score (matching BUY/SELL cross signals)
     - Diversification Index (HHI)
   - Scheduled audit indicators show Friday Close and Monday Open audit readiness, with simulation buttons to test the portfolio against close/open market scenarios and a manual "Refresh & Audit Score" button.
   - An Audit History Snapshot log records historical scores, timestamps, and triggers.

### Visual Identity & Theme
- **Theme**: Dark institutional trading desk aesthetic adhering to the desk's design system (`#090D14` background, `#121824` surface, `#1E293B` borders).
- **Typography**: Clean display sans (`Outfit`) for headings and metrics; strict monospace tabular numerals (`IBM Plex Mono`, `font-mono`) for all prices, shares, weights, and drift percentages.
- **Color Coding**:
  - `Buy / Over-performance`: Emerald green (`#10B981`)
  - `Sell / Under-performance`: Crimson red (`#EF4444`)
  - `Balanced / Nominal`: Neutral slate (`#64748B`)
  - `Target / Accent`: Violet / Primary desk accent

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Portfolio State Execution vs. Dry-Run Staging**:
  - *Chosen Approach*: Provide a live preview of the proposed trades with order values and net cash delta, followed by a primary "Execute All Rebalance Orders" action that updates live portfolio state.
  - *Why*: Gives users full transparency prior to execution while fulfilling the requirement for automated trade execution.
- **Decision 2: Market Scoping (Active Market vs Global Desk)**:
  - *Chosen Approach*: Default the rebalance tool to the desk's currently active market (e.g., Nifty 100, Crypto, or NASDAQ) while allowing a dropdown toggle to switch to any market or full multi-market universe.
  - *Why*: Aligns with the core desk principle that trading APIs and data streams are separated by market.
- **Decision 3: Friday Close & Monday Open Audit Cadence**:
  - *Chosen Approach*: Display real-time countdown / status for the next Friday Close (15:30 IST for NSE, 16:00 ET for NASDAQ) and Monday Open, coupled with on-demand "Run Friday Close Audit" and "Run Monday Open Audit" triggers and manual refresh.
  - *Why*: Enables instant verification and interactive testing at any time, even outside active market hours.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PortfolioView Component                         │
│  ┌────────────────────┬────────────────────┬────────────────────────┐  │
│  │ Stock Holdings Tab │  Opportunity Mix   │ Rebalance Portfolio    │  │
│  └────────────────────┴────────────────────┴───────────┬────────────┘  │
└────────────────────────────────────────────────────────┼───────────────┘
                                                         │
                                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      PortfolioRebalancePanel                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Target Model Bar & Sliders: Equal Wt | Market Cap | Momentum     │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Allocation Comparison: Current vs Target Weights & Drift Meter   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Rebalance Trades Table: BUY/SELL Orders + "Execute All" Button   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Portfolio Core Value Score: Drift (40%) + Signal (35%) + HHI     │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Friday Close & Monday Open Audit Status + Manual Refresh         │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Audit History Snapshot Log (Timestamps, Scores, Events)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                       │
│          Live Quotes & Signals │ Updates Holdings & Cash               │
│                                ▼                                       │
│  ┌─────────────────────────────┴─────────────────────────────────────┐  │
│  │  QuotesContext / DataAdapter  │  PortfolioContext State Store     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Components & State Modules:
1. `src/types/rebalance.ts`:
   - Data structures for `RebalanceTarget`, `RebalanceTradeOrder`, `PortfolioScoreBreakdown`, `RebalanceAuditSnapshot`, and `RebalanceModelPreset`.
2. `src/lib/rebalance-engine.ts`:
   - Pure functional calculations for:
     - `computeModelTargets(holdings, market, preset, customWeights)`
     - `computeRebalanceTrades(holdings, targets, totalValue, quotesMap)`
     - `calculatePortfolioScore(holdings, targets, quotesMap, market)` (multi-factor: drift error, SMA signal alignment, HHI concentration)
     - `runAuditRevision(type, currentScore, holdings, targets)`
3. `src/components/portfolio-rebalance-panel.tsx`:
   - Comprehensive UI component rendered inside the Rebalance sub-tab of `PortfolioView`.
4. `src/components/portfolio-view.tsx`:
   - Updated with the new `'rebalance'` sub-tab button, badge indicator, and panel mount.
