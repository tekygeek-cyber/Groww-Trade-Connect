import { getUser } from '@netlify/identity';
import { createOwnerAppHandler } from '../../server/owner-app-endpoints.mjs';

/**
 * All of these read-only routes independently verify Netlify Identity.
 * A valid session is never inferred from the frontend, a Groww token,
 * a Netlify team-account identity, or a request-supplied role.
 */
export const config = {
  path: ['/api/app/profile', '/api/app/connections', '/api/app/capabilities'],
};

export default createOwnerAppHandler({ getVerifiedUser: getUser });
