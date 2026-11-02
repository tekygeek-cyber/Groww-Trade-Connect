# Portfolio Rebalance Tool & Core Value Score — Audit and Implementation Plan (v2)

**Source reviewed:** `implementation_plan (2).md`
**Date:** 1 Nov 2026
**Scope of this version:** logic audit (scoring, rebalancing, audits), design-token audit (colours, type, contrast), and a self-audit of my first draft of this document. "Token usage" is read as design-token usage, since the plan has no LLM component. If you meant something else, say so.

**How it was tested.** The source plan has no formulas, so I built a Python reference model of (a) the plan as literally written and (b) the revised rules in Part C. I ran property tests, fuzz runs over 5,000 random portfolios and a 200-path simulation. Contrast ratios were computed to WCAG 2.x. All inputs are synthetic and the model is not your TypeScript. Tests are specified in Part D so they can be ported.

---

## Part A — Verdict

The source plan is a good product brief but not an implementable spec. Five findings block a build as written:

1. **The score has weights but no formulas.** Three plausible readings of "Allocation Drift Error" gave **4 / 52 / 0** out of 100 for the same portfolio (T1).
2. **The 68 → 98 example cannot happen.** A perfectly rebalanced portfolio scored ≥ 98 in **0%** of 3,000 random portfolios per preset. Mean ≈ 80, best 97.8 (T3).
3. **The score can be gamed.** Setting target = current weights, with zero trades, added **+36.6 points** on average (T4).
4. **The rebalance rule is only a rounding formula.** Run literally it drove cash negative in **28%** of portfolios and had an order rejected mid-batch in **84%** (T9).
5. **The colour system fails basic accessibility.** The "Balanced" slate fails AA text contrast, red and green are indistinguishable by luminance (1.48:1), and "over-performance = green" contradicts "overweight → SELL = red" (Part B5).

Everything is fixable by specifying it. Part C is the corrected plan.

---

## Part B — Audit

Severity: **B** blocker · **H** high · **M** medium · **L** low.

### B1. Scoring findings

| ID | Sev | Finding | Fix |
|---|---|---|---|
| S1 | B | Drift, Signal and HHI sub-scores have no formula or 0–100 mapping. | §C4.6 |
| S2 | B | "HHI" undefined. Raw `100·(1−HHI)` maxes at 90 for 10 equal names. Normalised HHI divides by zero at N=1 and rates 3 equal names **100** (T2). | Effective-N formula |
| S3 | B | "Signal Alignment" says both "SMA signal" and "BUY/SELL cross signals". No rule for NEUTRAL, missing or short-history assets. | §C4.6 |
| S4 | H | 68 → 98 unreachable (T3). Ceiling depends on signals: 10 equal names with 3 BUY / 5 NEUTRAL / 2 SELL top out at **88.63**. | Show "ceiling"; drop the example |
| S5 | H | Score is gameable through the target (T4); slider edits change it without a trade. | Draft vs saved policy |
| S6 | H | No gates. An on-target all-SELL portfolio scores **65**; a single-stock portfolio **75** (T6). | Score gates |
| S7 | M | Momentum preset builds the target from signals, and the score rewards signal alignment again, so drift and signal partly double-count. | Show sub-scores separately; document |
| S8 | M | Scores are not comparable across presets or markets. Snapshots don't record preset or config. | Config version in every snapshot |
| S9 | M | Cash treatment in weights undefined. | §C4.1 |
| S10 | L | NEUTRAL mapping is a policy choice worth ±3.5 points (T7). | Versioned config |
| S11 | L | The concentration factor penalises small portfolios regardless of policy (5 equal names → 44). That is intended "quality", but the user needs to see why the ceiling is below 100. | Ceiling + sub-scores in UI |

### B2. Scoring test results

Revised formulas (§C4.6) unless noted. Random portfolios: 3–15 assets, prices ₹5–₹5,000 (log-uniform), Dirichlet weights, signals 30% BUY / 40% NEUTRAL / 30% SELL.

**T1 — Formula ambiguity (plan as written).** One heavily drifted 10-asset portfolio vs equal weight:

| Reading of "drift error" | Drift sub-score |
|---|---|
| Turnover-based (`1 − ½Σ|d| / 0.25`) | 4.0 |
| Mean |d| relative to average target | 52.0 |
| RMS drift vs 5pp tolerance | 0.0 |

**T2 — Concentration readings.**

| Portfolio | Raw `100(1−HHI)` | Normalised HHI | Revised (effective N, N_ref = 10) |
|---|---|---|---|
| 10 equal | 90.0 | 100.0 | 100.0 |
| 3 equal | 66.7 | **100.0** | 22.2 |
| 1 name | 0.0 | **NaN** | 0.0 |
| top-heavy 10 (N_eff 7.56) | 86.8 | 96.4 | 72.9 |

**T3 — Can a rebalanced portfolio reach 98?** Zero-drift best case, 3,000 portfolios per preset:

