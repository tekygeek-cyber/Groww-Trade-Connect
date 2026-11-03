# Groww Connect — Governed Agent Harness Implementation Blueprint

**Source of requirements:** [Full extracted HTML prompt](./prompts/Groww_Connect_One_Shot_AI_Harness.md) ([click-to-copy HTML](./prompts/Groww_Connect_One_Shot_AI_Harness.html)); [freeCodeCamp harness tutorial](https://www.freecodecamp.org/news/how-to-build-an-ai-agent-harness-from-scratch-in-typescript/).

**Baseline:** `main` at `374d7e52420ba3654efbe68482bc6ca2f61f083e`. This document is an engineering **target and gap analysis**, not an assertion of implementation or regulatory approval. The existing Ollama research harness is read-only; privileged broker mutations remain blocked by `server/security-policy.mjs`.

## 1. Executive architecture summary
Groww Connect monitors Crypto, NASDAQ and NSE, creates evidence-backed research and hypothetical trade proposals, and keeps the authority to approve and transmit orders entirely outside the LLM. Single governed harness and specialized *read-only* services share market normalization. **MVP: research and safe paper simulation, deterministic gate, append-only audit. Live trading: unavailable until later independent security, broker and compliance acceptance.**

Current: read-only Qwen3/Ollama adapter, bounded tool loop, sample-market quarantine, normal/AI UI toggle, basic risk-demo tool and single-user session. Missing: real source-specific snapshots, versioned Ajv validation, persistence, order-approval lifecycle, broker reconciliation and live permission boundaries.

## 2. Final ASCII architecture diagram
```text
React Desk (Normal Algo | AI Research) --authenticated--> REST API
                                                   |
                                            Task/Mode Router
                                                   |
                                     Single Bounded AI Harness
                                     |         |           |
                              Market Data    News*      Technical/Strategy*
                              read only      read only   read only
                                     \         |           /
                                      Research evidence and proposal
                                                   |
                                      Versioned deterministic risk gate
                         [Identity] [Eligibility] [Order] [Limits] [Compliance]
                                                   |
                                   +---------------+-------------+
                                   |                             |
                             PAPER (future)               LIVE (LOCKED)
                        separate sandbox ledger         approval workflow*
                                   |                2FA + human signature*
                             paper fill events                  |
                                   |                       broker adapter*
                                   +-------------+---------------+
                                                 |
                                        immutable audit + recon*
```
Asterisk: not implemented. No arrow directly connects an LLM to a broker. All strategy/account/platform kill switches are **mandatory before any execution integration**.

## 3. Component catalog
| Component | Responsibility / inputs → output | Fail behavior | Phase |
|---|---|---|---|
| Desk & router | Market, mode, user scope → bounded research job | stop / show N/A | MVP, exists partially |
| Identity & account | Session, account permission → authorized scope | deny | MVP; multi-account missing |
| Harness, adapter, registry | user task + safe data → model requests, validated results | deadline/step/tool-limit | MVP, exists partly |
| Ajv validator | immutable JSON schemas → all path/code validation errors | reject | MVP, **missing** |
| Normalized market data | sourced candles/quotes + freshness → typed instrument snapshots | unknown source = unavailable | MVP, partial |
| Deterministic risk gate | proposal, account, instrument, limits → PASS/REVIEW/BLOCK | BLOCK | MVP, **missing** |
| Paper ledger | approved paper intent → synthetic fills in isolated account | no partial unaudited mutation | MVP, **missing** |
| Audit store | ordered events → immutable chain, replay/export | stop changes on write failure | MVP, **missing** |
| Approval service | decision ID + user step-up → one-shot approval | never auto-approve | later |
| Broker and reconciliation | permission + approved intent → broker ID/acks/fills | stop + reconcile before retry | later |
| Incident/kill switch | strategy/account/platform state → abort queued actions | default blocked | MVP gate, later execution |
| Admin/notifications | status and approved compliance events → alerts | no implicit order changes | later |

## 4. Agent catalog
The orchestration layer **is not an agent swarm**. Every listed agent is a bounded research role with no secrets or write tools except future Execution Agent under deterministic rules.
| Role | Allowed outputs | Forbidden capabilities | Failure behavior |
|---|---|---|---|
| Market Data | source, timestamps, quotes, evidence | broker I/O | insufficient data |
| News/Sentiment* | attributed, dated event reports | scrape without license / orders | unverified |
| Fundamentals* | cited balance sheet, income, cash flow | made-up ratios | unavailable |
| Technical* | verified SMA/EMA/RSI/MACD from raw bars | pseudo-historical indicators | N/A |
| Portfolio/Risk* | descriptive exposure, drawdown hypotheses | final size/approval | N/A |
| Strategy* | thesis + proposed intent only | mutation / execution | no proposal |
| Execution* | accept gate-approved immutable intent | LLM discretion | refuse unless all gates hold |
| Research orchestrator | traceable composite research | credentials | abort |
The asterisk means not integrated as an independently verified service; the existing generic read-only tool surface covers only a subset.

## 5. Tool catalog
**Exists now:** `read_market_evidence`, `backtest_sma_rule`, `check_hypothetical_risk`, `execution_capabilities`; all are read-only. The backtest is explicitly illustrative and omits real trading costs. **Required future read-only tools:** get_crypto_quote, get_nasdaq_quote, get_nse_quote, get_candles, get_order_book, get_market_status, search_market_news, get_company_filings, get_crypto_events, get_income_statement, get_balance_sheet, get_cash_flow, get_key_ratios, calculate_sma/ema/rsi/macd/bollinger_bands, detect_support_resistance, get_portfolio, get_positions, get_open_orders, calculate_var/drawdown/exposure, run_backtest, generate_trade_thesis. Every provider must report its provenance and permissions. **Write tools must not be added to the model's registry.** Future paper/live execution services are separate API components.

## 6. Tool schemas
Use `{name,description,permission,allowedAgents,inputSchema,outputSchema,handler,timeoutMs,rateLimit,requiresApproval,audit}`. Names are snake_case, verb-first. Input and output schemas use draft-07, `type:object`, `additionalProperties:false`, typed enums, strict bounded lengths and numbers. Use **Ajv and ajv-formats**, `allErrors:true`, `strict:true`, no coercion, compile at startup, reuse the same compiled validators. Existing tool argument predicates must be migrated to Ajv **only with an atomically updated `bun.lock`** to preserve frozen installs. See [proposed order schema](./schemas/proposed-order.schema.json). Never treat model-provided JSON Schema as an executable validator.

## 7. Data flow
Example: *Analyze RELIANCE and propose a low-risk NSE entry.*
```json
{"userRequest":{"market":"NSE","symbol":"RELIANCE","intent":"RESEARCH"},
 "run":{"mode":"RESEARCH_ONLY","requestId":"uuid","maxTurns":4,"maxTools":8},
 "marketEvidence":{"source":"NSE_VERIFIED_REQUIRED","status":"UNAVAILABLE"},
 "research":{"signal":"NO_SIGNAL","reasonCodes":["MARKET_DATA_UNAVAILABLE"]},
 "proposedOrder":null,"gate":{"decision":"BLOCK","reasonCodes":["DATA_UNAVAILABLE"]},
 "brokerSubmission":null,"audit":{"runId":"uuid","state":"REJECTED_NO_DATA"}}
```
The present repo has **no verified NSE historical feed**. Thus RELIANCE must return NO SIGNAL, not a fabricated entry. In future, a valid verified proposal goes to a separate gate, then paper simulator; live requests go to an approval queue with a bound principal, OTP/step-up authentication, risk re-evaluation and one-use approval record before the broker.

## 8. Risk & Compliance Gate design
Five deterministic layers, always evaluated in order; each emits PASS/FAIL/SKIPPED, reason code, evidence snapshot hash, rule version and UTC timestamp.
1. **Identity:** principal, MFA for live, account ownership, scope and broker permission; fail `UNAUTHORIZED_ACCOUNT`.
2. **Market eligibility:** symbol, venue, calendar, halts, tradeability, circuit bands, corporate actions; fail `MARKET_CLOSED`, `HALTED`, `INSTRUMENT_RESTRICTED`.
3. **Order validation:** schema, side, type, quantity/precision/tick/lot/min size, time in force, signed request and duplicate ID; fail `INVALID_ORDER`, `DUPLICATE_REQUEST`.
4. **Financial controls:** buying power, order notional, per-symbol/market exposure, loss, drawdown, leverage, turnover/order-rate and open-order count; fail `INSUFFICIENT_CASH`, `LIMIT_EXCEEDED`.
5. **Compliance:** restricted lists, wash/self-trade surveillance, strategy/account/platform kill switch, jurisdiction & market-specific broker rules; fail `KILL_SWITCH_ACTIVE`, `SURVEILLANCE_REVIEW`.
Output `BLOCK` if any required evidence unavailable; `REVIEW` for any live order regardless of model confidence; `PASS` permits **paper only**; `PASS_WITH_LIMIT` must construct a new reduced candidate and re-run all checks.

## 9. Rule-engine validation specification
`validateRiskAndCompliance(order,instrument,account,limits): GateResult` is a pure computation given immutable data plus a separate approved identity/market/kill-switch snapshot. Do not substitute LLM text for these inputs. Use all-errors schema validation before business rules; deterministic reason codes; stable `ruleEngineVersion`; `auditId` generated by a separate trusted caller and included in the persisted decision. Invalid, missing, nonfinite or ambiguous values **return BLOCK**, never bypass. Precision uses integer minor units or an exact decimal library, not floating-point comparisons for settlements.

## 10. Complete TypeScript rule-engine code
**Not delivered in this documentation PR.** The HTML asks for Ajv v8, ajv-formats, and complete typed implementation. Existing project dependencies and frozen Bun lock do **not** include Ajv. A safe implementation must update code, `package.json`, `bun.lock`, unit tests and CI together, in a separate gate PR. No production claim or execution integration is permitted until that verification. Target modules: `src/services/risk-gate.ts`, `src/schemas/order.ts`, `src/services/approval-service.ts`, `tests/risk-gate.test.ts`. The source HTML remains intact as the complete coding specification.

## 11. Database and audit schema
Proposed PostgreSQL groups:
- Identity: `users,accounts,broker_connections` (encrypted secret references only).
- Markets: `instruments,market_snapshots` (source, as-of and version).
- Research: `ai_runs,agent_runs,tool_calls,research_reports` (inputs redacted, budgets and tool timings).
- Orders: `proposed_orders,risk_gate_decisions,approvals,paper_orders,live_orders,order_events,fills` (immutable intent hash, idempotency keys, ack state).
- Accounting: `positions,pnl_snapshots` (native currency and FX source per valuation).
- Governance: `audit_events,kill_switch_events,compliance_flags` (append-only write, hash chain, retention policy).
Each record needs opaque ID, UTC timestamps, account scope, provenance, rule/model/data versions, indexed foreign keys. Approval must bind to exact order hash, quantity, venue, expiry and single-use nonce. Use migrations, constraints, transaction isolation and backup restore tests before any broker integration.

## 12. API contract
Proposed only; **do not expose unimplemented endpoints**:
```
POST /api/ai/runs               research, authenticated; present route: POST /api/ai/research
GET  /api/ai/runs/:id           own run state and redacted trace
GET  /api/research/:id          signed research result
POST /api/proposed-orders       store intent only; never submit
POST /api/risk-gate/evaluate    deterministic decision, account-scoped
POST /api/paper-orders          future paper gate + atomic ledger
POST /api/approvals/:id/approve step-up authentication, single-use
POST /api/approvals/:id/reject  revoke intent
POST /api/orders/:id/cancel     broker-aware operation, no blind retries
GET  /api/accounts/:id/positions portfolio by owned account
GET  /api/orders               status, broker-ack and fill history
GET  /api/audit                privileged, filtered, paginated
POST /api/kill-switch          authorized emergency stop
```
Error contract: 400 invalid schema, 401 anonymous, 403 unauthorized scope, 409 duplicate/conflict, 422 blocked by deterministic gate, 429 rate limit, 503 dependency or safety stop. Every write requires principal, same-origin protection, CSRF mitigation where applicable, correlation ID and idempotency key.

## 13. Security and compliance controls
Per-account authentication and authorization, least privilege, secure secrets vault, key rotation, HTTPS, signed approvals, encrypted storage and redacted model context are required for production. Treat tool responses as untrusted prompt-injection surfaces; model never sees broker credentials. Enforce restricted provider usage and scraping licenses. Verify SEBI/NSE API/algo rules, US broker and exchange rules, EU/Malta obligations and MiCA applicability **with qualified counsel and the relevant service classification** rather than relying on generic implementation text. An LLM must not interpret compliance approval.

## 14. Observability and monitoring
Immutable, keyed event stream with `run_id,sequence,at,type,duration_ms,tool,reason_codes,rule_version`; redact PII, secrets, raw session cookies and account balances from model-facing logs. Capture genuine provider token usage where available; otherwise report `unknown` (not made-up cost). Instrument model latency, timeout/rate limit, tool-validation failures, gate blocks, approval wait, order acks/rejects, reconciliation gap, fill events, drawdowns and kill switches. Audit-write failure blocks any planned write action.

## 15. Testing plan
Use mocked LLM and broker, model schema fuzz cases, tool injection/unknown names, context trimming, oversized calls, timeouts, cancellation, malicious quote content, orphan tool results and observability callback failure. Gate matrix: missing/wrong schema, unknown account, stale quote, halted/closed/restricted market, invalid tick/lot/quantity, price-band breach, FX mismatch, notional/exposure/loss/turnover/leverage breaches, duplicate nonce, kill switch, unapproved and revoked live orders. Stress concurrent retries and crash recovery. No live dollars/rupees may be exposed in these tests. Unit success alone does not verify real broker behavior.

## 16. Repository reuse analysis
The **11 exact paths in the uploaded HTML are not valid at the current public root structure** of `Arindam200/awesome-ai-apps`: the repo now has `starter_ai_agents` with framework-based starters, and `advance_ai_agents` (not `advanced_ai_agents`) with different project names. Do **not** claim direct reuse or copy unreviewed code. Current visible alternatives:
| Actual project | Reuse / modify | Classification |
|---|---|---|
| `advanced_ai_agents/multi_agent_apps/trust_gated_agent_team` | Implemented 3-tier trust-gated agent team (`Market Research Analyst`, `Independent Risk Reviewer`, `Trust Gate & Compliance Synthesizer`), 0-100 deterministic trust scoring, Gold/Silver/Bronze tiers, and SHA-256 cryptographic audit chain (`server/ai/trust-gate.mjs`) | **IMPLEMENTED** |
| `advance_ai_agents/coding_agent_harness` | Human-gated proposed edits and sandboxed tests; **never** use its repo-write tools in the trading process | OPTIONAL for separate QA agent |
| `advance_ai_agents/flowsentinal_audittrail` | Visual workflow/audit trail concepts, adapt to own PostgreSQL event model | OPTIONAL |
| `advance_ai_agents/ai-hedgefund` | Read-only multi-source finance research service boundaries; avoid unverified autonomous trading and heavy orchestration | OPTIONAL, research only |
| `advance_ai_agents/finance_service_agent` | Service decomposition patterns subject to code/license review; Python runtime not needed in TS MVP | OPTIONAL |
| Self-evolving multi-agent trading workflows | Not compatible with immutable governance gate and approval requirements | NOT RECOMMENDED |
The freeCodeCamp companion harness provides the **REQUIRED architectural pattern** of tool admission, budgeting, context and failure testing; do not imply its code has been vendored.


## 17. Components NOT needed in version 1
Exclude autonomous live trading, self-evolving strategies, unrestricted scraping, LLM access to broker secrets, LLM final risk approval, agent swarms, social-sentiment orders, automated derivatives/leverage, fully autonomous portfolio rebalancing and wallet withdrawals. These bypass controllable audit and risk exposure, introduce weak source provenance or add unnecessary regulated functionality.

## 18. Phased implementation roadmap
| Phase | Deliverable | Acceptance gate | Current status |
|---|---|---|---|
| 0: preserve requirements | This prompt, architecture, issues, reviewable PR | exact source copied and gaps listed | in this PR |
| 1A: guarded research | Single Ollama harness + risk-neutral read-only tools | no model secrets/write calls; bounded tests | exists partially |
| 1B: fail-closed contracts | Ajv strict proposed-order schema, pure TS risk gate, immutable fixture snapshots | comprehensive failure-path and table tests; frozen lock | NOT BUILT |
| 1C: paper-only path | owner-scoped PostgreSQL state, idempotency, deterministic paper risk checks, append-only audit | reconciliation and concurrent retry tests | NOT BUILT |
| 2: beta approvals | step-up, signed approval, broker sandbox adapters, kill switches, source policy | regulator/broker validation and negative-path drill | NOT BUILT |
| 3: production consideration | approved live broker connections, reconciliation, uptime, disaster recovery, independent assessment | no critical defects, external approval, load and security testing | NOT BUILT |

## 19. Final paste-ready coding prompt
See [short implementation task prompt](./prompts/IMPLEMENTATION_PROMPT.md). Treat the full HTML as the specification and this blueprint as a **current-codebase implementation map**. Do not claim 100% production-ready without verified broker acknowledgements, authorization, reconciliation, risk-gate and compliance evidence.

---
**Version control:** Proposed changes via PR; no change in this documentation phase removes existing `server/security-policy.mjs` blocks. Keep `main` fail-closed for all live trading.
