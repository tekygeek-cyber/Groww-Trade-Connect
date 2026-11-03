# Owner Identity, backend authorization and broker credential security

Branch: feature/owner-only-auth-foundation-20261103. **No production deployment, preview or merge authorized.**

## Security boundary

- Outer access: Netlify team-login protection (already enabled on \`growwtrade\`).
- Application: Netlify Identity \`getUser()\` verified **server-side on every private request**. Its immutable \`user.id\` is matched against a configured owner ID. A matching email, request header, browser flag or broker access token cannot grant application access.
- Existing environment key: \`OWNER_IDENTITY_SUB\`. Previous lab key: \`OWNER_IDENTITY_USER_ID\`. The server accepts either, but if both are present with different values it **fails closed (503)**. \`OWNER_EMAIL\` is informational and is **not** authorization.
- Owner identity endpoint: \`/api/identity/session\`. New owner workspace endpoints: \`/api/app/profile\`, \`/api/app/connections\`, \`/api/app/capabilities\`. These are **read-only** and all require independently verified Netlify Identity.
- Legacy Node/Express server and its historical Groww login remain isolated. \`VITE_OWNER_AUTH_LAB=true\` hides the old dashboard. This frontend flag is never an authorization boundary.
- Never merge the app and broker sessions. Groww token expiration (06:00 IST) may disconnect Groww; it must not sign the owner out of the app.
- The owner-only workspace deliberately reports \`not_migrated\` for Groww/Kraken/eToro; **do not interpret this as live broker connectivity status**.

## Identity dashboard setup — manual only (no public API)

Open https://app.netlify.com/projects/growwtrade/identity

1. Enable Identity and choose **Invite only** registration. Public signup must stay off.
2. Invite only the intended app owner. Use the Identity invitation flow and confirm the account.
3. Confirm the owner Identity user ID is equal to the existing \`OWNER_IDENTITY_SUB\` value; do **not** substitute your Netlify team account ID or email.
4. Check the Netlify environment variable is enabled for **Functions** in the intended context.
5. Keep team-login protection on for **production and previews**; note the team-login session and Identity session are unrelated, so this is a double login.
6. Passwords, confirmation and recovery tokens are handled by the Identity SDK, not custom local storage or a hand-made login server.
7. **Do not** invite extra users or deploy the branch without approval.

Identity configuration and real invitation/login/email flows **cannot be confirmed programmatically** through the supported Netlify connector. They require the dashboard and an approved protected deploy.

## Future broker-credential vault (code foundation, NOT active)

\`server/broker-credential-envelope.mjs\` implements authenticated AES-256-GCM encryption of broker secrets on the server:
- Random 96-bit IV per write.
- Server-only 32-byte base64 master key (proposed name \`BROKER_VAULT_MASTER_KEY\`; not yet configured).
- Owner ID and provider included as authenticated associated data to prevent cross-account/provider substitution.
- Decryption only inside trusted server functions for explicitly authorized broker operations.
- Never send decrypted secrets, trading tokens, or the encryption key to React, AI agents, logs, GitHub or email.

**Storage is intentionally not active**. Credentials are not accepted until a durable database/secret store has been implemented, audited and deployed. Use Netlify Database for per-owner credential records and migrations, keep encryption keys separate from ciphertext, and isolate preview DB branches. Never store broker credentials in \`server/data/session.json\` on Netlify, in browser localStorage, or inside Vite environment variables.

To connect Groww/Kraken/eToro later: verified owner -> authenticated Connections POST -> strict Origin/CSRF validation -> input validation and permission check -> encrypt -> store encrypted record -> return masked status only. Support revoke/rotate, versioned keys, audit and read-only permissions by default. Live order execution stays disabled.

## Verification / release blockers

- Unit tests: owner ID alias/mismatch, fake header, 401/403/503, no credential intake, AES-GCM tamper/owner/provider binding.
- Existing CI: TypeScript, build, auth suites, market/risk, browser and Netlify bundle diagnostics.
- Pending: dashboard Identity setup, real deployed Identity test, durable broker-vault storage, migration of **all** legacy Express APIs, owner dashboard switching to backend identity, deployed API checks.
- **No claim of complete legacy API migration** until those are completed and reviewed.