| Preset | Mean | p5 | p95 | Max | ≥ 90 | ≥ 98 |
|---|---|---|---|---|---|---|
| Equal weight | 80.1 | 63.4 | 91.2 | 96.8 | 9.0% | **0%** |
| Market cap | 74.0 | 61.5 | 84.8 | 92.8 | 0.3% | **0%** |
| Momentum tilt | 82.9 | 63.7 | 94.2 | 97.8 | 28.9% | **0%** |

Pre-rebalance equal-weight mean was 39.3 (p5 20.4, p95 55.6). Signals here are random; 98 would need almost all weight in BUY names, which collides with the concentration factor.

**T4 — Gaming.** Target := current weights: mean gain **+36.6**, max +40.0 (the full drift weight), > 10 points in 99.4% of portfolios.

**T5 — Property tests** (3,000 random cases each): **0 failures** for score in [0,100]; NaN-free; zero-drift → drift = 100; drift monotone as weights blend toward target; invariant to quantity scaling (×0.1–×50); invariant to asset order.

**T6 — Edge cases.**

| Case | Ungated | Gated | Gate |
|---|---|---|---|
| Single stock, BUY, on target | 75.00 | 60.00 | POSITION_CAP |
| 10 equal, all SELL | 65.00 | 60.00 | SELL_EXPOSURE |
| 10 equal, all BUY | 100.00 | 100.00 | — |
| 10 equal, 3 BUY / 5 NEUTRAL / 2 SELL | 88.63 | 88.63 | — |
| 10 equal, all NEUTRAL | 91.25 | 91.25 | — |
| 10 equal, no signal data | 91.25 | 60.00 | SIGNAL_COVERAGE |
| All cash | 0.00 | 0.00 | SIGNAL_COVERAGE |
| 10 names, NEUTRAL, top name 30%, on target | 82.66 | 60.00 | POSITION_CAP |

The last row matters for the Market Cap preset: a target that is concentrated by design is capped at 60. See open decision Q6.

**T7 — NEUTRAL mapping sensitivity.** Mean post-rebalance score 76.8 / 80.3 / 83.8 for NEUTRAL = 0.50 / 0.75 / 1.00.

**T8 — Slider normalisation.** Proportional redistribution: 0 failures in 3,000. Integer basis points with largest-remainder rounding: 0 failures. Plain 1-decimal rounding: Σ ≠ 100 in **47.6%**. Degenerate case (others all zero, slider at 40%): others split the remainder → 40 / 30 / 30.

### B3. Rebalancing findings

| ID | Sev | Finding | Fix |
|---|---|---|---|
| R1 | B | No trigger rule; "BALANCED" has no threshold, so tiny drifts produce orders. | §C4.3 |
| R2 | B | Rounding undefined (whole vs fractional). Round-to-nearest buys overspend cash (T9). | §C4.4 |
| R3 | B | No order sequencing; buys before sells fail mid-batch. | Sells first |
| R4 | H | No fees, slippage, minimum trade or lot handling. | §C4.4 |
| R5 | H | Preview-to-execute price staleness unhandled (T10). | Execution guard |
| R6 | H | Decision 1 executes straight into live state with no confirm step, idempotency key, atomicity or partial-fill handling, and no paper/live distinction. If this desk follows an "offline default, live execution gated behind config" principle (as the Groww Connect v1 plan does), it breaks that principle. | Paper default |
| R7 | H | Universe undefined. Targets computed from holdings imply held assets only, so the tool can never add or exit a name. | Explicit v1 decision |
| R8 | H | Market Cap preset needs market-cap data; none exists in the quotes adapter. | Open decision Q2 |
| R9 | H | Multi-market toggle mixes INR, USD and crypto with no FX rule; contradicts "APIs separated by market". | v1: one market per session |
| R10 | H | Momentum Tilt undefined. Naive version gave **428% annual turnover and ~171 bps/yr cost** (T11). | k = 0.25, hysteresis, step cap |
| R11 | M | Slider "auto-normalize" undefined (T8). | Basis points |
| R12 | M | **27%** of retail-size test portfolios (₹20k–₹500k) hold a single share worth > 5pp, so the band cannot be met. With no lot floor, **20%** still breach the band after rebalancing (T12). | Lot floor + cooldown |
| R13 | L | Tax (India STCG/LTCG, STT), tax lots and brokerage not modelled. | Out of scope; warn |

### B4. Rebalancing test results

**T9 — Literal rule vs revised rule.** 5,000 random portfolios, 20 bps per side fees + slippage, 30% start with zero cash, literal orders executed in listed order.

| Metric | Literal (round-to-nearest) | Revised |
|---|---|---|
| Order rejected mid-batch (cash < 0 at a step) | **4,223 (84.5%)** | 0 |
| Final cash negative | **1,407 (28.1%)** | 0 |
| Negative share quantity | 0 | 0 |
| Immediate re-run produces more orders | **4,905 (98.1%)**, mostly dust | **0 of 4,986 triggered** |
| Value conserved (V − V′ = costs) | n/a | 0 errors |
| Rebalance lowered the score | n/a | 0 |
| Avg orders / avg one-way turnover | 8.9 / 29.7% | 8.4 / 29.4% |

