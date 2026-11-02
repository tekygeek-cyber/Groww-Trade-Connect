# Portfolio Rebalance & Multi-Factor Scoring
## Independent Logic Audit and Rewritten Implementation Plan

**Version:** 2.0 — audited design specification  
**Date:** 1 November 2026  
**Status:** **DESIGN VALIDATED IN REFERENCE TESTS; NOT CLEARED FOR LIVE EXECUTION**  
**Source reviewed:** `implementation_plan (2).md` (126 lines, 9,502 characters, 11,742 UTF-8 bytes).  
**Evidence boundary:** The supplied file is a product/architecture proposal. No application repository, broker adapter, execution logs, quote history, or model-usage telemetry was supplied. All numerical tests below exercise an independent reference implementation of the *proposed corrected rules*, **not production code**.

---

## 1. Executive disposition

**Decision: REVISE before implementation or live-trading enablement.** Preserve the original feature concept, three allocation presets, sliders, the **40% / 35% / 25%** factor weights, the Rebalance sub-tab, and Friday/Monday audit concept. Replace the underspecified scoring math and unsafe order-state assumptions with the deterministic, fail-closed implementation below.

The highest-priority changes are:

1. Make every score component mathematically explicit, with a shared valuation universe and cash treatment.
2. Separate **suggested orders**, **submitted orders**, and **broker-confirmed fills**. A click never directly changes actual holdings.
3. Check cash, concentration, fees, spreads, settlement, supported lot sizes, stale prices, and risk policies **after rounding** and again immediately before submission.
4. Treat the overall score as an explanatory metric, **not** a trade-approval signal or a guarantee that rebalancing increases the score.
5. Use ordinary code for scoring, signals, target generation, simulations, scheduling, and audit logging. AI-generated explanations are optional and separately metered.

### Readiness by subsystem

| Subsystem | Audit disposition | Release condition |
|---|---|---|
| Scoring matrix | **Needs implementation** | Exact formulas, stale/missing-data handling, test fixtures |
| Presets and sliders | **Needs implementation** | Feasible targets that sum to exactly 100% |
| Rebalance planner | **Needs implementation** | Rounded, fee-aware, reserve-safe, policy-approved orders |
| Portfolio mutation | **Critical blocker** | Only confirmed, deduplicated broker/simulator fills affect ledgers |
| Market scope / FX / cash | **Critical blocker** | Unambiguous account, scope, currency and available-cash rules |
| Friday/Monday audits | **Needs implementation** | Exchange calendars, market-specific cutoffs, event/idempotency logs |
| Token usage | **Not measurable from source** | Instrumentation and deterministic-first design |
| UI and accessibility | **Needs verification** | Rendered tests, unambiguous side/color labels, accessible controls |

---

## 2. Detailed audit: loose ends, logic defects and corrections

**Severity:** P0 = could cause incorrect portfolio state or unauthorized/unsafe execution; P1 = materially wrong scoring or execution decision; P2 = specification clarity, quality or efficiency.

| ID | Severity | Finding in original design | Required correction |
|---|---|---|---|
| A01 | P0 | “Execute All” directly updates live holdings/cash, with no fill confirmation. | Submit broker orders only after explicit user authorization; reconcile actual state from fill events. |
| A02 | P0 | No account-scoped cash or settlement rules; active-market and global portfolios can unknowingly share cash. | Define account/market/currency ledgers and `available_to_trade`, `reserved`, `unsettled`, `pending` separately. |
| A03 | P0 | No risk-policy gate, order idempotency, duplicate-click protection, or emergency stop. | Mandatory server-side policy evaluation, signed intent/version checks, idempotency keys, pause/kill switch. |
| A04 | P1 | “Allocation Drift Error 40%” is a label, not a formula. | Normalize total-variation drift into a bounded 0–100 allocation score; include cash. |
| A05 | P1 | SMA “cross-signal alignment” lacks periods, comparison logic, candle cutoff, missingness and direction semantics. | Specify 20/50 completed-bar trend state, not a crossover event; score held risky capital by signal. |
| A06 | P1 | HHI lacks universe selection and normalization; a one-asset portfolio or zero risky holdings is undefined under common normalizations. | Use risky invested weights; normalize against a fixed eligibility universe; one asset = 0, no risky investment = N/A. |
| A07 | P1 | Claims an illustrative improvement such as 68 → 98, implying rebalancing always increases health. | Show **observed/projection-only** components; target concentration can reduce the composite. |
| A08 | P1 | Targets can sum to 100% while violating a cash floor, concentration cap, or minimum asset universe. | Apply feasibility constraints *before* accepting a target; block if no feasible allocation exists. |
| A09 | P1 | Slider “auto-normalization” can silently move locked weights, breach limits or create rounding drift. | Lock user-edited weights; proportionally redistribute only unlocked weights; use exact final-unit reconciliation. |
| A10 | P1 | Whole-share/fractional increments, fee/spread/slippage and minimum order notional are absent. | Round to supported increments and recompute actual post-order cash and residual drift. |
| A11 | P1 | Buying against assumed sale proceeds may spend cash not actually available or settled. | Preview proceeds as conditional; release purchasing power only when the broker confirms it is tradable. |
| A12 | P1 | Market cap and momentum presets have no input-quality, cutoff, cap or corporate-action policy. | Version inputs, use as-of data only, fail on stale/missing critical values and apply risk caps. |
| A13 | P1 | Multi-market valuation and quote freshness are not defined. | Quote currency, FX rate/as-of, exchange calendar and maximum quote age are required. |
| A14 | P1 | Friday close / Monday open are treated as universal timestamps; crypto and holidays differ. | Market-specific calendars and timezone rules; simulated checks must never be labeled real audit runs. |
| A15 | P1 | No audit provenance, score version, source hash, or retry deduplication. | Immutable audit snapshot with configuration, quote/signal timestamps, trigger and result status. |
| A16 | P2 | “Buy / Over-performance” and “Sell / Under-performance” mix opposing concepts. | Label **BUY = target underweight**, **SELL = target overweight**; encode market performance separately. |
| A17 | P2 | Calling the tool “institutional-grade” implies assurance not established by the design. | Describe it as an audited-in-development portfolio tool until integration/reconciliation testing passes. |
| A18 | P2 | No AI usage accounting, budget, caching or model dependency policy. | Keep calculations at zero LLM tokens; meter optional narrative calls with hard caps and opt-in. |

