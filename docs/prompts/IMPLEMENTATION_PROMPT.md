# Paste-ready implementation prompt — governed Groww Connect risk gate (phase 1B)

You are acting as a senior TypeScript engineer, financial-systems QA lead and security reviewer for **tekygeek-cyber/Groww-Trade-Connect**.

Read these files FIRST:
- `docs/prompts/Groww_Connect_One_Shot_AI_Harness.md` (exact user-provided master prompt)
- `docs/AI_HARNESS_ARCHITECTURE_BLUEPRINT.md` (mapping to this repository)
- `docs/schemas/proposed-order.schema.json` and `docs/schemas/tool-policy.schema.json`
- `server/ai/harness.mjs`, `server/ai/research-tools.mjs`, `server/ai/research-service.mjs`, `server/api-access.mjs` and `server/security-policy.mjs`
- Existing tests, CI workflow and `bun.lock`

**Goal:** deliver a deterministic, fail-closed, testable order-risk evaluation library for Crypto, NASDAQ and NSE, without exposing any new executable live or paper broker routes. Keep the existing Normal Algo / AI toggle working. The model must NEVER approve or execute a trade.

## Technology
Use Node.js, strict TypeScript, Ajv v8 and ajv-formats, JSON Schema draft-07, immutable typed snapshots and Node/Bun tests. Update `package.json` AND `bun.lock` together, preserving frozen-lockfile builds. Postgres + Docker migrations are **later tasks**; design interfaces now, but do not create a fake persistent database.

## First ten tasks
1. Review current repository (including changed main branch) and list known security boundaries.
2. Create a branch from the current `main`; propose a scoped PR, not an unreviewed push to `main`.
3. Add Ajv + ajv-formats to direct dependencies and update the frozen Bun lock atomically.
4. Define immutable TS types for Market, ProposedOrder, InstrumentSnapshot, AccountSnapshot, RiskLimits and GateResult. Map app `nifty` to canonical `NSE` only at a verified service boundary.
5. Compile strict Ajv schemas once at module initialization, with `allErrors:true`, `strict:true`, `additionalProperties:false`, no type coercion and no silent property removal. Return structured schema failures.
6. Implement `validateRiskAndCompliance(order,instrument,account,limits): GateResult` as deterministic pure code. Keep trusted caller identity, restricted lists, kill switches and duplicate IDs in separate immutable context passed by approved services—never trust unverified order fields as authorization.
7. Apply the five mandatory layers: identity, market/instrument eligibility, order shape/precision, exposure/cash/loss limits and compliance/kill switches. Any missing evidence, invalid quote/FX rate or unknown market session must BLOCK.
8. Distinguish PASS (paper-only), PASS_WITH_LIMIT (revalidate reduced intent), REVIEW (all live), BLOCK (no execution). Human approval must be one-time, order-hash-bound and not self-certified by AI.
9. Add test tables covering valid paper, invalid/unknown fields, missing permissions, duplicate IDs, restricted/halted/closed market, invalid lot/tick, price bands, cash/notional/leverage/drawdown/turnover limits, kill switches and live without approval. Include concurrency/replay and malformed input fuzz cases. Do not send any actual broker orders.
10. Update CI and `docs/AI_AGENT_HARNESS.md` with tested boundaries, benchmark/coverage results and an implementation report. Require independent review before any subsequent execution integration.

## Non-negotiable rules
- Current `server/security-policy.mjs` blocks on privileged endpoints remain active.
- No LLM tool receives `PAPER_WRITE` or `LIVE_WRITE` capabilities.
- No secrets or account tokens in model context.
- All proposed order decisions produce auditable deterministic codes; do not equate UI success with a broker fill.
- No fabricated NSE data, synthetic live prices, or implicit INR/USD/USDT conversions.
- Fail safely on invalid inputs and unavailable broker/compliance evidence.
- Never claim compliance with SEBI/NSE, MiCA or US broker rules without broker-specific and jurisdiction-specific verification.

## Definition of done
- PR includes source, real changed-file diffs, tests and honest risk assessment.
- `bun install --frozen-lockfile`, TypeScript typecheck, production build, existing unit and browser tests, newly added risk-gate tests **all green**.
- Every test result links to its actual GitHub Actions run.
- No new write/submit endpoint and no live trading flag is enabled.
- Reviewer can verify reasons for every BLOCK/REVIEW/PASS without relying on LLM text.
- Document remaining approval, audit-storage, FX and broker reconciliation gaps explicitly.

**Output:** A scoped PR and a short audit report. Do not rewrite the application into a framework-heavy multi-agent swarm. Stop after this risk-gate slice for review; the HTML master prompt describes subsequent phases.
