import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PROVIDERS = new Set(['groww', 'kraken', 'etoro']);
const VERSION = 1;

/** Do not use the Netlify Identity password or session key for broker encryption.
 * Master encryption key: a *different*, random 32-byte secret stored only as a
 * Functions-scoped environment secret (never VITE_ or in GitHub).
 */
function readKey(base64Key) {
  if (typeof base64Key !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(base64Key)) {
    throw new TypeError('Credential vault master key must be 32 base64-encoded bytes');
  }
  const decoded = Buffer.from(base64Key, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== base64Key) {
    throw new TypeError('Invalid credential vault master key');
  }
  return decoded;
}

function context(ownerId, provider) {
  if (typeof ownerId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(ownerId)) {
    throw new TypeError('A verified owner ID is required');
  }
  if (!PROVIDERS.has(provider)) {
    throw new TypeError('Provider is not supported');
  }
  return Buffer.from('groww-connect:broker-credential:v1:' + ownerId + ':' + provider, 'utf8');
}

/** Encrypt on the server; ciphertext alone is insufficient without the key.
 * The owner ID and provider are bound as authenticated associated data.
 */
export function encryptBrokerCredential(plaintext, { ownerId, provider, base64Key }) {
  if (typeof plaintext !== 'string' || !plaintext.length || plaintext.length > 8192) {
    throw new TypeError('Nonempty credential text up to 8192 characters is required');
  }
  const key = readKey(base64Key);
  const aad = context(ownerId, provider);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Object.freeze({
    version: VERSION,
    algorithm: 'AES-256-GCM',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  });
}

/** Server-side only. Never expose decrypted content to a browser API result,
 * AI prompt, telemetry, debug log, or test output.
 */
export function decryptBrokerCredential(record, { ownerId, provider, base64Key }) {
  const key = readKey(base64Key);
  const aad = context(ownerId, provider);
  if (!record || record.version !== VERSION || record.algorithm !== 'AES-256-GCM') {
    throw new TypeError('Unsupported encrypted credential format');
  }
  const iv = Buffer.from(record.iv, 'base64');
  const tag = Buffer.from(record.tag, 'base64');
  const ciphertext = Buffer.from(record.ciphertext, 'base64');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new TypeError('Invalid encrypted credential envelope');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