**Critical distinction:** An issue marked *missing* or *underspecified* is a gap in the submitted proposal, **not proof of a bug in an unseen codebase**.

---

## 3. Immutable domain definitions and invariants

**Accounting identity (single account/scope/base currency):**

```text
NAV = cash_equity + Σ(quantity_i × reference_price_i × FX_i)
current_weight_i = position_value_i / NAV
current_weight_CASH = cash_equity / NAV
Σ current_weights = 1
Σ target_weights = 1
```

- **Cash equity for valuation** and **available-to-trade cash for order sizing** are not interchangeable. Restricted, reserved and unsettled cash must be tracked separately. Never borrow available cash from another market or account implicitly.
- Positions are identified by **account + venue + canonical instrument ID + settlement currency**, not by display ticker alone. Treat ticker changes, splits and corporate actions as reconciled events.
- A market-scoped portfolio must have an explicit cash allocation/subledger. A global view converts every position **and cash balance** to the declared base currency using timestamped FX rates. If conversion is missing or too old, score/order generation is blocked.
- The scoring universe is the **union of held instruments and target instruments** for the selected scope, plus a distinct `CASH` bucket. Zero-target but still-held instruments must not disappear from score calculations.
- All money, quantity and percentage calculations use decimal/fixed-point arithmetic, not binary floating-point for settlement decisions. Store exact values; round only at display or instrument-defined order increments.
- Disallow invalid or non-finite weights, negative unlevered holdings, missing quotes, negative cash without explicit margin authorization, `NAV <= 0`, and unsupported order types. No silent defaults.
- Each calculation records an input snapshot ID, timestamp and rule version. Two identical snapshots must produce identical outputs.
- The composite score is **descriptive**. A high score does not bypass risk limits, market restrictions, suitability checks or an approval gate.

---

## 4. Final scoring matrix — explicit v1 specification

### 4.1 Formula

Preserve the user-selected weights:

```text
CompositeScore = 0.40 × AllocationScore
               + 0.35 × TechnicalScore
               + 0.25 × DiversificationScore
```

Every component is bounded in `[0, 100]`. Scores are computed on one timestamp-consistent portfolio snapshot; round the displayed composite to one decimal place **after** calculating the unrounded value.

**Allocation / drift (40%):**

```text
D = 0.5 × Σ |current_weight_i − target_weight_i|
AllocationScore = 100 × (1 − D)
```

The sum includes **all held and targeted assets plus cash**. For two valid allocation vectors, `D` is in `[0, 1]`; a perfect target match scores 100. A reported drift of `0.20` means **20 percentage points of portfolio weight must be reassigned**, not “20% return lost.”

**Technical signal alignment (35%):**

```text
RiskyNAV = Σ position_value_i                 (exclude cash)
r_i = position_value_i / RiskyNAV             (held risky assets)
s_i = 1.0 (bullish), 0.5 (neutral), 0.0 (bearish)
TechnicalScore = 100 × Σ(r_i × s_i)
```

Signal rules, using *completed* market-specific daily bars:

```text
SMA20 > SMA50  => BULLISH
SMA20 = SMA50  => NEUTRAL
SMA20 < SMA50  => BEARISH
```

