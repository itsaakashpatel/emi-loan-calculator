export interface Env {
  DB: D1Database;
  CAS_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  /** Google OAuth web client ID. Audience for the ID tokens the app sends. */
  GOOGLE_CLIENT_ID: string;
  /** Signing key for the session JWTs this API issues. */
  JWT_SECRET: string;
}

/** Values the auth middleware puts on the request context. */
export interface Vars {
  userId: string;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
