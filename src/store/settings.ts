import { create } from 'zustand';

import { readAllSettings, writeSetting } from '../db/kv';
import type { Compounding } from '../lib/finance/deposits';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface SettingsState {
  hydrated: boolean;
  currency: string;
  themePreference: ThemePreference;
  /** Seeds a fresh loan calculation. */
  defaultRate: number;
  defaultTenureYears: number;
  defaultFdCompounding: Compounding;
  hydrate: () => Promise<void>;
  setCurrency: (code: string) => void;
  setThemePreference: (preference: ThemePreference) => void;
  setDefaultRate: (rate: number) => void;
  setDefaultTenureYears: (years: number) => void;
  setDefaultFdCompounding: (compounding: Compounding) => void;
}

const KEYS = {
  currency: 'currency',
  theme: 'theme_preference',
  rate: 'default_rate',
  tenure: 'default_tenure_years',
  fdCompounding: 'default_fd_compounding',
} as const;

const DEFAULTS = {
  currency: 'INR',
  themePreference: 'system' as ThemePreference,
  defaultRate: 8.5,
  defaultTenureYears: 20,
  defaultFdCompounding: 'quarterly' as Compounding,
};

function isThemePreference(value: string | undefined): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isCompounding(value: string | undefined): value is Compounding {
  return (
    value === 'monthly' ||
    value === 'quarterly' ||
    value === 'halfyearly' ||
    value === 'yearly' ||
    value === 'simple'
  );
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Persist-and-set: SQLite writes are fire-and-forget so the UI never waits on them. */
function persist(key: string, value: string) {
  void writeSetting(key, value);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  hydrated: false,
  ...DEFAULTS,

  hydrate: async () => {
    try {
      const stored = await readAllSettings();
      // Read into locals so the type guards actually narrow (re-indexing loses the narrowing).
      const theme = stored[KEYS.theme];
      const compounding = stored[KEYS.fdCompounding];
      set({
        currency: stored[KEYS.currency] ?? DEFAULTS.currency,
        themePreference: isThemePreference(theme) ? theme : DEFAULTS.themePreference,
        defaultRate: numberOr(stored[KEYS.rate], DEFAULTS.defaultRate),
        defaultTenureYears: numberOr(stored[KEYS.tenure], DEFAULTS.defaultTenureYears),
        defaultFdCompounding: isCompounding(compounding) ? compounding : DEFAULTS.defaultFdCompounding,
        hydrated: true,
      });
    } catch {
      // A failed read must not block the app; fall back to defaults.
      set({ hydrated: true });
    }
  },

  setCurrency: (code) => {
    set({ currency: code });
    persist(KEYS.currency, code);
  },
  setThemePreference: (preference) => {
    set({ themePreference: preference });
    persist(KEYS.theme, preference);
  },
  setDefaultRate: (rate) => {
    set({ defaultRate: rate });
    persist(KEYS.rate, String(rate));
  },
  setDefaultTenureYears: (years) => {
    set({ defaultTenureYears: years });
    persist(KEYS.tenure, String(years));
  },
  setDefaultFdCompounding: (compounding) => {
    set({ defaultFdCompounding: compounding });
    persist(KEYS.fdCompounding, compounding);
  },
}));

/** Currency code only — the most common selector, kept narrow to avoid needless re-renders. */
export const useCurrency = () => useSettingsStore((s) => s.currency);