A 20/50 **state** is not the same thing as a new crossover event. Require at least 50 valid completed daily observations for the two averages. Apply adjusted equity prices and a declared crypto day boundary; never include unfinished Monday-open or future daily candles. Signal age limits are configured per asset class. Missing/stale signals for any material held risky position produce **TechnicalScore = N/A**, hence **CompositeScore = N/A**; do not treat missing data as neutral or reweight the other factors. In a projected portfolio, signals for newly proposed holdings are also required.

**HHI diversification (25%):**

```text
u_i = position_value_i / RiskyNAV
HHI = Σ(u_i²)
n = number of distinct non-cash assets in held ∪ positive-target universe
DiversificationScore = 100 × (1 − HHI) / (1 − 1/n), if n >= 2
DiversificationScore = 0,                         if n = 1
DiversificationScore = N/A,                       if RiskyNAV = 0
```

Calculate HHI **excluding cash** so cash does not masquerade as another diversified risky holding. Include still-held zero-target assets in both the numerator and eligible count. Fix and version the eligible universe; do not allow someone to inflate `n` by adding arbitrary zero-weight target names. Under a valid fixed universe the score is in `[0,100]`. If there are no risky holdings, show **N/A**, not 0 or a fabricated full score.

**Important scoring trade-off:** The HHI component rewards equal distribution across eligible risky names. A legitimate market-cap-tilted target can therefore achieve perfect allocation accuracy but a *lower diversification score*. Display the components and the conflict; do not manipulate the formula to force every rebalance to raise the total.

### 4.2 Reference results — independently calculated

| Scenario | Allocation | Technical | HHI-based diversification | Composite |
|---|---:|---:|---:|---:|
| Two assets equally weighted, both bullish, targets matched | 100.0 | 100.0 | 100.0 | **100.0** |
| 80% / 20% held vs 50% / 50% target; both bullish | 70.0 | 100.0 | 64.0 | **79.0** |
| 50% / 50% held and targeted; one bullish, one bearish | 100.0 | 50.0 | 100.0 | **82.5** |
| One bullish risky holding, 5% target cash met | 100.0 | 100.0 | 0.0 | **75.0** |
| 47.5% / 47.5% / 5% cash held vs 85.5% / 9.5% / 5% target; both bullish | 62.0 | 100.0 | 100.0 | **84.8** |
| After exact shift to that concentrated target, ignoring transaction costs | 100.0 | 100.0 | 36.0 | **84.0** |
| Missing required technical signal or no risky holdings | As available | N/A | As available | **N/A** |

The **84.8 → 84.0** example demonstrates that rebalancing *can reduce* the composite despite correcting drift. It is a mathematical illustration, **not an approved trade**: concentrated targets must independently pass the live risk policy.

### 4.3 Presentation rules

Show `Composite`, the three component scores, unrounded internal drift, HHI, eligible asset count, `as_of`, target version and signal freshness. Distinguish **CURRENT**, **PROJECTED / SIMULATED**, and **RECONCILED / ACTUAL**. Never label a theoretical post-trade score as realized. Missing components display **INCOMPLETE — NOT SCORED**, with the specific data blocker.

---

## 5. Allocation presets, sliders and risk-feasible normalization

### 5.1 Presets

Every model includes a separate configurable target cash weight `c` at or above the relevant policy floor, leaving `1 − c` for risky assets.

| Preset | Deterministic definition | Failure condition |
|---|---|---|
| Equal Weight | `target_i = (1 − c) / N` among eligible risky instruments | `N = 0`, insufficient eligible assets under concentration limits |
| Market Cap | `raw_i = market_cap_i`, then `target_i = (1 − c) × raw_i / Σ raw` | Missing/invalid/stale cap, currency or identifier data |
| Momentum / Alpha Tilt | **Proposed parameterized v1:** `m_i = clamp(63-completed-session return_i, −0.5, +0.5)`; `raw_i = 1 + α × m_i`; normalize to `1 − c` | Missing as-of price history, look-ahead data, invalid `α` |

For the proposed momentum rule, `α = 0.4` is a **test parameter, not a previously approved production setting**. Version `lookback`, `α`, caps and eligible universe; do not promote them silently to live trading. Corporate-action-adjusted histories and market-specific session calendars are required. A momentum *tilt* is not permission to increase leverage or override portfolio caps.

**Apply constraints after constructing raw weights:** enforce a configured maximum per asset, minimum cash, eligibility, prohibited instruments, minimum order/lot rules, liquidity constraints and other account policies. If necessary, redistribute clipped weight iteratively among eligible names using a deterministic bounded allocation algorithm. If there is no feasible solution, show **INFEASIBLE TARGET** and explain why; never silently relax a cap or change the strategy type.

### 5.2 Slider behavior

