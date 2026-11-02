# Kraken Integration — November 2026

## Current provider availability

**Kraken Futures:** Kraken's official API Testing Environment article, updated 29 October 2026, states that its **public Futures demo environment at `demo-futures.kraken.com` was decommissioned on 14 July**. Qualified API testing now requires onboarding through Kraken's API team. The same page retains older signup instructions, so treat those as obsolete until Kraken explicitly grants new access. Do **not** direct users to obtain keys from the retired public demo or assume that tests on its hostname are meaningful.

Source: https://support.kraken.com/articles/360024809011-api-testing-environment-derivatives

**Kraken Spot:** Kraken offers no generally available self-service simulated-money Spot trading environment in the currently documented API flow. Its official API FAQ explains the Spot **AddOrder `validate=true`** option: this checks order construction without returning an order ID; it does not test matching, fills, balances or cancellation. This application **does not call AddOrder at all**.

Source: https://support.kraken.com/articles/advanced-api-faq

## Built in this release

- New **Kraken Spot · API security check** card on the application login screen.
- A single manual **one-time read-only key verification** using only `POST https://api.kraken.com/0/private/GetApiKeyInfo`.
- Correct Kraken Spot HMAC-SHA512 request signature and monotonically increasing nonce; endpoint and origin hard-coded; no caller-controlled target URI.
- The returned key permissions are checked against a strict read-only allowlist. Any order modify, cancel, withdrawal, deposit, transfer, earn or unknown permission fails.
- Credentials are cleared from the browser after submitting, are not persisted in localStorage, the server filesystem, GitHub or any model context, and are not retained as a session.
- Matching-origin protection, production HTTPS requirement, request count limits and redacted provider failures.
- Offline tests for malformed keys, unknown scopes, leaked fields, signature, nonce, provider errors and source access control.
- **No trading connection is established.** A green result means only that Kraken recognized the key and reported no forbidden permissions.

**No Kraken credentials were requested or used during implementation or CI.**

## Safe verification process

1. Use your genuine [Kraken account API key controls](https://support.kraken.com/articles/360000919966-how-to-create-an-api-key) to generate a new **Spot read-only** key, with only the minimum Query permissions needed. Explicitly disable orders, cancellations, withdrawals, deposits, transfers and Earn. Prefer source-IP restrictions if available.
2. Open your personally verified **HTTPS deployment** of Groww Trade Connect (not a preview or untrusted clone). The existing login screen includes the Kraken diagnostic card; no Groww credentials are needed for the one-time check.
3. Expand **Verify read-only key**, enter the key and secret directly into this card, and click **Verify once**. If the API key has an API-specific 2FA challenge, the optional one-time code can be entered there. **Never paste keys or TOTP seeds into ChatGPT, GitHub, issues, browser console, email or screenshots.**
4. The server contacts Kraken using the exact `GetApiKeyInfo` endpoint and checks the permissions. It then discards the credentials. The UI shows a stripped-down result without balances, account identifiers or token material.
5. A failed verification is not a reason to grant more permissions to this key. Check the key's IP restriction, token validity or the API documentation first.

## Why this is not a secure credential vault

This first card supports transient **one-shot** credential diagnostics. It does **not** establish a durable authenticated Kraken session and is not a vault. Verification is initiated from the application server and requires that server's network reach Kraken. Keys remain briefly in process memory while being signed and transmitted; no application should claim this process is zero-exposure.

Before offering persistent read-only account access, implement real application identity distinct from Groww, vault-backed key encryption and rotation, per-user session scoping, per-key nonce persistence and explicit authorization to query balances. Keep withdrawal/order permissions disabled.

## Trading scope

| Activity | Available now | Caveat |
|---|---|---|
| Mock Kraken order lifecycle | Yes | Deterministic local simulation, never broker API |
| Public Spot data | Existing app source-specific market feed | Source may be delayed or unavailable |
| One-time read-only Spot API key permission diagnostic | Yes, user-initiated | Calls live **read-only** `GetApiKeyInfo` only |
| Qualified Futures demo testing | No | Requires Kraken API-team onboarding |
| Spot AddOrder `validate=true` | No | Needs separately reviewed flow with explicit user approval |
| Real order placement, cancel, transfers and withdrawal | **No** | Privileged endpoints remain blocked |

### References
- [Kraken API Testing Environment — 29 Oct 2026](https://support.kraken.com/articles/360024809011-api-testing-environment-derivatives)
- [Kraken Advanced API FAQ — test environment and validate parameter](https://support.kraken.com/articles/advanced-api-faq)
- [Kraken Spot REST Authentication](https://docs.kraken.com/api/docs/guides/spot-rest-auth/)
- [Kraken Get API Key Info permissions](https://docs.kraken.com/api/docs/rest-api/get-api-key-info)
