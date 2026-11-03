# Groww Trade Connect owner-authentication engineering lab

**Status: Step 2 implemented on a feature branch only. Not merged or deployed.**
This is an isolated application Identity implementation, not a claim that legacy Express APIs have migrated.

## The separation you are learning

1. **Netlify private-project access** is the outer site access control. `netlify/functions/owner-session.mjs` uses a verified Netlify team account from `context.user`, gated by `OWNER_NETLIFY_USER_ID`.
2. **Netlify Identity** is the new in-app authentication mechanism. `netlify/functions/identity-owner-session.mjs` uses `getUser()` from `@netlify/identity` and enforces the immutable **Identity user ID** from `OWNER_IDENTITY_USER_ID`. Identity IDs and Netlify team IDs are never interchangeable.
3. **Groww, Kraken and other brokers** are external connections, not an application identity. Their credentials should be managed only after app login, during Step 3.

## Step 1, already completed

- `server/owner-access-policy.mjs` denies missing configuration (503), no verified identity (401) and wrong identity (403).
- The Netlify private-site owner probe is `/api/owner/session`.
- `tests/owner-access-policy.test.mjs` verifies missing config, forged claims, owner matching and GET-only behavior.

## Step 2, implemented in this branch

- `@netlify/identity@2.0.0` is pinned in `package.json` with synchronized `bun.lock` and `package-lock.json`.
- `/api/identity/session` is a separate Netlify Functions v2 GET endpoint. It obtains the **verified Identity user** from the official server-side SDK; client-supplied IDs, claimed roles, emails, Groww sessions and headers cannot authenticate.
- `server/identity-owner-handler.mjs` makes backend authorization testable without Netlify credentials.
- `src/components/owner-identity-login.tsx` provides email/password sign-in, invite acceptance, password recovery and reset, logout, and separate authorized/unavailable/denied states. No Groww API keys are requested.
- All accepted sign-ins must pass the server endpoint's owner-ID check. An unauthorized authenticated Identity user is logged out from the lab.
- `src/App.tsx` renders the Identity lab at `/identity-lab` for UI smoke tests, or as the exclusive frontend when `VITE_OWNER_AUTH_LAB=true` is set for a controlled lab build.
- With `VITE_OWNER_AUTH_LAB=true`, the legacy Groww-backed dashboard is intentionally unavailable, even after an authorized sign-in. **Do not remove this barrier before Step 3 authorization migration.**
- `tests/identity-owner-handler.test.mjs` verifies owner success, denied/anonymous access, missing owner config, provider errors, header forgery and GET-only behavior. The existing CI also tests the legacy browser and private API regression paths.

## Required Netlify setup before ANY approved private preview

None of the following has been performed in this task.

1. Create/identify a Netlify project whose **production and preview visibility are Private**. Verify access is restricted to your Netlify account.
2. Enable Netlify Identity from the Netlify dashboard. Set **Registration → Invite only** and invite only the intended application owner. Do not enable public signup.
3. Complete the invitation via `handleAuthCallback()` and `acceptInvite()` in the new login UI.
4. Obtain the stable verified **Identity user ID** from trusted Netlify administration, not from a browser-provided field or guessed email. Configure `OWNER_IDENTITY_USER_ID` only in the server-side Netlify environment. It must be different in purpose from `OWNER_NETLIFY_USER_ID` for outer project access.
5. In a dedicated lab build, set `VITE_OWNER_AUTH_LAB=true` to replace the legacy app entry with the owner sign-in screen. **This is a public frontend feature flag, not a secret and not a security boundary.**
6. Verify the Netlify Functions v2 endpoint `/api/identity/session` actually receives Netlify Identity cookies on a protected deploy. Local isolated tests do not validate provider integration or email delivery.
7. Configure no real broker credentials and no private holdings in staging until deployed route isolation and data privacy are checked.
8. Keep `main` unchanged and require explicit approval to merge, publish or create a preview.

Netlify Identity is an external service. Login and email callback integration cannot be considered verified without an approved, protected Netlify deployment.

## Next required migration, Step 3

- Replace legacy `/api/auth/status` with application Identity status, not Groww token status.
- Migrate the Express `/api/*` session checks to a trusted Identity-aware backend or serverless function architecture.
- Protect every private route, including sample mode and personal portfolio data. A private site setting alone is insufficient.
- Move Groww login to an authenticated connection-management screen and encrypted durable credential store.
- Add real authenticated browser E2E tests for login, logout, refresh, expired sessions and denied users.
- Keep live broker execution disabled and preserve existing deterministic risk controls.

## Release blockers

- No Netlify project settings were changed.
- No application owner Identity user was created or invited.
- No Netlify Function was deployed or exercised with real Identity cookies.
- Existing Express private APIs remain broker-session guarded.
- No secure post-login broker credential vault exists yet.
- No merge into `main` was requested or performed.

See the feature-branch GitHub Actions workflow `owner-auth-lab-verify.yml` for the current TypeScript, build, unit, integration, HTTP and desktop/mobile smoke verification.