1. Treat the active slider and any explicitly pinned sliders as locked, expressed in exact percentage basis points (e.g. `0.01 percentage point` UI step).
2. Reserve the selected cash target, which cannot fall below the account policy floor.
3. Compute `remaining = 1 − cash_target − Σ locked_risky_weights`. If negative, block the edit.
4. Distribute `remaining` **only** among unlocked eligible risky assets in proportion to their previous positive targets; if all prior unlocked targets are zero, use equal weights.
5. If no risky assets remain unlocked, keep the residual as additional cash rather than modifying locked choices.
6. Use a largest-remainder final rounding pass so displayed percentages total **exactly 100.00%**, without changing locked controls. Reapply all caps and minimums; report infeasibility instead of silently breaking them.
7. Show the number of edited/pinned weights and **Reset to Preset**. Maintain separate draft and approved target versions.

Do not use target presets or slider changes to issue orders automatically.

---

## 6. Rebalancing rule — deterministic order proposal

### 6.1 Calculation and executable-quantity policy

For each symbol `i` at one validated snapshot:

```text
target_value_i = NAV × target_weight_i
value_gap_i = target_value_i − current_position_value_i
ideal_quantity_delta_i = value_gap_i / reference_mid_i
```

Use `reference_mid` only for **valuation and desired sizing**. Execution preview uses conservative **bid for sells** and **ask for buys**, plus explicit estimated fees, market-specific taxes, slippage buffer and FX costs. Do not equate mid-price value with spendable order proceeds. Obtain minimum quantity/step, contract multiplier and minimum notional from the instrument/broker metadata.

**Default configurable hysteresis for testing:** ignore a drift under **0.5 percentage points** per asset unless a higher-priority risk control requires an adjustment. This threshold is a proposed parameter; persist it in policy configuration. For both buys and sells, round **toward zero** to the supported quantity increment, then recompute residual deviation and money impact.

**Deterministic proposal order:**

1. Read immutable holdings, cash, quotes, FX, order/settlement status, eligible universe, target version and risk policy.
2. Validate timestamps, numbers, market session, identifiers, instrument restrictions and `NAV > 0`; fail closed if any mandatory input is invalid.
3. Resolve all open and pending orders; do not propose conflicting duplicate quantities.
4. Calculate required reductions. Plan **sells first** at conservative bid, using lot/fee/minimum-notional limits and never selling more than the genuinely available holding.
5. Estimate sale proceeds as **conditional only**. Do not treat them as usable cash until the broker confirms the amount is available to trade.
6. Plan buys in deterministic priority order, e.g. greatest target underweight first, with a stable instrument-ID tie-break. Allocate only actual/allowable available cash while preserving the configured reserve.
7. Recalculate the entire **projected** balance sheet after every rounded trade and cost. Enforce cash floor, single-name caps, sector/correlation limits if configured, liquidity, leverage, permissions, venue min/max order constraints and any active drawdown gate.
8. If a constraint cannot be met with executable lots, return **INFEASIBLE** or **PARTIAL FEASIBLE PLAN** with reasons. Never pretend that a non-executable ideal portfolio can be reached.
9. Publish preview-only orders with gross sales, gross purchases, fees, projected cash, target drift before/after, projected score **if calculable**, price/FX freshness and explicit potential shortfall.
10. Revalidate against current data and policy **at the point of authorization and submission**. If quote, cash, order state, model version or permissions materially changed, expire the draft and require a new review.

**Liquidity preflight:** `projected_available_cash >= required_cash_floor` *after* all conservative prices, order rounding and costs. If already below the floor, the planner may attempt additional permissible sales, but must not approve until the floor is restored or explicitly blocked by policy. Unknown or pending sale proceeds are not settled funds.

### 6.2 Worked whole-share fixture

Sample **currency units**, not a current market quotation:

| Input | A | B | Cash |
|---|---:|---:|---:|
| Initial | 8 shares × 100 mid = 800 | 2 shares × 100 mid = 200 | 100 |
| Target weight | 50% | 45% | 5% |
| Bid / ask | 99 / 101 | 99 / 101 | — |

- Initial reference NAV = `1,100`; cash minimum/target = `55` (5%), fee set to zero for the fixture.
- **Sell 2 A** at bid `99`, generating conditional proceeds `198`.
- **Buy 2 B** at ask `101`, consuming `202` (only if the selling proceeds are actually available to trade).
- Conditional cash after both fills = `96`; remaining A = 6, B = 4.
- Mid-marked post-fill NAV = `1,096` after `4` of bid/ask execution cost. **Residual drift remains** because whole-share lots cannot exactly reach the desired percentages.

### 6.3 Fractional-quantity fixture

