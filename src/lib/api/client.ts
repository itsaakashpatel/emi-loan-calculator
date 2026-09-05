import { PORTFOLIO_API_URL } from '../config';

/**
 * The single point every portfolio request goes through: it attaches the
 * session token, bounds the wait, and turns failures into one error type the
 * UI can act on.
 */

const TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** The session is gone or rejected; the caller should sign out. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** No reply at all — offline, or the request timed out. Cached data still stands. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

/** Messages worth showing a user; anything else gets a plain fallback. */
const MESSAGES: Record<string, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  not_found: 'That item no longer exists.',
  already_exists: 'That holding is already in this portfolio.',
  already_imported: 'This statement has already been imported.',
  file_too_large: 'That file is too large.',
  invalid_body: 'Some details were not valid.',
};

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token: string;
  /** Sent as-is, for the multipart CAS upload. */
  formData?: FormData;
}

export async function apiFetch<T>(path: string, options: Options): Promise<T> {
  if (!PORTFOLIO_API_URL) {
    throw new ApiError(0, 'not_configured', 'The portfolio service is not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${PORTFOLIO_API_URL}${path}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.token}`,
        ...(options.formData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
    });

    if (!response.ok) {
      const code = await response
        .json()
        .then((body: { error?: string }) => body.error ?? 'request_failed')
        .catch(() => 'request_failed');

      throw new ApiError(
        response.status,
        code,
        MESSAGES[code] ?? 'Something went wrong. Please try again.',
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Status 0 marks "never reached the server", which is what tells the
    // caller to keep showing cached data rather than report a real failure.
    throw new ApiError(0, 'network', 'Could not reach the portfolio service.');
  } finally {
    clearTimeout(timer);
  }
}
