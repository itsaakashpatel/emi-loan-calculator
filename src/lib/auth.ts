import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID, PORTFOLIO_API_URL } from './config';

/**
 * Google sign-in for the Portfolio tab.
 *
 * The device signs in with the iOS client and receives a Google ID token. That
 * token is traded at our own API for a session token, which is what every
 * later request carries. The Google token is short-lived and used once.
 *
 * The session token is the key to the account's portfolio, so it lives in the
 * Keychain rather than in the app's SQLite database.
 */

const TOKEN_KEY = 'portfolio_session_token';
const USER_KEY = 'portfolio_user';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Session {
  token: string;
  user: AuthUser;
}

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

/** Lets the browser tab close itself once Google redirects back. */
export function primeBrowser(): void {
  void WebBrowser.warmUpAsync();
}

function redirectUri(): string {
  // The reversed client ID scheme is what Google registers for a native iOS
  // client; the app's own `emicalc` scheme is not accepted for it.
  const reversed = GOOGLE_IOS_CLIENT_ID.split('.').reverse().join('.');
  return AuthSession.makeRedirectUri({ scheme: reversed, path: 'oauthredirect' });
}

/**
 * Runs the Google flow and exchanges the result for a session.
 *
 * Returns null when the user backs out, which is not an error and should leave
 * the screen exactly as it was.
 */
export async function signInWithGoogle(): Promise<Session | null> {
  if (!GOOGLE_IOS_CLIENT_ID || !PORTFOLIO_API_URL) {
    throw new Error('Portfolio sign-in is not configured in this build.');
  }

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_IOS_CLIENT_ID,
    redirectUri: redirectUri(),
    scopes: ['openid', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    // Google mints the ID token for the audience named here, and the API
    // verifies it against that same web client ID.
    extraParams: GOOGLE_WEB_CLIENT_ID ? { audience: GOOGLE_WEB_CLIENT_ID } : {},
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success' || !result.params.code) return null;

  const exchanged = await AuthSession.exchangeCodeAsync(
    {
      clientId: GOOGLE_IOS_CLIENT_ID,
      code: result.params.code,
      redirectUri: redirectUri(),
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
    },
    DISCOVERY,
  );

  const idToken = exchanged.idToken;
  if (!idToken) throw new Error('Google did not return an identity token.');

  const response = await fetch(`${PORTFOLIO_API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error('Could not sign in. Please try again.');

  const session = (await response.json()) as Session;
  await saveSession(session);

  return session;
}

async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, session.token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user));
}

/** Reads the stored session, or null when signed out or the token has expired. */
export async function loadSession(): Promise<Session | null> {
  try {
    const [token, rawUser] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    if (!token || !rawUser) return null;
    if (isExpired(token)) {
      await signOut();
      return null;
    }

    return { token, user: JSON.parse(rawUser) as AuthUser };
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined),
  ]);
}

/**
 * Reads the `exp` claim without verifying the signature. That is safe here:
 * this only avoids a round trip that would fail anyway, and the API checks the
 * signature on every request regardless.
 */
function isExpired(token: string): boolean {
  try {
    const body = token.split('.')[1];
    if (!body) return true;

    const padded = body.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')));

    return typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}