At **zero cost** the literal rule still failed: mid-batch 4,106 (82.1%), final negative cash 875 (17.5%). Rounding and ordering are the cause, not fees alone.

Trade-off, stated plainly: the revised rule gives up some tracking precision for solvency. Residual max drift after rebalancing: literal median 0.08pp / p95 0.78pp / max 2.19pp; revised median 0.22pp / p95 1.23pp / max 4.50pp. The large residuals come from cash-limited buys being scaled down and from expensive shares in small portfolios. The random portfolios are far from target (4,986 of 5,000 triggered), so this table tests the trade logic, not how often a real portfolio triggers.

**T10 — Stale price.** Execution quote differs from preview by N(0, 0.4%).

| Variant | Negative cash after execution |
|---|---|
| Literal | 3,594 of 5,000 (71.9%) |
| Revised, no guard | 655 of 4,986 (13.1%) |
| Revised, guard (re-price buys, scale down) | **0** |

The guard also aborted any batch where *any* asset in the portfolio moved > 1% (530 batches, 10.6%). Aborting only on *ordered* assets would abort less, so 10.6% is an upper bound. Tolerance still needs per-market tuning.

**T11 — Cadence and churn.** 200 seeded 3-year random-walk paths, 5 assets, daily σ 1.6%, SMA20/50 signals, weekly audits, 20 bps per side. **Random walks have no momentum, so this measures cost only, not benefit.** Whether a tilt earns its cost needs a backtest on real data.

| Policy | One-way turnover / yr | Orders / yr | Cost (bps/yr) |
|---|---|---|---|
| Equal weight, rebalance every audit | 65.5% | 112.7 | 26.2 |
| Equal weight, 5pp / 25% band | **12.7%** | 8.5 | **5.1** |
| Momentum k = 0.5, rebalance every Friday, raw signals | 428.5% | 164.8 | 171.4 |
| Same, Friday **and** Monday both rebalance | 470.9% | 198.0 | 188.4 |
| k = 0.5, band, raw signals | 386.2% | 109.2 | 154.5 |
| k = 0.5, band, 1% hysteresis | 308.0% | 90.5 | 123.2 |
| k = 0.25, band, hysteresis | 148.8% | 86.0 | 59.5 |
| k = 0.25, band, hysteresis, 2pp max step per audit | **95.7%** | 60.7 | **38.3** |

The band alone cuts equal-weight cost 5×. A ±50% tilt on raw signals is not viable. A Monday rebalance adds +10% turnover and +17 bps/yr for no new information.

**T12 — Lot floor and re-trigger.** 4,000 retail-size portfolios (₹20k–₹500k), equal weight. Floor = multiple of one share's weight, never below the 0.5% minimum trade.

| Floor | Still triggers after rebalancing |
|---|---|
| None | 794 of 4,000 (19.9%) |
| 1× | 136 of 3,977 (3.4%) |
| 1.5× | 88 of 3,974 (2.2%) |
| **2× (chosen)** | **45 of 3,970 (1.1%)** |
| 3× | 38 of 3,968 (1.0%) |

A bigger floor stops helping near 1% because the rest comes from cash-limited buys and fees. The plan adds a residual-aware **cooldown** (§C4.3). The cooldown guarantees no re-trigger at unchanged prices by construction; it was not separately simulated.

### B5. Design-token audit

The source plan hardcodes hex values, names the system only as "the desk's design system", and leaves several tokens undefined. Contrast ratios are WCAG 2.x against the plan's `#090D14` background and `#121824` surface.

| ID | Sev | Finding | Fix |
|---|---|---|---|
| K1 | H | **"Balanced" slate `#64748B` fails AA** for text: 4.09:1 on background, 3.73:1 on surface (need 4.5:1). | Muted text token `#94A3B8` (7.59 / 6.93); keep slate for fills and icons only |
| K2 | H | **Red/green are not distinguishable by luminance** (`#EF4444` vs `#10B981` = 1.48:1). Colour-blind users cannot tell BUY from SELL. | Never colour alone: add `+` / `−` signs, ▲ / ▼ icons and the words BUY / SELL |
| K3 | H | **Semantic contradiction:** "Buy / Over-performance = green; Sell / Under-performance = red", but an overweight asset gets SELL. | Colour by order side only; drift column uses neutral over/under-weight markers |
| K4 | M | **Violet accent has no hex.** `#8B5CF6` gives only 4.20:1 on surface, so it fails as small text. | Fill `#8B5CF6`, text `#A78BFA` (6.53:1) |
| K5 | M | **Missing tokens:** warning/gate colour, stale-data colour, "current" vs "target" bar colours, score-band colours, focus ring, disabled state. | Defined in the table below |
| K6 | M | **Interactive boundaries too faint.** Border `#1E293B` is 1.21:1 on surface; fine for decoration, but sliders and inputs need ≥ 3:1. | `--border-control` `#64748B` (3.73:1) |
| K7 | M | **Font roles conflict:** "Outfit for headings *and metrics*" vs "monospace for all prices, shares, weights, drift". The score is a metric. | All numerals in IBM Plex Mono with tabular figures; Outfit for labels and headings only |
| K8 | M | **Fonts from a CDN** conflict with an offline-default desk. | Self-host with `font-display: swap` and system fallbacks |
| K9 | L | Hex values duplicated in prose. | Reference token names only |
| K10 | L | Dark theme only; no `prefers-contrast` handling. | State dark-only for v1 |

