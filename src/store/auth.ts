import { create } from 'zustand';

import { clearCache } from '../db/portfolio';
import { loadSession, signInWithGoogle, signOut, type AuthUser } from '../lib/auth';

export interface AuthState {
  hydrated: boolean;
  /** True while the Google flow is open. */
  signingIn: boolean;
  user: AuthUser | null;
  token: string | null;
  error: string | null;
  hydrate: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Called when the API rejects the token, so the UI returns to signed-out. */
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  signingIn: false,
  user: null,
  token: null,
  error: null,

  hydrate: async () => {
    const session = await loadSession();
    set({
      hydrated: true,
      user: session?.user ?? null,
      token: session?.token ?? null,
    });
  },

  signIn: async () => {
    set({ signingIn: true, error: null });
    try {
      const session = await signInWithGoogle();
      // Null means the user backed out, which is not an error to report.
      if (session) set({ user: session.user, token: session.token });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not sign in.' });
    } finally {
      set({ signingIn: false });
    }
  },

  signOut: async () => {
    await signOut();
    // The cached portfolio belongs to the account that fetched it, so it goes
    // with the session rather than waiting for the next sign-in to replace it.
    await clearCache().catch(() => undefined);
    set({ user: null, token: null, error: null });
  },

  clearSession: () => {
    void signOut();
    set({ user: null, token: null });
  },
}));