A crypto position of `0.200 BTC` marked at `20,000`, plus `2,000` cash, yields `6,000` NAV. For 90% BTC / 10% cash, ask `20,100`, and a `0.001 BTC` lot step, the ideal extra `0.070 BTC` costs `1,407` and would breach the `600` cash target. **The executable buy is `0.069 BTC`** costing `1,386.90` (zero fees in this fixture), leaving `613.10` cash. This verifies that rounding and **ask pricing**, not just mid pricing, determine orders.

### 6.4 Discovered infeasibility fixture

A two-position account has A = 40 × 10, B = 129 × 10 and cash = 76, for NAV = `1,766`. The 5% reserve requires `88.30`. Target weights for A/B/cash are approximately `21.9231% / 73.0769% / 5%`. Selling only the target-based rounded whole-share excess (one A at bid `9.9`) still leaves less than the required cash reserve. The naive order planner **fails this invariant**. The corrected rule returns `INFEASIBLE_CASH_FLOOR` rather than executing an unsafe plan; a full optimizer may seek an additional safe sale and rerun checks.

---

## 7. Execution, reconciliation and safeguards

**Never mutate broker-backed holdings because a user clicked Execute.** The source document's “one click” means *one explicit authorization of a reviewed batch*, not automatic ledger fiction.

```text
DRAFT → VALIDATED → USER_AUTHORIZED → SUBMITTING
      → ACCEPTED / PARTIALLY_FILLED / FILLED / REJECTED / CANCELLED / EXPIRED
                                   ↓
                         DEDUPLICATED FILL EVENTS
                                   ↓
                        ACTUAL POSITIONS / CASH
                                   ↓
                        RECONCILIATION & ACTUAL SCORE
```

- Send the authorization to a server-owned order coordinator with account permissions, policy checks, CSRF/session protection and an **idempotency key** for the batch and each order.
- The UI shows **Preview / Simulated** until the execution venue and broker confirm acknowledgements and fills. Never display “Executed” on HTTP success alone.
- Maintain order IDs, broker execution IDs, cumulative filled quantity, fee currency, venue, timestamps, reject reason and pending reserved funds. Deduplicate by immutable fill ID; update ledgers exactly once **per new fill quantity**. Distinguish a cumulative order-status update from a new incremental fill event.
- Respect settlement/available-funds constraints before subsequent buys. If sells and buys cannot be safely combined, split the workflow into stages rather than overspending.
- Persist the intended batch, approvals, orders and fills in durable transactional storage; reconcile against broker positions and balances on restart, reconnect and partial failure. Prevent negative unlevered holdings and unauthorized leverage.
- Record error/partial fill outcomes; do not silently retry a rejected order with a new idempotency key. A retry should be a newly authorized, current-snapshot plan.
- Implement **paper mode first**. If no verified live broker adapter exists, clearly label the action **Apply Simulated Fills**, never “Execute Live Orders.”
- Add disable-live-trading and cancel-pending (when venue supports it) controls and fail closed on policy/price/connection faults. **No scheduled audit may submit trades.**

**Risk governance:** Risk controls come from the account's authoritative versioned policy store—not from values hardcoded in this document. Sample tests use a **5% minimum cash reserve**, and one rejection fixture uses a **30% maximum single-name target**. These are **test inputs**, not source-confirmed live limits. Verify the current desk policy, including any leverage, drawdown, exposure, and trade-approval gates, before release.

---

## 8. Application architecture and data contracts

### 8.1 Proposed modules

```text
src/types/rebalance.ts                   domain types and order/audit states
src/lib/rebalance/valuation.ts            NAV, FX, holdings-to-weights, cash scope
src/lib/rebalance/targets.ts              presets, sliders, caps, feasibility
src/lib/rebalance/signals.ts              as-of SMA and momentum history
src/lib/rebalance/scoring.ts              pure scoring functions and N/A reasons
src/lib/rebalance/planner.ts              fee-aware rounded preview, no side effects
src/lib/rebalance/policy.ts               mandatory, versioned risk-policy gates
src/server/rebalance/order-coordinator.ts authorization, broker adapter, idempotency
src/server/rebalance/fill-reconciler.ts    fills, state, reserved cash, ledger updates
src/server/rebalance/audit-runner.ts       exchange-aware audit scheduling/snapshots
src/server/rebalance/usage-meter.ts       optional LLM token/cost telemetry
src/components/portfolio-rebalance-panel.tsx
src/components/portfolio-view.tsx         Rebalance sub-tab and navigation
```

Adapt names and integration points to the actual repository only after inspecting its state framework. `QuotesContext / DataAdapter` should feed *validated snapshots*, not mutate the portfolio. Backend APIs own authorization and reconciliation.

### 8.2 Minimum contracts