### B6. Self-audit — corrections to my first draft of this document

| # | Error in v1 of this document | Correction |
|---|---|---|
| 1 | Finding IDs (R1…) and test IDs (R-1…) collided. | Tests renamed T1–T12 |
| 2 | Types `MarketId`, `Preset`, `Order`, `Breach`, `GateFlag`, `GuardResult`, `AuditSnapshot` were used but undefined. | Defined in §C3 |
| 3 | Relative band could fire with no order produced (a 1% target drifting 0.3pp is under the 0.5% minimum trade). | Trigger floor is now `max(2 × one-share weight, 0.5%)` |
| 4 | Text said lot floor 2×, tests ran at 1×. | All rebalance tests re-run on the final rule |
| 5 | Idempotence baseline stated as 99.98%. | Re-run on the final rule: 0 of 4,986 |
| 6 | Guard abort rate presented as a clean 10.6%. | Marked as an upper bound (T10) |
| 7 | Position cap 25% is infeasible for fewer than 4 holdings. | Effective cap `max(25%, 1/N)`; fewer than 4 holdings always shows POSITION_CAP |
| 8 | Ceiling ignored gates. | Ceiling is gated like the score |
| 9 | Golden vectors rounded inconsistently (91.2, 88.6). | 91.25 and 88.63 |
| 10 | Snapshot retention "104 weekly" was ambiguous. | "Keep 2 years of snapshots" |
| 11 | Audit-cadence guard abort threshold and cooldown presented without stating what was simulated. | Stated in T10 and T12 |

### B7. Audit cadence and engine API findings

| ID | Sev | Finding | Fix |
|---|---|---|---|
| A1 | B | "Scheduled" audits need something that runs when the app is closed; the plan has only React state. | Backend job, or catch-up on open |
| A2 | H | "Friday close" assumes fixed times. NYSE 16:00 ET is **20:00 UTC** on 30 Oct but **21:00 UTC** on 6 Nov (US daylight saving ends 1 Nov). Friday 27 Nov 2026 follows US Thanksgiving and normally has a 13:00 ET early close (verify with the exchange calendar). Good Friday closes both NSE and US markets. | Exchange calendar |
| A3 | H | Crypto trades 24/7; no real Friday close or Monday open. | Documented convention |
| A4 | M | Friday and Monday audits are redundant if both rebalance (T11). | Monday re-validates only |
| A5 | M | "Simulation buttons" undefined. | In-memory price-shock scenarios |
| A6 | M | Snapshot schema, storage and retention undefined. | §C4.7 |
| A7 | L | Tab "badge indicator" undefined. | Count of out-of-band assets |
| E1 | H | Function signatures lack `cash`, `fees`, `config` and a clock; `runAuditRevision` has no quotes. | §C3 |
| E2 | M | No validation or error types (zero price, NaN, stale quote, empty holdings, Σ targets ≠ 1). | §C3 |
| E3 | M | No test plan or acceptance criteria. | Part D |

### B8. Not tested

- Real prices, signals or broker behaviour; the TypeScript implementation; the UI.
- Calibration. Constants marked *(proposed)* are my starting values and are config, not facts.
- Tax and brokerage in India, US or crypto venues.
- Whether a momentum tilt adds return.

---

## Part C — Implementation Plan

### C1. Overview

A **Rebalance** sub-tab in Portfolio that, for one market at a time:
1. measures drift against a saved target policy;
2. generates a safe, previewable batch of orders;
3. executes them in **paper mode by default**;
4. scores the portfolio and records scheduled and manual audit snapshots.

**Score meaning.** The Core Value Score measures conformance to the chosen policy plus basic portfolio quality. It does not predict performance. The UI always shows the score and its **ceiling** (the gated score of a zero-drift portfolio under current signals), for example "71 / ceiling 88".

### C2. Scope and decisions

