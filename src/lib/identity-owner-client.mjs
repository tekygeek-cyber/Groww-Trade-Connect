/**
 * The backend is authoritative for owner identity.
 * Browser SDK user objects are never sufficient to unlock private data.
 */
export async function checkOwnerIdentity(fetchImpl = fetch) {
  const response = await fetchImpl('/api/identity/session', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });

  switch (response.status) {
    case 200:
      return 'authorized';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 503:
      return 'unavailable';
    default:
      return 'unavailable';
  }
}