| Entity | Required fields |
|---|---|
| `PortfolioSnapshot` | `accountId`, `scopeId`, `baseCurrency`, `asOfUTC`, `version`, positions, cash buckets, pending orders, FX and quote references |
| `QuoteSnapshot` | canonical instrument ID, bid, ask, mid/mark, quote currency, timestamp, venue, quality/status |
| `TargetModel` | model ID/version, preset, eligible universe, cash target, constrained weights, locked sliders, parameters, source cutoffs |
| `ScoreBreakdown` | score or `null`, A/T/Q components or `null`, HHI, drift, data-as-of, model hash, rule version, unavailable reasons |
| `RebalanceProposal` | proposal ID, snapshot hash, model/policy version, status, expiry, orders, costs, conditional balances, pre/post metrics, blockers |
| `OrderIntent` | order ID/idempotency key, side, quantity, increment, limit/market rules, account, venue, currency, approval reference |
| `ExecutionEvent` | broker order/execution IDs, incremental fill quantity and price, fee, event timestamp, status, dedupe key |
| `AuditSnapshot` | real/simulated flag, market/session ID, trigger, scheduled/actual timestamp, score inputs/results, source hashes, error status |
| `UsageEvent` | provider/model, request kind, input/output/cached tokens, estimated/actual charge, budget scope, result/cache hit |

Use schemas with validation on ingress and immutable versions. Store prices and money as decimal strings or exact numeric database types. Record data provenance and numerical unit/currency on every cross-boundary contract.

### 8.3 Display requirements

The panel contains target-preset controls, pinned sliders, an allocation comparison, order table, cash/fee summary, factor scores, data freshness, audit history and an explicit **Paper / Live** environment indicator. Use clear **underweight (buy)** and **overweight (sell)** labels; color must not be the only cue. Show prospective state before authorization and actual reconciled state afterward. Support keyboard controls, narrow screens, contrast and unit-labeled tabular numerals.

---

## 9. Friday close, Monday open and manual audits

1. Use an **exchange calendar**, official trading session, timezone-aware timestamps and venue-specific early-close/holiday rules. NSE's usual 15:30 `Asia/Kolkata` close and US regular 16:00 `America/New_York` close are *examples*, not hardcoded universal scheduling rules. US local offsets change with daylight saving time.
2. Friday close run: trigger after the relevant venue's last eligible completed quote/bar and feed cutoffs. Monday open run: trigger after an explicitly configured post-open data-readiness delay; use the last **completed** daily candle for the 20/50 SMA until a new one completes.
3. For 24/7 crypto, define a separate weekly UTC cutover and Monday reassessment. Do not imply a literal exchange close or open. For ETFs, use the applicable trading venue.
4. If Friday/Monday is an exchange holiday, do not fabricate an event; adopt a configurable *last session / next session* mapping and record the actual session date.
5. **Manual Refresh** reads a new data snapshot and recalculates; it does not submit an order. **Simulate Friday/Monday** uses an explicit labeled hypothetical/as-of input and must not be recorded as a live market event.
6. Unique audit key: `(accountId, scopeId, marketId, sessionId, auditType, sourceSnapshotVersion, ruleVersion)`; retries must be idempotent. Store attempts, outcomes, data freshness, elapsed work and reason codes.
7. Compare Friday vs Monday using like-for-like portfolio/model versions. Flag price-gap, position changes, signal changes, FX effects and cash flows separately; do not attribute all score movement to market performance.

---

## 10. Token usage and compute-efficiency audit

### 10.1 What can actually be verified

- The uploaded original specification is **9,502 Unicode characters**, **11,742 UTF-8 bytes** and **1,139 whitespace-delimited words**. These are document measurements, **not model-token counts**.
- No AI provider, tokenizer version, prompts, usage responses, production runtime traces, or billing records are present. Therefore **actual past input/output tokens, cost, cache hit rate and per-audit AI spend are unknown**. Any purported exact number would be invented.
- The scoring, target generation, rebalance optimization, risk checks, quote valuation, scheduled audits and event logging require **zero LLM tokens**. They should be ordinary pure functions, rules, batch jobs and database operations.

### 10.2 Required runtime policy

| Operation | Model usage | Cost/control mechanism |
|---|---|---|
| NAV, target, drift, HHI, SMA, momentum and composite score | **0 AI tokens** | Pure functions; cache by snapshot/model/rule version |
| Proposal generation and compliance/risk gate | **0 AI tokens** | Deterministic engine, server-side policy |
| Friday and Monday audit snapshot | **0 AI tokens by default** | Exchange-aware background job; persist diffs only |
| Manual refresh / dashboard rendering | **0 AI tokens by default** | Event-driven invalidation; avoid duplicate recomputation |
| Optional plain-English audit commentary | **Opt-in only** | Structured compact facts, hard token/cost caps, cache by audit hash |

