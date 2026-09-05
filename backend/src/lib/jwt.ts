/**
 * HS256 sign and verify over Web Crypto. Workers ship SubtleCrypto, so this
 * needs no JWT library.
 */

export interface JwtPayload {
  sub: string;
  email: string;
  /** Seconds since epoch. */
  exp: number;
  iat: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, 'exp' | 'iat'>,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body: JwtPayload = { ...payload, iat: issuedAt, exp: issuedAt + ttlSeconds };
  const signingInput = `${encodeJson({ alg: 'HS256', typ: 'JWT' })}.${encodeJson(body)}`;

  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Returns the payload, or null when the token is malformed, forged or expired. */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    base64UrlDecode(signature),
    new TextEncoder().encode(`${header}.${body}`),
  );
  if (!valid) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

  return payload;
}
