# QA hardening — risk-gate reporting and mock-broker replay

Baseline: `main` at `4d85fda1ee5c016bc9e99bd592cfc425f5af0cda`.

**There were no failures in latest CI** (`41435885052`). This patch addresses two defects identified by targeted review that existing tests did not detect.

## Fixed

### 1. Cross-contaminated risk layer status
The gate previously used the cumulative `reasonCodes.length` to decide whether **each** layer failed. If identity failed and every subsequent check passed, the report falsely labelled the later layers as failures. The decision remained correctly BLOCK but the audit's explanation was misleading. The fix resets a `layerStart` counter for each independent layer; only new reasons emitted by that layer determine its PASS/FAIL. Early exits remain SKIPPED as before.

Also handles malformed `Date` evaluation times without trying to call `toISOString` on `Invalid Date`, returning a BLOCK with `INVALID_EVALUATION_TIME` rather than crashing the evaluator.

### 2. Mock-broker idempotency collision
The mock broker previously used only the request ID as a cache key, which would return the earlier ACK even if a retry carried a changed quantity, price, symbol, side or account. It now binds the original simulated request ID to a SHA-256 fingerprint of its complete order intent. Identical retries return the original ACK (including uncertain timeout state); conflicting retries throw `MOCK_IDEMPOTENCY_CONFLICT` without adding a second fill.

This is **test-contract safety**, not persistent broker idempotency across workers/processes.

## Test additions
- Independent statuses for identity, market, order, financial, compliance and execution layers even when other layers fail.
- Multiple simultaneous failures, with only matching layer labels flagged FAIL.
- Invalid evaluation Date fails closed without throwing.
- Duplicate mock request ID with modified price, quantity, symbol, side, account or market is rejected.
- Identical retry yields original partial ACK without re-simulation.

## Still blocked
No live Kraken orders, no production broker reconciliation, no Ajv dependency, no durable transactional audit, and no real Kraken credentials used. The earlier read-only `GetApiKeyInfo` card remains unchanged. Run full GitHub CI and browser smoke before merging.