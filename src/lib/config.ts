import Constants from 'expo-constants';

/**
 * Portfolio settings from `app.json` -> `expo.extra`.
 *
 * The client IDs and the API URL are not secrets — a public OAuth client ID is
 * meant to ship inside the app, and the API is public. What guards the data is
 * the token exchange on the server, not hiding these.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

function text(key: string): string {
  const value = extra[key];
  return typeof value === 'string' ? value.trim() : '';
}

export const PORTFOLIO_API_URL = text('portfolioApiUrl');
export const GOOGLE_IOS_CLIENT_ID = text('googleIosClientId');
export const GOOGLE_WEB_CLIENT_ID = text('googleWebClientId');

/**
 * Whether the Portfolio tab can work at all. A build without these configured
 * shows an explanatory empty state instead of a sign-in button that cannot
 * succeed.
 */
export const portfolioConfigured =
  PORTFOLIO_API_URL.length > 0 && GOOGLE_IOS_CLIENT_ID.length > 0;
