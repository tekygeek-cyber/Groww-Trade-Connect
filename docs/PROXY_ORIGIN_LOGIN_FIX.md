# Fix: "A matching request Origin is required" when entering an API key

## Diagnosis

This HTTP 403 comes from the **Groww Trade Connect server's same-origin guard**, before any Groww or Kraken API authentication is attempted. It does **not** indicate an invalid API key.

When the app runs behind a reverse proxy, the browser sends e.g.:

```http
Origin: https://desk.example.com
Host: private-node-service:3000
```

The old guard required these hosts to match and rejected legitimate browser requests. It worked locally because both were `localhost:3000`. The new guard compares the browser Origin against **one trusted public deployment origin**, supplied by configuration, regardless of the internal upstream Host.

## Production deployment configuration

Set this environment variable **on the Node/Express hosting service** (not in Vite build-time client variables):

```dotenv
APP_PUBLIC_ORIGIN=https://YOUR-EXACT-PUBLIC-APP-HOST
NODE_ENV=production
```

Use the exact public HTTPS origin **from your browser address bar**: scheme + hostname + non-default port (if any), **no trailing slash, path, query, fragments, wildcard, comma-separated list or API key**. Restart/redeploy the backend after changing environment variables.

If `APP_PUBLIC_ORIGIN` is not set, the app will use an already valid absolute `APP_URL` if the host injects it; otherwise, it retains strict direct `Host` matching for local deployments. An invalid explicit `APP_PUBLIC_ORIGIN` is denied, not ignored. Never use `*` or trust user-supplied `X-Forwarded-Host` to bypass this check.

## Verification without secrets

**Before re-entering credentials**, an administrator can test from a terminal (using the correct public URL):

```bash
curl -i -X POST "https://YOUR-EXACT-PUBLIC-APP-HOST/api/kraken/check-readonly" \
  -H 'Content-Type: application/json' -d '{}'
```

This request does not include an `Origin` and **should return HTTP 403**; that is intentional CSRF protection. To test the configured browser origin, send:

```bash
curl -i -X POST "https://YOUR-EXACT-PUBLIC-APP-HOST/api/kraken/check-readonly" \
  -H "Origin: https://YOUR-EXACT-PUBLIC-APP-HOST" \
  -H 'Content-Type: application/json' -d '{}'
```

This deliberately malformed request should return **HTTP 400** (`INVALID_KRAKEN_CREDENTIAL_FORMAT`) rather than 403. It confirms that the same-origin guard accepted the legitimate public URL; it does **not** contact Kraken or require keys. A request with `Origin: https://untrusted.example` must still return 403.

The same common guard protects Groww login and Kraken key checks.

## Security invariants and deployment scope

- Cross-site, missing, null, downgraded HTTP, wildcard, malformed and credential-bearing Origins are rejected.
- A configured public origin is the *only* accepted Origin, even if an attacker manipulates the Host header.
- No `Access-Control-Allow-Origin: *`, no global CORS middleware, and no blind trust of `X-Forwarded-Host`.
- Session cookie remains `HttpOnly; SameSite=Strict; Secure` in production; privileged trading mutations remain disabled.
- Use **HTTPS on the actual public site** and do not paste API credentials into chats, GitHub issues or logs.
- If the frontend and backend have different public domains, this same-origin app needs a proper same-site reverse proxy or a separately security-reviewed deployment architecture; do **not** add arbitrary domains to bypass the check.

## Regression tests

- `tests/session-policy.test.mjs`: exact configured origin, proxy Host mismatch and hostile inputs.
- `tests/proxy-origin-smoke.mjs`: real compiled production server run with a private upstream hostname; valid HTTPS origin advances to body validation, but cross-site/missing origins still receive HTTP 403.
- Full GitHub CI including frontend build, authentication, browser and compiled server smoke.

**No broker credentials are needed to test this fix.**