| # | Decision | v1 choice | Why |
|---|---|---|---|
| D1 | Execution | Paper by default. Live only if a config flag is on, plus typed confirmation | R6 |
| D2 | Market scope | One market per session (Nifty 100, Crypto Majors, NASDAQ-100, Liquid ETFs). No cross-market universe | R9 |
| D3 | Universe | Held assets with qty > 0 in that market; no new names | R7 |
| D4 | Presets | Equal Weight, Market Cap (needs data, Q2), Momentum Tilt | — |
| D5 | Cash | Part of total value; per-market target cash % (default 0–2%) | S9 |
| D6 | Trigger | 5pp absolute or 25% relative band, plus lot floor and 0.5% minimum | R1, R12 |
| D7 | Audits | Read-only scoring and recommendation; audits never place orders | A4, R6 |
| D8 | Tax / brokerage | Not modelled; fee and slippage inputs only; UI warning | R13 |

### C3. Types and engine API

```ts
// src/types/rebalance.ts
type MarketId = 'NIFTY100' | 'CRYPTO_MAJORS' | 'NASDAQ100' | 'LIQUID_ETFS';
type Preset   = 'EQUAL' | 'MARKET_CAP' | 'MOMENTUM';
type AssetId  = string;
type Signal   = 'BUY' | 'NEUTRAL' | 'SELL' | 'NA';
type GateFlag = 'POSITION_CAP' | 'SELL_EXPOSURE' | 'SIGNAL_COVERAGE' | 'STALE_QUOTES' | 'NO_INVESTED_ASSETS';
type AuditEvent = 'FRIDAY_CLOSE' | 'MONDAY_OPEN' | 'MANUAL' | 'POST_EXECUTION' | 'SCENARIO';

interface RebalanceConfig {                 // versioned; its version is stored in every snapshot
  version: string;
  market: MarketId;
  scoreWeights: { drift: number; signal: number; conc: number };  // 0.40 / 0.35 / 0.25
  toMax: number;                            // 0.25 (proposed)
  signalMap: Record<Signal, number>;        // BUY 1, NEUTRAL 0.75, SELL 0, NA 0.75 (proposed)
  nRef: number;                             // 10 (proposed), per market
  gates: { positionCap: number; sellMax: number; coverageMin: number; cappedScore: number }; // 0.25, 0.40, 0.80, 60 (proposed)
  bands: { abs: number; rel: number; lotFloorMult: number; minTradePct: number };           // 0.05, 0.25, 2, 0.005
  costs: { feeBps: number; slipBps: number; minNotional: number; fractional: boolean };
  guard: { maxQuoteAgeSec: number; maxMovePct: number };            // maxMovePct default 1%, per market
  tilt: { k: number; hysteresisPct: number; maxStepPct: number };   // 0.25, 1%, 2pp (proposed)
}
interface TargetPolicy { id: string; preset: Preset | 'CUSTOM'; bps: Record<AssetId, number>; cashBps: number; savedAt: string }
interface Order        { assetId: AssetId; side: 'BUY' | 'SELL'; qty: number; refPrice: number }
interface Breach       { assetId: AssetId; drift: number; reason: 'ABS' | 'REL' }
interface RebalancePlan {
  planId: string; quotesAsOf: string; configVersion: string; policyId: string;
  triggered: boolean; orders: Order[]; netCash: number; estCost: number;
  residual: Record<AssetId, number>; flags: string[];
}
interface GuardResult  { ok: boolean; orders: Order[]; reason?: 'STALE_QUOTE' | 'PRICE_MOVE' | 'DUPLICATE_PLAN' | 'NO_CASH' }
interface ScoreResult  { total: number; ceiling: number; drift: number; signal: number; conc: number; gates: GateFlag[]; configVersion: string }
interface AuditSnapshot {
  id: string; event: AuditEvent; market: MarketId; runAt: string; scheduledFor?: string; late: boolean;
  quotesAsOf: string; configVersion: string; policyId: string; policyHash: string; inputsHash: string;
  score: number; ceiling: number; subScores: { drift: number; signal: number; conc: number };
  gates: GateFlag[]; breaches: Breach[]; planId?: string;
}
```

```ts
// src/lib/rebalance-engine.ts — pure functions: no I/O, no Date.now(); `now` is injected
computeWeights(holdings, cash, quotes): { w: Map<AssetId, number>; wCash: number; value: number }
computeModelTargets(assets, signals, mcaps, preset, cashBps, cfg): TargetPolicy
applySlider(policy, assetId, bps): TargetPolicy                  // largest remainder, Σ = 10000
evaluateTrigger(weights, policy, quotes, cfg, lastPlan?): { triggered: boolean; breaches: Breach[] }
computeRebalancePlan(holdings, cash, quotes, policy, cfg, force?): RebalancePlan
guardAndFinalize(plan, execQuotes, cash, executedPlanIds, cfg, now): GuardResult
calculatePortfolioScore(holdings, cash, quotes, signals, policy, cfg): ScoreResult
runAudit(event, inputs, cfg, now): AuditSnapshot                 // read-only
```
Validation: zero, negative or NaN price → asset excluded and `STALE_QUOTES`; Σ targets ≠ 10,000 bps → typed error; empty holdings → `NO_INVESTED_ASSETS`.

