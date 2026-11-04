import { describe, expect, it } from 'vitest';

import { signJwt, verifyJwt } from '../src/lib/jwt';

const SECRET = 'test-secret-value';

describe('jwt', () => {
  it('round-trips a payload', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com' }, SECRET, 3600);
    const payload = await verifyJwt(token, SECRET);

    expect(payload?.sub).toBe('user-1');
    expect(payload?.email).toBe('a@b.com');
    expect(payload?.exp).toBeGreaterThan(payload!.iat);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com' }, SECRET, 3600);
    expect(await verifyJwt(token, 'other-secret')).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com' }, SECRET, 3600);
    const [header, , signature] = token.split('.') as [string, string, string];
    const forged = btoa(JSON.stringify({ sub: 'user-2', email: 'a@b.com', exp: 9e9, iat: 1 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(await verifyJwt(`${header}.${forged}.${signature}`, SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com' }, SECRET, -10);
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it('rejects malformed input', async () => {
    expect(await verifyJwt('not-a-jwt', SECRET)).toBeNull();
    expect(await verifyJwt('', SECRET)).toBeNull();
  });
});
