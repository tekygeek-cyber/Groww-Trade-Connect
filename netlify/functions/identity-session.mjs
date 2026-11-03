import { getUser } from '@netlify/identity';
import { makeIdentitySessionHandler } from '../../server/identity-session-handler.mjs';

/**
 * Application identity, NOT Netlify's private-project context.user
 * and NOT a Groww broker token.
 *
 * An OWNER_IDENTITY_USER_ID must be set in the Netlify backend environment.
 * This endpoint is intentionally isolated while the legacy Express backend
 * is migrated in Step 3. It does not unlock the existing Groww-only APIs.
 */
export const config = { path: '/api/identity/session' };

export default makeIdentitySessionHandler(
  () => getUser(),
  () => process.env.OWNER_IDENTITY_USER_ID,
);