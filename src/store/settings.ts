import { create } from 'zustand';

import { readAllSettings, writeSetting } from '../db/kv';
import type { Compounding } from '../lib/finance/deposits';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface SettingsState {
  hydrated: boolean;
  themePreference: ThemePreference;
  /** Seeds a fresh loan calculation. */
  defaultRate: number;
  defaultTenureYears: number;
  defaultFdCompounding: Compounding;
  /** `HH:MM` 24-hour clock, the time of day EMI reminders fire. */
  notificationTime: string;
  hydrate: () => Promise<void>;
  setThemePreference: (preference: ThemePreference) => void;
  setDefaultRate: (rate: number) => void;
  setDefaultTenureYears: (years: number) => void;
  setDefaultFdCompounding: (compounding: Compounding) => void;
  setNotificationTime: (time: string) => void;
}

const KEYS = {
  theme: 'theme_preference',
  rate: 'default_rate',
  tenure: 'default_tenure_years',
  fdCompounding: 'default_fd_compounding',
  notificationTime: 'notification_time',
} as const;

const DEFAULTS = {
  themePreference: 'system' as ThemePreference,
  defaultRate: 8.5,
  defaultTenureYears: 20,
  defaultFdCompounding: 'quarterly' as Compounding,
  notificationTime: '19:00',
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

function isTime(value: string | undefined): value is string {
  if (!value) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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
      const notificationTime = stored[KEYS.notificationTime];
      set({
        themePreference: isThemePreference(theme) ? theme : DEFAULTS.themePreference,
        defaultRate: numberOr(stored[KEYS.rate], DEFAULTS.defaultRate),
        defaultTenureYears: numberOr(stored[KEYS.tenure], DEFAULTS.defaultTenureYears),
        defaultFdCompounding: isCompounding(compounding) ? compounding : DEFAULTS.defaultFdCompounding,
        notificationTime: isTime(notificationTime) ? notificationTime : DEFAULTS.notificationTime,
        hydrated: true,
      });
    } catch {
      // A failed read must not block the app; fall back to defaults.
      set({ hydrated: true });
    }
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
  setNotificationTime: (time) => {
    set({ notificationTime: time });
    persist(KEYS.notificationTime, time);
  },
}));

/** INR is the only supported currency for now. */
export const useCurrency = (): string => 'INR';
