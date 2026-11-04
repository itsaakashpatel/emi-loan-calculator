import { create } from 'zustand';

import {
  clearCache,
  readCachedMembers,
  readCachedMfHoldings,
  readCachedStockHoldings,
  writeCache,
} from '../db/portfolio';
import { ApiError } from '../lib/api/client';
import * as api from '../lib/api/portfolio';
import type {
  Member,
  MemberDraft,
  MfHolding,
  MfHoldingDraft,
  PortfolioSummary,
  StockHolding,
  StockHoldingDraft,
} from '../lib/api/types';
import { useAuthStore } from './auth';

/**
 * The Portfolio tab's state.
 *
 * The server owns the data. This holds a copy for display: the cache is read
 * first so the screen paints at once, then a sync refreshes it. Mutations go
 * to the API and re-sync rather than editing local state, so what is shown is
 * always something the server actually returned.
 */

export interface PortfolioState {
  /** True only until the cache has been read; the screen waits on nothing else. */
  loading: boolean;
  syncing: boolean;
  /** Set when the last sync could not reach the server, so the UI can say so. */
  offline: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  members: Member[];
  mfHoldings: MfHolding[];
  stockHoldings: StockHolding[];
  summary: PortfolioSummary | null;

  hydrate: () => Promise<void>;
  sync: () => Promise<void>;
  clear: () => Promise<void>;

  createMember: (draft: MemberDraft) => Promise<void>;
  updateMember: (id: string, draft: MemberDraft) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  createMfHolding: (draft: MfHoldingDraft) => Promise<void>;
  updateMfHolding: (id: string, draft: MfHoldingDraft) => Promise<void>;
  removeMfHolding: (id: string) => Promise<void>;
  createStockHolding: (draft: StockHoldingDraft) => Promise<void>;
  updateStockHolding: (id: string, draft: StockHoldingDraft) => Promise<void>;
  removeStockHolding: (id: string) => Promise<void>;

  holdingsFor: (memberId: string) => { mf: MfHolding[]; stocks: StockHolding[] };
  memberById: (id: string) => Member | undefined;
}

/** Guards against overlapping syncs — a pull-to-refresh during a mutation's. */
let inFlight: Promise<void> | null = null;

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  loading: true,
  syncing: false,
  offline: false,
  error: null,
  lastSyncedAt: null,
  members: [],
  mfHoldings: [],
  stockHoldings: [],
  summary: null,

  hydrate: async () => {
    try {
      const [members, mfHoldings, stockHoldings] = await Promise.all([
        readCachedMembers(),
        readCachedMfHoldings(),
        readCachedStockHoldings(),
      ]);
      set({ members, mfHoldings, stockHoldings, loading: false });
    } catch {
      // An unreadable cache is not worth blocking on; the sync will fill it.
      set({ loading: false });
    }
  },

  sync: async () => {
    if (inFlight) return inFlight;

    const token = useAuthStore.getState().token;
    if (!token) {
      set({ loading: false });
      return;
    }

    inFlight = (async () => {
      set({ syncing: true, error: null });
      try {
        const [{ members }, holdings, summary] = await Promise.all([
          api.listMembers(token),
          api.listHoldings(token),
          api.getSummary(token),
        ]);

        set({
          members,
          mfHoldings: holdings.mfHoldings,
          stockHoldings: holdings.stockHoldings,
          summary,
          offline: false,
          loading: false,
          lastSyncedAt: new Date().toISOString(),
        });

        await writeCache(members, holdings.mfHoldings, holdings.stockHoldings).catch(() => {
          // Failing to cache costs the next cold start, not this session.
        });
      } catch (error) {
        if (error instanceof ApiError && error.isUnauthorized) {
          // The session is gone. Drop it and the data it fetched.
          useAuthStore.getState().clearSession();
          await clearCache().catch(() => undefined);
          set({ members: [], mfHoldings: [], stockHoldings: [], summary: null });
        } else if (error instanceof ApiError && error.isOffline) {
          // Never reached the server, so what is on screen is still valid.
          set({ offline: true });
        } else {
          set({ error: error instanceof Error ? error.message : 'Could not refresh.' });
        }
        set({ loading: false });
      } finally {
        set({ syncing: false });
        inFlight = null;
      }
    })();

    return inFlight;
  },

  clear: async () => {
    await clearCache().catch(() => undefined);
    set({
      members: [],
      mfHoldings: [],
      stockHoldings: [],
      summary: null,
      lastSyncedAt: null,
      error: null,
      offline: false,
    });
  },

  createMember: async (draft) => {
    await withToken((token) => api.createMember(token, draft));
    await get().sync();
  },
  updateMember: async (id, draft) => {
    await withToken((token) => api.updateMember(token, id, draft));
    await get().sync();
  },
  removeMember: async (id) => {
    await withToken((token) => api.deleteMember(token, id));
    await get().sync();
  },

  createMfHolding: async (draft) => {
    await withToken((token) => api.createMfHolding(token, draft));
    await get().sync();
  },
  updateMfHolding: async (id, draft) => {
    await withToken((token) => api.updateMfHolding(token, id, draft));
    await get().sync();
  },
  removeMfHolding: async (id) => {
    await withToken((token) => api.deleteMfHolding(token, id));
    await get().sync();
  },

  createStockHolding: async (draft) => {
    await withToken((token) => api.createStockHolding(token, draft));
    await get().sync();
  },
  updateStockHolding: async (id, draft) => {
    await withToken((token) => api.updateStockHolding(token, id, draft));
    await get().sync();
  },
  removeStockHolding: async (id) => {
    await withToken((token) => api.deleteStockHolding(token, id));
    await get().sync();
  },

  holdingsFor: (memberId) => ({
    mf: get().mfHoldings.filter((holding) => holding.memberId === memberId),
    stocks: get().stockHoldings.filter((holding) => holding.memberId === memberId),
  }),

  memberById: (id) => get().members.find((member) => member.id === id),
}));

/**
 * Runs an API call with the current token. Mutations reject rather than fail
 * quietly: the screen that started one shows the message and keeps the form
 * open, unlike a background sync.
 */
async function withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
  const token = useAuthStore.getState().token;
  if (!token) throw new ApiError(401, 'unauthorized', 'Please sign in again.');

  try {
    return await call(token);
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      useAuthStore.getState().clearSession();
    }
    throw error;
  }
}
