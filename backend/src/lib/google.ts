/**
 * Verifies the Google ID token the app sends after signing in.
 *
 * Google signs ID tokens with RS256 and publishes the matching public keys as
 * a JWKS. We fetch that set, pick the key the token names in its `kid`, and
 * check the signature ourselves rather than calling Google's tokeninfo
 * endpoint on every sign-in.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty: string;
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string | null;
}

/**
 * Cached per isolate. Google rotates these keys slowly and a cold isolate just
 * re-fetches, so a short TTL is enough to pick up a rotation.
 */
let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

async function fetchJwks(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;

  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`jwks fetch failed: ${response.status}`);

  const body = (await response.json()) as { keys: Jwk[] };
  jwksCache = { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return body.keys;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeSegment<T>(segment: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T;
  } catch {
    return null;
  }
}

/**
 * Returns the caller's Google identity, or null when the token fails any
 * check. Callers must treat null as "not signed in" and never fall back to
 * trusting unverified claims.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedAudience: string,
): Promise<GoogleIdentity | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

  const header = decodeSegment<{ kid?: string; alg?: string }>(rawHeader);
  if (!header?.kid || header.alg !== 'RS256') return null;

  const key = (await fetchJwks()).find((candidate) => candidate.kid === header.kid);
  if (!key) return null;

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    base64UrlToBytes(rawSignature),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!signatureValid) return null;

  const claims = decodeSegment<{
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(rawPayload);
  if (!claims) return null;

  // A valid signature only proves Google minted the token. These checks prove
  // it was minted for this app and is still current.
  if (!claims.iss || !ISSUERS.includes(claims.iss)) return null;
  if (claims.aud !== expectedAudience) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  if (!claims.sub || !claims.email) return null;
  if (claims.email_verified === false) return null;

  return { googleId: claims.sub, email: claims.email, name: claims.name ?? null };
}
