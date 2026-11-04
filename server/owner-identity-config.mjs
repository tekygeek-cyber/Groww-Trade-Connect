/**
 * Resolve the immutable Netlify Identity user ID from backend-only settings.
 * OWNER_IDENTITY_SUB is already configured on the existing site.
 * OWNER_IDENTITY_USER_ID is the prior code/documentation name.
 *
 * Fail closed if both are populated with conflicting IDs. Owner email is
 * informational only; NEVER use OWNER_EMAIL as an authorization predicate.
 */
export function getConfiguredOwnerIdentityId(env = process.env) {
  const preferred = typeof env?.OWNER_IDENTITY_SUB === 'string'
    ? env.OWNER_IDENTITY_SUB.trim() : '';
  const previous = typeof env?.OWNER_IDENTITY_USER_ID === 'string'
    ? env.OWNER_IDENTITY_USER_ID.trim() : '';

  if (preferred && previous && preferred !== previous) return null;
  return preferred || previous || null;
}