### C4. Rule specification

#### C4.1 Weights
`V = Σ qty·price + cash`; `w_i = qty_i·price_i / V`; `w_cash = cash / V`.

#### C4.2 Targets, sliders, policy
- Targets are integer **basis points**, Σ = 10,000 including cash.
- **Equal:** `(1 − cash) / N`. **Market cap:** proportional to cap. **Momentum:** weight ∝ `1 + k·s_i`, s = +1 / 0 / −1, k = 0.25 *(proposed)*.
- Per-asset cap is the **effective cap** `max(25%, 1/N)`, enforced by iterative redistribution. Portfolios with fewer than 4 holdings therefore always show `POSITION_CAP`.
- **Slider:** set one asset to x; others scale proportionally; if all others are zero, split the remainder equally; round with largest remainder.
- **Draft vs saved:** slider edits are a draft. Score and audits use the **saved policy** only. A saved custom policy is labelled `CUSTOM — not comparable to presets`.
- **Momentum signals** use 1% SMA hysteresis and a max target step of 2pp per asset per audit *(proposed; T11)*.

#### C4.3 Trigger rule
For each asset: `d = |w − t|`; `floor = max(lotFloorMult × price / V, minTradePct)` for whole-share markets (`lotFloorMult` = 2); `floor = minTradePct` for fractional markets.

An asset **breaches** if `d > floor` **and** (`d > 5pp` **or** (`t > 0` **and** `d / t > 25%`)). The plan is *triggered* if any asset breaches; otherwise every asset is `BALANCED` and no orders are produced.

**Cooldown.** After an executed batch, store each asset's residual `r_i`. While the policy is unchanged, a breach additionally requires `d_i > r_i + 1pp`. A manual "Force rebalance" bypasses it.

#### C4.4 Trade generation (when triggered)
1. `targetQty = t · V / price`; `Δ = targetQty − qty`.
2. **Sells:** round to the nearest whole share, never above holdings. **Buys:** round down. Fractional markets round to venue precision and respect `minNotional`.
3. Drop orders below `minTradePct` of V, except a full exit to a zero target.
4. `proceeds = Σ sell · price · (1 − fee − slip)`; `available = cash + proceeds`; `cost = Σ buy · price · (1 + fee + slip)`.
5. If `cost > available`, scale all buys by `available / cost` and round down. Cash never goes negative.
6. Execution order: **all sells, then all buys**.
7. The plan reports net cash, estimated cost, residual drift per asset and a lot-locked flag where one share exceeds 5pp.

#### C4.5 Execution protocol
1. **Preview** creates an immutable plan (`planId`, quote timestamps, config version).
2. **Confirm** dialog: orders, net cash, estimated cost, mode badge **PAPER** (or **LIVE**, which needs the config flag and typed confirmation).
3. **Guard at execute:** re-quote; abort if any quote is older than `maxQuoteAgeSec` or any *ordered* asset moved more than `maxMovePct`; otherwise re-price buys and scale down if cash is short.
4. **Idempotency:** a `planId` executes once; the button is disabled after the first click.
5. **Apply:** paper = atomic update of holdings and cash. Live = stop at the first failure, cancel remaining buys, report partial state.
6. **After:** write the executed-trade ledger and create a `POST_EXECUTION` snapshot.

#### C4.6 Score specification
Invested weights `u_i = w_i / Σw` (cash excluded from signal and concentration).

```
TO      = ½ ( Σ|w_i − t_i| + |w_cash − t_cash| )
Drift   = 100 · max(0, 1 − TO / toMax)                          toMax = 0.25
Signal  = 100 · Σ u_i · m(s_i)                                  BUY 1.0 · NEUTRAL 0.75 · SELL 0 · NA 0.75
Conc    = 100 · clip( (1 / Σu_i² − 1) / (nRef − 1), 0, 1 )      nRef = 10
Raw     = 0.40·Drift + 0.35·Signal + 0.25·Conc
Score   = Raw, or min(Raw, 60) if any gate is active
Ceiling = Score evaluated with w = t (gates applied)
```

**Gates** (cap at 60, flag shown): `POSITION_CAP` (max single invested weight > effective cap) · `SELL_EXPOSURE` (SELL weight > 40%) · `SIGNAL_COVERAGE` (< 80% of weight has a signal) · `STALE_QUOTES` · `NO_INVESTED_ASSETS`.

All constants are versioned config marked *(proposed)* and need calibration on real portfolios.

**Golden vectors** (10 equal names, on target, no cash, effective cap 25%):

| Case | Score |
|---|---|
| all BUY | 100.00 |
| 3 BUY / 5 NEUTRAL / 2 SELL | 88.63 |
| all NEUTRAL | 91.25 |
| all SELL | 60.00 (SELL_EXPOSURE) |
| no signal data | 60.00 (SIGNAL_COVERAGE) |
| single BUY name | 60.00 (POSITION_CAP) |
| all cash | 0.00 |

