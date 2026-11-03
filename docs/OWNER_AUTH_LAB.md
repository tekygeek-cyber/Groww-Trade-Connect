# Owner-only authentication lab: Step 1

Status: **foundation only**. Do not merge or deploy until separately reviewed and approved.

## Baseline audit

The current dashboard login is still tied to the Groww broker session:

- `src/App.tsx` opens the dashboard after `/api/auth/status`, which checks the Groww session.
- `src/components/login-screen.tsx` uses Groww API key, secret or TOTP as sign-in credentials.
- `server.ts` protects most private `/api/*` routes with `readSession()` from `server/groww-service.ts`.
- `server/groww-service.ts` stores an expiring Groww broker session on local disk. Its 06:00 IST expiry must **not** become the application identity expiry.
- `/?sample=true` and public demo endpoints can bypass the browser login. Private production mode needs an explicit access model for them.

## What Step 1 adds

- `server/owner-access-policy.mjs`: independent fail-closed authorization of a **trusted, already verified** identity object against a configured immutable ID. Email matching, client role claims and broker credentials never establish ownership.
- `netlify/functions/owner-session.mjs`: isolated Netlify Functions v2 GET endpoint `/api/owner/session`. It uses **Netlify private-project authenticated `context.user`**, not an untrusted request header or a Groww session. This endpoint has no effect on existing Express routes.
- `tests/owner-access-policy.test.mjs`: unit and isolated function tests for owner approval, missing owner configuration, unauthenticated requests, wrong-user denial, fake headers, GET-only behavior and no-store responses.
- The existing auth test command now includes these tests.

## Why there are two identity concepts

**Netlify private project access** authenticates a Netlify account and, on supported deployments, makes its verified account available through `context.user`.

**Netlify Identity** is separate and allows an application-specific sign-in. It uses `@netlify/identity` and server-side `getUser()`. A Netlify account ID and a Netlify Identity user ID are not interchangeable. If the final app uses Netlify Identity for the in-app login, the server-side owner guard must receive the user from the Identity SDK and compare it against a separately configured `OWNER_IDENTITY_USER_ID`.

Step 1 deliberately uses the first mechanism as a **minimal, testable, platform-authenticated owner gate**. It does not claim to complete the future application sign-in.

## Configuration needed for future protected preview, NOT now

1. Make the Netlify project and all Deploy Previews Private, and verify the access policy works for your account.
2. In a private server-side environment, set `OWNER_NETLIFY_USER_ID` to the trusted stable ID of your Netlify account. Do not guess the ID or use an email instead. Do not place it in `VITE_*` variables.
3. Deploy and inspect the Netlify context only after approval. This cannot be completely validated in the standalone Express test environment.
4. Confirm an unauthorized account cannot access private project routes and that the owner has access to `/api/owner/session`.

The owner ID is an identifier, not a password. It does not eliminate the need for private access and backend authorization.

## Next incremental steps

**Step 2: Application login with Netlify Identity**

- Configure Invite only in Netlify Identity.
- Install `@netlify/identity` with synchronized lockfiles.
- Use documented `login()`, `handleAuthCallback()`, `getUser()` and `logout()` flows.
- Verify the **Identity user ID** server-side with an independent owner policy; do not trust email or browser state alone.
- Add real login, logout, refresh, invite and expired-session tests in a protected Netlify Deploy Preview.
- Keep authentication requirements enforced on every protected backend function.

**Step 3: Broker separation**

- Refactor `/api/auth/status` to mean **application** identity, not Groww status.
- Move Groww login to a separately authenticated `/api/connections/groww` flow with durable encrypted credentials and read-only capability checks.
- Remove the Groww credential fields from the application login page.
- Update the frontend to open the desk with application identity and show disconnected broker state independently.
- Protect or remove anonymous sample-mode bypasses for private production.

**Step 4: Serverless storage, migration and deployed E2E tests**

- Replace existing filesystem/in-memory broker/session state with durable, appropriately secured storage.
- Migrate existing Express authorization checks to Netlify-compatible middleware/functions.
- Verify production and preview privacy; simulate 401/403 and ensure market research remains read-only.
- Build, run regression/security/browser suites and obtain explicit approval before merge or production deployment.

## Definition of done for Step 1

- [x] Branch created from a verified `main` commit.
- [x] Pure owner policy has no broker dependency.
- [x] Netlify owner-session endpoint uses trusted platform identity only.
- [x] Regression tests added to the existing auth test command.
- [ ] GitHub CI green on the feature branch.
- [ ] In-app login replaced. **Not in scope of Step 1.**
- [ ] Netlify private preview validated. **Requires approval and setup.**
- [ ] Merge into `main`. **Explicitly prohibited without owner approval.**
