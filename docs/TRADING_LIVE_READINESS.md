# Governed trading: production readiness status

**Commit series:** PRE risk-gate and mock trading rehearsal. Based on the [19-section master specification](./prompts/Groww_Connect_One_Shot_AI_Harness.md).

## Current operational boundary
- AI model: **read-only research only**; cannot submit paper or real orders.
- Normal Algo: existing simulations only; privileged trading mutations remain disabled by `server/security-policy.mjs`.
- Trading Rehearsal: deterministic scenario simulator using fictitious account balances, user-entered hypothetical prices and server-side mock-only audit.
- `LIVE` rehearsal mode means **test whether the gate blocks a live attempt**; it does **not** place live orders, create real positions, or act as a broker demo sandbox.
- `PASS` is not an order approval. It means only that an order fits the selected mock scenario's numerical rules.
- There is **no Ajv integration yet**. Validation currently uses strict manual typed checks and the proposed JSON Schema documents. Frozen Bun dependencies were not modified.

## 19-section coverage snapshot
| HTML section | Implemented now | Missing for real trading |
|---|---|---|
| 1 Executive summary | architecture and intended modes | audited release authorization |
| 2 ASCII diagram | blueprint | production topology |
| 3 Component catalog | runtime research, gate, rehearsal | Postgres/vault/approval/broker services |
| 4 Agent catalog | read-only harness | specialist verified research agents |
| 5 Tool catalog | existing four read-only tools | provider-backed trusted tool connectors |
| 6 Tool schemas | design JSON Schemas and manual checks | Ajv allErrors and output-schema enforcement |
| 7 Data flow | mock rehearsal pipeline | real broker/account snapshot capture |
| 8 Risk gate | seven checkpoints, numerical guardrails | full identity, source, jurisdiction and surveillance integration |
| 9 Rule engine validation | typed fail-closed inputs | canonical validator and exact money handling |
| 10 TS rule engine | `server/trading/risk-gate.ts` | independent penetration and property-based reviews |
| 11 Database/audit schema | local hash-chained rehearsal log | multi-process immutable Postgres event storage |
| 12 API | session-bound rehearsal + audit | approval, paper order store and broker routes |
| 13 Security & compliance | current cookie and kill-switch mock gates | vault, RBAC, MFA, regulated activity review |
| 14 Observability | read-only agent trace and rehearsal audit | durable metrics and distributed traces |
| 15 Tests | automated gate and UI/API regression | real provider certification, fault injection and load |
| 16 Reuse analysis | blueprint analysis of public examples | license/code integration due diligence |
| 17 Exclusions | live and autonomous writes blocked | maintain per-release explicit denial |
| 18 Roadmap | phase-by-phase blueprint | verified phase acceptance and controls |
| 19 Implementation prompt | in `docs/prompts/IMPLEMENTATION_PROMPT.md` | tracked implementation PRs |

## Secure broker onboarding: no chat secrets

Do not send a password, TOTP seed, broker API key, token or recovery code via ChatGPT, GitHub issues/PRs or model prompts. The login card on the *trusted application deployment* can send temporary credentials to the app server over HTTPS, but this alone does not constitute a production-grade secret vault.

**Groww (NSE equities):** [Official Groww API docs](https://groww.in/trade-api/docs/curl) specify an active trading API subscription, daily approved API-key/secret checksum or six-digit TOTP, token expiry at 06:00 IST, and a token endpoint `POST https://api.groww.in/v1/token/api/access`. Updated source now uses that documented request contract. Mocked tests pass, **live provider authentication untested**. Tokens are stored in restricted local server file for single-user sessions; migrate to encrypted vault before broader deployment.

**eToro (demo):** [Official builder docs](https://builders.etoro.com/products/trading) describe separate demo/live environments. For meaningful integration testing, prefer a user-authorized eToro **demo** account, scoped keys stored in a vault, no model access. Do not interchange demo and real endpoints. Current repo has no verified eToro API adapter.

**Kraken:** [Official API docs](https://www.kraken.com/pro/trading-api). Kraken futures demos differ from Kraken spot trading; the repo has no certified real-money adapter.

## Required sign-off before first real-money API request

1. Decide the specific broker, account, market, segment and whether a true provider sandbox/demo exists.
2. Verify current broker documentation, jurisdiction, applicable API permissions/subscription and security policy.
3. Replace single-tenant session and local secret file with approved vault, server-side RBAC and explicit broker OAuth/key authorization.
4. Populate non-synthetic verified quotes, market calendars and instrument constraints, broker-reported cash, positions and order state.
5. Add frozen-lock Ajv schema validation, exact decimal financial arithmetic, step-up MFA, per-account approval nonce and hard kill switches.
6. Implement idempotent broker adapter; reconcile every order acknowledgement, partial fill, rejection, cancellation, timeout and retry.
7. Back all decisions with a durable transactional append-only audit log and replay tests; verify fail-closed recovery.
8. Run official demo/sandbox first with explicit user authorization. Only after independent review consider a minimal **human-approved** real order.

**This build satisfies NONE of the conditions needed to enable live broker writes.**