**Suggested optional commentary envelope (configurable, not an observed usage value):** at most **1,200 input tokens + 300 output tokens per generated explanation**; one output per unique completed audit snapshot unless the user expressly regenerates it. For two weekly explanations, that is an example budget of **up to 3,000 generated/consumed input-plus-output tokens per week** before retries, cache/read adjustments and any extra manual requests. Disable or degrade gracefully to a template if the budget or provider is unavailable.

**Every optional model invocation must log:** model/version, purpose, request/audit ID, prompt-template version, estimated and provider-reported input/output tokens, cached tokens, latency, price schedule version, estimated charge, actual charge if available, error/retry and cache hit. Use authoritative provider usage fields rather than word-count estimation where available.

```text
estimated_cost = (uncached_input_tokens × input_price_per_million
                + cached_input_tokens × cached_input_price_per_million
                + output_tokens × output_price_per_million) / 1,000,000
```

Apply current provider-specific pricing and billing units; do not hardcode a price in the engine. Monitor p50/p95 token counts, retries, weekly spend, commentary opt-in rate and audit cost per user/market. Avoid sending raw holdings histories, credentials, access tokens or unrelated user records to the LLM; generate commentary from a compact privacy-filtered JSON difference and validate its numbers against deterministic outputs. **LLM text must never be parsed as an executable order.**

### 10.3 Non-token performance limits

Reuse as-of price/signal snapshots; compute daily SMA once per completed bar per instrument; debounce live UI updates; batch quote fetches; cancel stale requests; use indexed audit history queries and bounded retention/archival. Schedule Friday/Monday scoring once per account/scope/source version with dedupe. Instrument CPU duration, provider API limits, FX/quote freshness and broker requests separately from AI tokens.

---

## 11. Independent test evidence

A standalone Python `Decimal` / `unittest` reference harness was built from the corrected formulas and run in this audit. **36 tests passed**, including **1,000 seeded randomized planner scenarios** and **1,000 seeded randomized scoring scenarios**. Earlier exploratory reference tests exposed an infeasible cash-floor state and an incorrect expected fractional quantity; both were resolved in the *reference rules/tests*. The production application was not run or changed.

| Test group | Key checks | Result |
|---|---|---|
| Scoring | Perfect alignment, allocation drift, mixed technical signals, one-asset HHI, concentrated-target regression, off-target holdings, null inputs | PASS in reference |
| Presets | Equal, market-cap ratio, missing market caps, bounded momentum inputs, infeasible cap | PASS in reference |
| Sliders | Pinned edit, proportional redistribution, locked over-allocation, residual-to-cash | PASS in reference |
| Order maths | Sell-before-buy preview, conservative bid/ask, integer/fractional lots, fees, minimum order notional, drift tolerance, cash floor | PASS in reference |
| Safety/state | Invalid quotes/targets, negative/zero balance, risk cap, immutable preview, rejected orders, partial fills, duplicate fill IDs | PASS in reference |
| Randomized invariant checks | 1,000 planner cases (cash floor or explicit infeasibility, no overselling, deterministic results); 1,000 score cases (`0 <= score <= 100`) | PASS in reference |

**Known coverage boundary — NOT TESTED:** real broker connectivity; actual market/holiday calendars; real quotes, FX and staleness enforcement; market/account cash segregation; signed approvals; database transactions; reconnect/replay reconciliation; order-status cumulative vs incremental fill interpretation; browser UI; current risk policy; performance under load; actual model token consumption. All require implementation/integration tests and evidence before live release.

---

## 12. Phased implementation, ordered to prevent rework

### Phase 0 — Discover and freeze existing interfaces

- Inspect `PortfolioView`, current holdings/cash store, real/paper execution adapters, quote feeds, market registry, policy controls and existing audit runner. Identify canonical state owner and account/market cash rules.
- Document currently supported market calendars, order increments, FX source, authorization model and where realized fills are persisted.
- Create snapshots/fixtures without changing live state. Establish **paper-only** default and one versioned rule configuration.

**Exit:** diagram of actual data ownership, input contracts and risk/market prerequisites; no unresolved ambiguity about where broker-backed quantities originate.

### Phase 1 — Pure valuation, signal, scoring and target engine

- Implement `valuation`, `signals`, `scoring` and `targets` as deterministic pure functions; include typed `Result / Incomplete / Invalid` states.
- Implement exactly the formulas in Sections 3–5. Fixed-point percentage normalization, data freshness and safe failure are mandatory.
- Port reference fixtures to the application's native test framework; add property tests for bounds, target sums, immutable inputs and off-target positions.

**Exit:** scores match Section 4.2 to specified precision, invalid inputs never appear as valid scores, all presets are reproducible and feasible.

### Phase 2 — Preview-only rebalance planner and policy engine

