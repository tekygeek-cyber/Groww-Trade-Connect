# Groww Connect — Agent Capability Harness Specification (`agent.md`)

This document defines the agent architecture, capability boundaries, tool bindings, and execution contracts for Groww Connect's AI capability harness. It specifies how the four foundational starter agents from `awesome-ai-apps` are integrated alongside the governed 3-tier Trust-Gated Agent Team.

---

## 1. Overview & Architecture Taxonomy

Groww Connect integrates AI agents within a **governed, bounded, read-only harness** following the [freeCodeCamp agent harness architecture](https://www.freecodecamp.org/news/how-to-build-an-ai-agent-harness-from-scratch-in-typescript/). All agents operate strictly under the server's control:

```
[ User Desk / Research UI ]
             │
             ▼
[ Security & CSRF Policy Gate ] (server/session-policy.mjs)
             │
             ▼
[ Governed AI Capability Harness ] (server/ai/harness.mjs)
             │
 ┌───────────┼──────────────────────────────────┐
 │           │                                  │
 ▼           ▼                                  ▼
Tier 1:      Tier 2:                            Tier 3:
Market       Independent                        Trust Gate &
Research     Risk Reviewer                      Compliance Synthesizer
Analyst      (Hypothesis Critic)                (Policy Clearance)
 │           │                                  │
 └───────────┼──────────────────────────────────┘
             ▼
[ Deterministic Trust Scoring & SHA-256 Hash Chain ] (server/ai/trust-gate.mjs)
             │
             ▼
[ Immutable Audit Record ] ── (Live/Paper Execution Strictly Quarantine-Blocked)
```

### Core Safety Invariants
1. **Zero Broker Mutation:** No model context ever receives broker credentials, tokens, or write endpoints.
2. **Deterministic Risk Gates:** AI confidence scores never replace mathematical risk boundaries.
3. **Execution Quarantine:** Live and paper order capabilities are fail-closed and locked.
4. **Governed Web Ingestion:** Raw, arbitrary web scraping is prohibited; all external intelligence passes through sanitized, attributed desk APIs.
5. **Cryptographic Audit Chain:** Every agent transition generates a tamper-evident SHA-256 block.

---

## 2. Starter Agent Catalog & Harness Integration

The four starter agent patterns from `awesome-ai-apps` are harmonized into the Groww Connect runtime:

| Starter Pattern | Catalog ID | Harness Role | Tool Bindings | Fail-Closed Policy |
|---|---|---|---|---|
| `starter_ai_agents/ai_data_analysis_agent` | `ai_data_analysis` | Quantitative Time-Series & Statistical Engine | `read_market_evidence`, `backtest_sma_rule` | Rejects synthetic/stale candles ($>8$ days old, $<55$ bars) |
| `starter_ai_agents/xai_finance_agent` | `xai_finance` | Cross-Market Pricing & Risk Limits Inspector | `check_hypothetical_risk`, `execution_capabilities` | Enforces $\le 30\%$ single-asset and $\le 1.5\%$ stop-loss limits |
| `starter_ai_agents/openai_research_agent` | `openai_research` | Structured Thesis & Multi-Source Synthesizer | Evaluates verified JSON evidence (Tool-free) | Suppresses output if any required evidence check fails |
| `starter_ai_agents/web_scraping_ai_agent` | `web_scraping` | Governed News Tape & Search Ingestion | `read_market_intelligence` | Replaces raw scraping with sanitized, cached desk tape |

---

### 2.1. `starter_ai_agents/ai_data_analysis_agent`
* **Purpose:** Computes verified time-series analytics, moving average crossovers, and candle statistics directly from verified market providers (Kraken, Binance, Stooq, Yahoo Finance).
* **Bound Tools:**
  * `read_market_evidence`: Extracts completed daily closing prices, 20-day SMA, 50-day SMA, and 1-day percentage changes. Excludes unverified or in-progress bars.
  * `backtest_sma_rule`: Deterministic historical 20/50 SMA walk with lookback bounds between 55 and 120 bars. Explicitly notes that backtests are illustrative and omit execution friction.
* **Constraints:**
  * Requires at least 55 complete historical daily bars.
  * Maximum age: 3 days for Crypto, 8 days for Equities/ETFs.
  * Model cannot extrapolate or invent missing historical dates.

---

### 2.2. `starter_ai_agents/xai_finance_agent`
* **Purpose:** Evaluates financial instrument viability, multi-market quote normalization (NSE, NASDAQ, Crypto, ETFs), and deterministic hypothetical risk limits.
* **Bound Tools:**
  * `check_hypothetical_risk`: Tests proposed allocation and stop-loss percentages.
    $$\text{Risk at Stop} = \frac{\text{Allocation \%} \times \text{Stop Loss \%}}{100}$$
    Returns `WITHIN_ILLUSTRATIVE_LIMITS` only if $\text{Allocation} \le 30\%$ and $\text{Risk at Stop} \le 1.5\%$. Otherwise returns `BLOCKED_BY_ILLUSTRATIVE_LIMITS`.
  * `execution_capabilities`: Clarifies that all live and paper trade capabilities are disabled in the AI context.
* **Constraints:**
  * Rejects non-finite, negative, or $>100\%$ inputs.
  * Does not access private account balances or purchasing power.

---

### 2.3. `starter_ai_agents/openai_research_agent`
* **Purpose:** Acts as the independent research reviewer and structured thesis synthesizer.
* **Workflow:**
  * Receives strictly sanitized JSON tool evidence from Tier 1.
  * Has zero tool-execution rights (preventing recursive or privilege-escalating tool calls).
  * Evaluates evidence grounding: verifies that claims cite actual numbers returned by the data analysis and finance tools.
  * Outputs standardized verdicts: `WATCH`, `REVIEW`, or `NO SIGNAL`. Never produces a `BUY` or `SELL` instruction.
* **Constraints:**
  * Budget: 1 model step, 0 tool calls, max 12,000 characters context.

---

### 2.4. `starter_ai_agents/web_scraping_ai_agent`
* **Purpose:** Provides governed market news, macro intelligence, and sentiment context.
* **Anti-Scraping & Injection Quarantine Policy:**
  * **No Raw Scraping:** Traditional autonomous web scraping poses severe prompt injection risks, stale DOM parsing failures, and licensing violations.
  * **Governed Adapter:** Replaced with server-side proxy routes backed by Google Search Grounded Gemini API and internal desk intelligence tapes (`server/news-service.ts`).
  * **Sanitization:** All news titles, publishers, and timestamps are stripped of executable scripts, prompt-injection markers, and truncated to safe character limits before model exposure.
* **Bound Tool:**
  * `read_market_intelligence`: Returns verified market tape highlights, sentiment orientation, and attribution metadata.

---

## 3. Trust-Gated Multi-Agent Collaboration (`trust_gated_agent_team`)

The four starter capabilities feed into a 3-tier trust-gated pipeline:

```
[ Tier 1: Analyst ]  ──►  [ Tier 2: Risk Critic ]  ──►  [ Tier 3: Trust Gatekeeper ]
(Data Analysis +          (Thesis Evaluation)            (Policy Inspection +
 Finance + Ingestion)                                     SHA-256 Chain Verification)
```

### Trust Metrics Specification (0–100 Scale)
1. **Evidence Grounding (35 pts):** All 4 required tools executed with valid parameters.
2. **Data Provenance & Freshness (25 pts):** Source is an authorized provider with $\ge 55$ bars and non-stale timestamps.
3. **Risk Boundary Compliance (20 pts):** Proposed hypothetical limits pass deterministic risk checks.
4. **Execution Quarantine (20 pts):** Verified read-only status; live & paper orders locked.

### Tiers & Decisions
* **GOLD TIER ($\ge 85$ pts):** 100% evidence verified, risk limits fully respected $\rightarrow$ `TRUST_APPROVED`.
* **SILVER TIER ($70\text{--}84$ pts):** Sufficient evidence, minor caveats or risk warnings $\rightarrow$ `TRUST_APPROVED` or `TRUST_FLAGGED`.
* **BRONZE TIER ($< 70$ pts):** Incomplete evidence, stale history, or boundary breach $\rightarrow$ `TRUST_BLOCKED`.

### SHA-256 Cryptographic Audit Chain
Each execution stage creates a linked block:
$$\text{Block Hash} = \text{SHA-256}(\text{Index} \parallel \text{Previous Hash} \parallel \text{Agent} \parallel \text{Event Type} \parallel \text{Payload Hash})$$
* **Block #0:** `GENESIS` (Session ID, Market, Symbol, Protocol Version)
* **Block #1:** `EVIDENCE_COLLECTED` (Analyst tools, bars count, close price)
* **Block #2:** `RISK_EVALUATION` (Risk review verdict, signal status)
* **Block #3:** `TRUST_GATE_DECISION` (Trust score, tier, policy clearance)

---

## 4. Model Provider & API Configuration

* **Local Ollama Integration:**
  * URL: Server loopback `http://127.0.0.1:11434` (Strictly forbids external or user-selected endpoints).
  * Default Model: `qwen3:4b` (pull via `ollama pull qwen3:4b`).
  * Timeout: 45,000 ms per step; rate-limited to 1 request per session per 30 seconds.
* **Server-Side Gemini Fallback:**
  * Model: `gemini-2.5-flash` via `@google/genai` SDK.
  * Proxied server-side for market news intelligence with 5-minute backoff rate limiting.
  * No client-side exposure of API keys.

---

## 5. File & Module Map

| File Path | Responsibility |
|---|---|
| `/agent.md` | Primary specification and capability matrix (this document) |
| `/server/ai/agents.mjs` | Agent prompts, capability metadata, and starter agent catalog |
| `/server/ai/trust-gate.mjs` | Multi-factor trust scoring, tier determination, and SHA-256 hash-chain engine |
| `/server/ai/research-tools.mjs` | Bounded read-only tool implementations with parameter validation |
| `/server/ai/research-service.mjs` | 3-tier trust-gated agent orchestration and rate-limiting |
| `/server/ai/harness.mjs` | Core bounded harness loop, context windowing, event streaming |
| `/server/ai/ollama.mjs` | Loopback Ollama adapter with health checking |
| `/src/components/ai-mode-panel.tsx` | Trust-Gated Agent Team UI, score gauge, checks matrix, and chain drawer |
| `/tests/ai-harness.test.mjs` | 17 automated tests verifying harness safety, trust scores, and tamper detection |
