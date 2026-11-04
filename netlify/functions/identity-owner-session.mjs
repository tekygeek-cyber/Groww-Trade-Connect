import { getUser } from '@netlify/identity';
import { createIdentityOwnerSessionHandler } from '../../server/identity-owner-handler.mjs';

/**
 * Separate application login from the legacy Groww broker session.
 * This v2 Netlify Function authenticates using the official Netlify Identity
 * server-side SDK; it never accepts a claimed identity from the browser.
 */
export const config = { path: '/api/identity/session' };

export default createIdentityOwnerSessionHandler({
  getVerifiedUser: getUser,
});