- Implement proposal generation with conservative price, fees, slippage, lot sizes, minimum notional, reserve and risk caps; compute residual drift after rounding.
- Return `FEASIBLE`, `PARTIAL_FEASIBLE` or `INFEASIBLE` with structured reasons. No mutation side effects.
- Test constraint conflicts, underfunded reserves, pending orders, multi-currency data and deterministic tie-breaks.

**Exit:** randomized and adversarial cash/quantity tests pass, and every proposed order passes the same server-owned policy check used before submission.

### Phase 3 — UI and paper execution reconciliation

- Add the Rebalance sub-tab, score breakdown, sliders, comparison bars, conditional order preview, cash/fee cards, audit history and status/accessibility labels.
- Wire **paper** authorization to a state machine with immutable batch ID, simulated fill events, idempotent reconciliation and accurate holdings/cash.
- Test double click, restart, rejected/partial fills, duplicate event replay, quote expiry and a policy change between preview and submission.

**Exit:** paper UI reflects fill-confirmed state only; rejected/pending intents never alter holdings; proposed vs actual values reconcile.

### Phase 4 — Market-calendar audits and operational hardening

- Implement separate scheduled event types and manual/simulated triggers using venue calendars and DST-aware cutoffs.
- Add audit provenance, versioned configs, retries/deduplication, monitoring, alarms, load tests and recovery/reconciliation on startup.
- Demonstrate Friday/Monday/holiday/early-close/crypto cases and mismatched data handling in integration tests.

**Exit:** every audit has complete provenance, no duplicate snapshot writes and no ability to place trades.

### Phase 5 — Optional live adapter and optional commentary

- Only after formal policy approval, enable a broker-specific adapter behind a **disabled-by-default feature flag** for approved accounts.
- Confirm quote freshness and policy again at user authorization, bind approvals to exact orders, handle settlement and reconcile fills.
- Add optional cost-metered LLM explanation service. Keep commentary disabled by default and independent of any execution path.

**Exit:** end-to-end sandbox/broker-certification evidence, kill-switch exercise, ledger reconciliation, duplicate/replay tests and token-budget alerting. Without those, retain **paper-only** mode.

---

## 13. Required integration and release acceptance gates

A live-trading release must satisfy **all** of these:

- [ ] Actual application scoring matches the reference scoring fixtures and handles all edge/null cases.
- [ ] Every selected target sums to exactly 100% after final display rounding and passes all configured constraints.
- [ ] Cash and portfolio quantities are scoped to the correct account, market and currency; no accidental cross-market allocation.
- [ ] Invalid/stale quotes, FX, signals, permissions or risk configuration fail closed with a human-readable reason.
- [ ] Drafting/reviewing never mutates positions; paper/live positions change only through accepted, deduplicated fills.
- [ ] Full and partial fill/reject/cancel/replay paths reconcile with broker balances without duplicate mutation.
- [ ] Risk caps, leverage rules, cash floor, min order/lot, pending orders and transaction costs are enforced after rounding and before submission.
- [ ] The user explicitly authorizes the exact current batch; double clicks and retries cannot place duplicate orders.
- [ ] Fridays, Mondays, holidays, early closes, DST and 24/7 markets produce correctly labeled and deduplicated audits.
- [ ] Missing data yields an **incomplete** score, not a misleading zero/perfect score.
- [ ] Realized/actual vs projected/simulated score labels cannot be confused.
- [ ] Audit snapshots contain rule version, configuration/input hashes, as-of times, outcome and source lineage.
- [ ] Automated scoring/auditing makes **zero LLM calls**; any optional narrative usage is measured, opt-in, budgeted and never used for trade execution.
- [ ] Browser, API, integration, load, recovery and security tests are run against the actual repository; failure alerting and the live kill switch are exercised.

---

## 14. Decision register — values not confirmed by the uploaded plan

Do not fabricate approval for these operational parameters. Resolve by inspecting the actual application and the current desk policy before enabling live orders:

1. Broker/exchange adapters, supported order types, shorting/fractional capabilities and whether only paper trading is currently supported.
2. Account/scope cash-ledger ownership, FX provider and freshness limits.
3. Minimum cash floor, exposure caps, leverage/drawdown limits, permitted assets and required authorization thresholds.
4. Rebalance hysteresis, min notional, expected fee/slippage schedules and stale quote timeout per venue.
5. Approved momentum lookback/tilt strength, market-cap provider, eligibility selection and risk-constrained redistribution method.
6. Post-open delay and exchange-specific audit session/holiday policy.
7. Audit log retention and optional LLM narrative budgets, model and billing price source.

**Final implementation instruction:** Build and release the **scoring + preview + paper reconciler** first. Keep **live batch execution disabled** until the repository-level tests, broker confirmations, cash policy and authorization controls in this plan are demonstrably complete. The 36 passing tests support the corrected **design logic only**; they are not a certification of deployed behavior.