#### C4.7 Audit specification
- **Events:** `FRIDAY_CLOSE`, `MONDAY_OPEN`, `MANUAL`, `POST_EXECUTION`, `SCENARIO`. Scenario snapshots are flagged and excluded from the history chart.
- **Calendar:** "Friday close" is the close of the **last regular session of the ISO week** from a versioned exchange calendar (holidays, early closes), using IANA zones (`Asia/Kolkata`, `America/New_York`), never fixed UTC offsets.
  Test vectors: NYSE close = 20:00 UTC on 30 Oct 2026 and 21:00 UTC on 6 Nov 2026; NSE 15:30 IST = 11:00 Malta time on 6 Nov 2026.
- **Crypto:** no real close. Convention, configurable and labelled as a convention: Friday 21:00 UTC and Monday 00:00 UTC *(proposed)*.
- **Monday audit:** re-scores with opening quotes and flags any open Friday recommendation that the gap invalidated. It generates a new plan only if the normal trigger fires.
- **Scenario buttons:** apply a ±x% shock to selected quotes in memory; show the resulting score and plan; never touch holdings.
- **Scheduling:** needs a backend job (for example the existing Python backend). Without one, v1 runs **catch-up on app open**, stamped `late: true` with the actual quote time. It never back-fills with current prices labelled as the close.
- **Retention:** keep 2 years of snapshots; roll older ones into monthly summaries.

### C5. Design tokens and UX

#### Token table (dark theme only for v1)

Contrast is computed against `--bg` / `--surface`. "Fill" means a background or icon; "text" means readable copy.

| Token | Value | Role | Contrast on bg / surface |
|---|---|---|---|
| `--bg` | `#090D14` | page background | — |
| `--surface` | `#121824` | cards, tables | 1.10 vs bg |
| `--border` | `#1E293B` | decorative dividers | 1.33 / 1.21 (not for controls) |
| `--border-control` | `#64748B` | sliders, inputs, buttons | 4.09 / 3.73 (≥ 3 required) |
| `--text` | `#E2E8F0` | primary text | 15.78 / 14.41 |
| `--text-muted` | `#94A3B8` | secondary text, "Balanced" label | 7.59 / 6.93 |
| `--neutral` | `#64748B` | fills and icons only, never small text | 4.09 / 3.73 |
| `--buy` | `#10B981` | BUY orders, buy-side bars | 7.67 / 7.00 |
| `--sell` | `#EF4444` | SELL orders, sell-side bars | 5.17 / 4.72 |
| `--accent` | `#8B5CF6` | primary button fill, target markers *(proposed)* | 4.60 / 4.20 (fill only) |
| `--accent-text` | `#A78BFA` | accent as text *(proposed)* | 7.15 / 6.53 |
| `--warn` | `#F59E0B` | gate flags, stale quotes, PAPER/LIVE caution *(proposed)* | 9.06 / 8.27 |
| `--bar-current` | `--text-muted` | "current" allocation segment | — |
| `--bar-target` | `--accent` | "target" allocation segment | — |

Button labels: `--bg` on `--accent` fill = 4.60:1; `--bg` on `--buy` = 7.67; on `--sell` = 5.17. White on `--accent` is only 4.23, so do not use it.

Typography tokens: `--font-label` Outfit (labels, headings); `--font-num` IBM Plex Mono with `font-variant-numeric: tabular-nums` for **every** number, including the score. Both fonts self-hosted with system fallbacks.

#### Usage rules
1. **Colour is never the only signal.** BUY / SELL carry the words plus `▲` / `▼`; drift carries `+` / `−`; gates carry an icon and text.
2. **Colour by side, not performance.** BUY green, SELL red. Drift column uses `--text-muted` with over/under-weight markers.
3. Only `--text` and `--text-muted` are used for body text; `--neutral` never.
4. Score bands (labels *(proposed)*, uncalibrated): ≥ 85 Aligned, 70–85 Acceptable, 50–70 Drifting, < 50 Off-policy, each with text, not colour alone.
5. UI also shows: score with ceiling, sub-scores, active gate flags, config version, `DRAFT` and `CUSTOM — not comparable` marks, the PAPER / LIVE badge in `--warn`, lot-locked warnings, and a tab badge counting out-of-band assets (hidden at 0).

### C6. Architecture and files

```
src/types/rebalance.ts                    types (C3)
src/lib/rebalance-config.ts               per-market config, versioned
src/lib/rebalance-engine.ts               pure functions
src/lib/rebalance-calendar.ts             sessions, holidays, early closes, IANA zones
src/lib/rebalance-audit.ts                snapshot builder, catch-up logic
src/styles/desk-tokens.css                tokens from C5 (single source; no hex in components)
src/components/portfolio-rebalance-panel.tsx
src/components/portfolio-view.tsx         new sub-tab + badge
tests/rebalance/*.test.ts                 property, golden, fuzz, calendar, token contrast
```

