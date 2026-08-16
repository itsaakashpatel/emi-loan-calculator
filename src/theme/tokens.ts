/** One token set drives both appearances. Colours follow iOS grouped-list conventions. */

export type ThemeMode = 'light' | 'dark';

export interface Palette {
  /** Grouped page background, behind cards. */
  bg: string;
  /** Vertical page gradient, top to bottom. The app's signature backdrop. */
  gradient: readonly [string, string, string];
  /** Translucent circular header buttons that sit on the gradient. */
  headerButton: string;
  /** Floating tab bar pill. */
  tabBar: string;
  /** Rounded highlight behind the selected tab. */
  tabActive: string;
  /** Soft blue wash behind tile icons. */
  iconWash: string;
  /** Secondary action (the grey "Reset" pill). */
  neutral: string;
  onNeutral: string;
  /** Card / raised surface. */
  surface: string;
  /** Subtle fill: input backgrounds, table stripes. */
  surfaceAlt: string;
  /** Even subtler fill for nested rows, and the track behind a segmented control. */
  surfaceSunken: string;
  /**
   * The selected thumb inside a segmented control. It must read as *raised* off `surfaceSunken`,
   * which means lighter than the track in both appearances — so it is not simply `surface`, whose
   * relationship to `surfaceSunken` flips between light and dark.
   */
  segmentActive: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  /** Tinted accent background for chips and selected segments. */
  accentSoft: string;
  onAccent: string;
  positive: string;
  positiveSoft: string;
  warning: string;
  warningSoft: string;
  negative: string;
  negativeSoft: string;
  /** Chart series. */
  principal: string;
  interest: string;
  prepayment: string;
  /** Track behind progress arcs and bars. */
  track: string;
  overlay: string;
}

const light: Palette = {
  bg: '#EDF3F8',
  // Sky blue at the top fading to near-white — the backdrop the whole app sits on.
  gradient: ['#BEDCF3', '#E4EFF7', '#EFF4F7'],
  headerButton: 'rgba(255, 255, 255, 0.78)',
  tabBar: 'rgba(252, 253, 254, 0.94)',
  tabActive: '#E2E8EC',
  iconWash: '#E4F1FC',
  neutral: '#B7BCC0',
  onNeutral: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F7FA',
  surfaceSunken: '#E9EEF3',
  segmentActive: '#FFFFFF',
  border: '#DFE6EC',
  text: '#16222E',
  textMuted: '#61717F',
  textFaint: '#94A2AE',
  accent: '#1E78AE',
  accentSoft: '#E1EFF9',
  onAccent: '#FFFFFF',
  positive: '#15803D',
  positiveSoft: '#E7F6EC',
  warning: '#B45309',
  warningSoft: '#FEF3E2',
  negative: '#DC2626',
  negativeSoft: '#FDECEC',
  principal: '#1E78AE',
  interest: '#F0A63C',
  prepayment: '#10B981',
  track: '#DCE4EB',
  overlay: 'rgba(16, 34, 46, 0.35)',
};

const dark: Palette = {
  bg: '#0C1116',
  gradient: ['#16303F', '#111A21', '#0C1116'],
  headerButton: 'rgba(255, 255, 255, 0.10)',
  tabBar: 'rgba(28, 36, 44, 0.94)',
  tabActive: '#243039',
  iconWash: '#17303E',
  neutral: '#3A444C',
  onNeutral: '#E8EEF3',
  surface: '#161D24',
  surfaceAlt: '#1D262E',
  surfaceSunken: '#243039',
  segmentActive: '#3A4750',
  border: '#2A353E',
  text: '#EEF3F7',
  textMuted: '#9AACB9',
  textFaint: '#6E7F8C',
  accent: '#5FB4E7',
  accentSoft: '#153343',
  onAccent: '#08141C',
  positive: '#34D399',
  positiveSoft: '#0F3329',
  warning: '#FBBF24',
  warningSoft: '#3A2A08',
  negative: '#F87171',
  negativeSoft: '#3A1717',
  principal: '#5FB4E7',
  interest: '#F0A63C',
  prepayment: '#34D399',
  track: '#2A353E',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export const palettes: Record<ThemeMode, Palette> = { light, dark };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const fontSize = {
  micro: 11,
  caption: 13,
  body: 15,
  subhead: 17,
  title: 20,
  display: 28,
  hero: 34,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type Spacing = typeof spacing;
export type Radius = typeof radius;