### C7. Phases (effort in engineer-days; my estimates)

| Phase | Work | Days | Exit criteria |
|---|---|---|---|
| 0 | Spec freeze, config table, golden vectors, answers to Q1–Q7 | 1 | §C4 signed off |
| 1 | Engine: weights, targets, slider, trigger, plan | 3 | R-F1 to R-F6 pass |
| 2 | Score, gates, ceiling | 1.5 | S-P1 to S-P6 and golden vectors pass |
| 3 | Tokens + UI panel, sub-tab, badge, drafts | 3 | U-T1 to U-T4 pass; manual walkthrough of 5 flows |
| 4 | Execution protocol (paper), guard, ledger | 2 | R-F7 to R-F9 pass; double-click executes once |
| 5 | Calendar, audits, catch-up, scenarios | 3 | A-C1 to A-C5 pass |
| 6 | Hardening: stale quotes, error states, accessibility, perf with streaming quotes | 2 | No unhandled error states; panel renders in < 100 ms at 100 assets |
| 7 (optional) | Real-data backtest of tilt cost vs benefit | 2 | Report on offline sample data |
| **Total** | | **15.5 (+2)** | |

### C8. Risks

- Constants are uncalibrated; scores cluster (T3 spread 63–97), so band labels need real data.
- The momentum tilt may cost more than it earns; the simulation shows cost only.
- Signal quality for assets with short price history.
- Calendar tables need yearly maintenance.
- Live execution, if ever enabled, needs broker-specific partial-fill handling outside this plan.

---

## Part D — Test plan and acceptance criteria

| ID | Test | Threshold |
|---|---|---|
| S-P1 | Score in [0,100], NaN-free | 10,000 random cases, 0 failures (baseline 3,000 / 0) |
| S-P2 | Zero-drift portfolio → drift sub-score 100 | 0 failures |
| S-P3 | Drift monotone as weights blend toward target | 0 failures |
| S-P4 | Invariant to quantity scaling and asset order | 0 failures |
| S-P5 | Golden vectors (§C4.6) and gate vectors (T6) | exact to 0.01 |
| S-P6 | Draft slider edit does not change saved-policy score | exact |
| R-F1 | Cash ≥ 0 at every step of a sells-first batch | 0 of 5,000 |
| R-F2 | No negative quantity | 0 of 5,000 |
| R-F3 | Value conservation `V − V′ = (fee + slip) · traded` | 0 errors |
| R-F4 | Rebalancing never lowers the score | 0 of 5,000 |
| R-F5 | Re-run after execution yields no orders | 100% (baseline 0 re-triggers of 4,986 on portfolios ≥ ₹1L; 1.1% on ₹20k–₹500k before cooldown) |
| R-F6 | Slider output Σ = 10,000 bps | 0 of 3,000 failures |
| R-F7 | Guard leaves cash ≥ 0 under 0.4% price noise | 0 of 5,000 |
| R-F8 | Duplicate execute of one `planId` | executes once |
| R-F9 | Guard abort rate on a normal-volatility day | < 5% (baseline upper bound 10.6%, so tune `maxMovePct`) |
| R-F10 | Triggered plan always has at least one order | 0 empty triggered plans |
| A-C1 | NYSE close in UTC | 20:00 on 30 Oct 2026, 21:00 on 6 Nov 2026 |
| A-C2 | Holiday / Good Friday: "Friday close" = previous session | exact |
| A-C3 | Early-close day uses the early time | exact |
| A-C4 | Catch-up audit flagged `late`, never back-filled | exact |
| A-C5 | Scenario audit never mutates holdings | exact |
| U-T1 | All text tokens ≥ 4.5:1 on `--bg` and `--surface` | automated |
| U-T2 | Control boundaries ≥ 3:1 | automated |
| U-T3 | BUY / SELL, drift and gates readable in greyscale | visual check |
| U-T4 | No hex literals in components; all numerals use `--font-num` | lint rule |

---

## Part E — Open decisions

1. **Paper-only for v1, or is live execution in scope?** (D1)
2. **Market-cap data source** for Nifty 100, NASDAQ-100 and crypto, or drop the preset. (R8)
3. **Fees, slippage and minimum notional** per market. The model needs real numbers. (D8)
4. **A backend job for scheduled audits**, or accept catch-up on open? (C4.7)
5. **Crypto weekly convention:** keep Friday 21:00 UTC / Monday 00:00 UTC, or another?
6. **Should a market-cap-concentrated target be capped at 60 by the position gate,** or should the cap be per-preset? (T6)
7. **Calibration data:** a few real portfolio snapshots to tune `toMax`, the NEUTRAL weight, gate limits and score-band labels.
8. **Design system source:** is there a canonical token file (the plan only says "the desk's design system") so C5 can be reconciled with it rather than replacing it?
