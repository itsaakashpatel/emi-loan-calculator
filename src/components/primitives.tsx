import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/* ------------------------------------------------------------------ text ---- */

type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'positive' | 'negative' | 'warning';
type TextSize = 'micro' | 'caption' | 'body' | 'subhead' | 'title' | 'display' | 'hero';

interface LabelProps {
  children: ReactNode;
  tone?: TextTone;
  size?: TextSize;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Monospaced digits so columns of figures line up. */
  tabular?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  align?: 'left' | 'center' | 'right';
}

export function Label({
  children,
  tone = 'default',
  size = 'body',
  weight = 'regular',
  tabular = false,
  numberOfLines,
  align,
  style,
}: LabelProps) {
  const theme = useTheme();
  const toneColor: Record<TextTone, string> = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    faint: theme.colors.textFaint,
    accent: theme.colors.accent,
    positive: theme.colors.positive,
    negative: theme.colors.negative,
    warning: theme.colors.warning,
  };
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color: toneColor[tone],
          fontSize: theme.fontSize[size],
          fontWeight: theme.fontWeight[weight],
        },
        tabular && styles.tabular,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ card ---- */

interface CardProps {
  children: ReactNode;
  title?: string;
  /** Rendered at the right of the title row. */
  action?: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, title, action, padded = true, style }: CardProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          padding: padded ? spacing.lg : 0,
          marginBottom: spacing.md,
        },
        style,
      ]}
    >
      {title ? (
        <View style={[styles.cardHeader, { marginBottom: spacing.md, paddingHorizontal: padded ? 0 : spacing.lg, paddingTop: padded ? 0 : spacing.lg }]}>
          <Label size="caption" weight="semibold" tone="muted" style={styles.sectionLabel}>
            {title.toUpperCase()}
          </Label>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* ------------------------------------------------------------- icon chip ---- */

/**
 * Box and glyph sizes for `IconChip`. The glyph is about 55% of the box, which leaves every icon
 * the same margin inside its circle regardless of how wide or narrow the glyph itself is.
 */
const ICON_CHIP_SIZES = {
  sm: { box: 30, glyph: 16 },
  md: { box: 34, glyph: 18 },
  lg: { box: 46, glyph: 24 },
} as const;

export type IconChipSize = keyof typeof ICON_CHIP_SIZES;

interface IconChipProps {
  icon: keyof typeof Ionicons.glyphMap;
  size?: IconChipSize;
  /** Overrides the glyph colour; the wash stays the same. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
}

export function IconGlyph({
  name,
  size,
  color,
  style,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Ionicons name={name} size={size} color={color} style={[centeredIconStyle(size), style]} />;
}

function centeredIconStyle(size: number): TextStyle {
  return {
    width: size,
    height: size,
    lineHeight: size,
    textAlign: 'center',
    includeFontPadding: false,
  };
}

/**
 * A tinted circle holding an icon — the app's single icon treatment.
 *
 * The circle is the point. Ionicons differ enormously in aspect ratio: at the same `size`, a wide
 * glyph such as `infinite-outline` carries far more ink than a narrow one such as `lock-closed-
 * outline`, so a row of them reads as ragged even when every glyph is perfectly centred. What the
 * eye aligns on is the filled shape, so giving each glyph an identical filled circle is what makes
 * a grid or a list look even. An invisible fixed-size box does nothing.
 *
 * Purely presentational. For a tappable chip, wrap it in a `Pressable` that carries only the press
 * feedback, so the chip stays the one source of truth for the look.
 */
export function IconChip({ icon, size = 'md', tint, style }: IconChipProps) {
  const { colors } = useTheme();
  const { box, glyph } = ICON_CHIP_SIZES[size];

  return (
    <View
      style={[
        styles.iconChip,
        { width: box, height: box, borderRadius: box / 2, backgroundColor: colors.iconWash },
        style,
      ]}
    >
      <IconGlyph name={icon} size={glyph} color={tint ?? colors.accent} />
    </View>
  );
}

/* ------------------------------------------------------------------- row ---- */

interface KeyValueRowProps {
  label: string;
  value: string;
  hint?: string;
  tone?: TextTone;
  /** Small colour swatch, used to tie a row to a chart series. */
  swatch?: string;
  emphasis?: boolean;
  last?: boolean;
}

export function KeyValueRow({ label, value, hint, tone, swatch, emphasis, last }: KeyValueRowProps) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.kvRow,
        {
          paddingVertical: spacing.sm + 2,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.kvLabel}>
        {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
        <View style={styles.flexShrink}>
          <Label size="body" tone={emphasis ? 'default' : 'muted'} weight={emphasis ? 'medium' : 'regular'}>
            {label}
          </Label>
          {hint ? <Label size="micro" tone="faint">{hint}</Label> : null}
        </View>
      </View>
      <Label
        size={emphasis ? 'subhead' : 'body'}
        weight={emphasis ? 'semibold' : 'medium'}
        tone={tone}
        tabular
      >
        {value}
      </Label>
    </View>
  );
}

/* ---------------------------------------------------------------- button ---- */

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  fullWidth = true,
  style,
}: ButtonProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();

  const surface: Record<NonNullable<ButtonProps['variant']>, ViewStyle> = {
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.accentSoft },
    ghost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    danger: { backgroundColor: colors.negativeSoft },
  };
  const tint: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: colors.onAccent,
    secondary: colors.accent,
    ghost: colors.text,
    danger: colors.negative,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        surface[variant],
        {
          borderRadius: radius.md,
          paddingVertical: spacing.md + 1,
          paddingHorizontal: spacing.lg,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {icon ? <IconGlyph name={icon} size={17} color={tint[variant]} /> : null}
      <Text style={{ color: tint[variant], fontSize: fontSize.body, fontWeight: fontWeight.semibold }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------------------------------- action buttons ---- */

/**
 * The grey Reset / blue Calculate pill pair the cloned app puts under every form.
 *
 * Results in this app recompute as you type, so `onCalculate` is a confirmation step — it dismisses
 * the keyboard and lets the caller reveal or scroll to the result — rather than the thing that
 * triggers the calculation.
 */
export function ActionButtons({
  onReset,
  onCalculate,
  calculateLabel = 'Calculate',
  resetLabel = 'Reset',
}: {
  onReset: () => void;
  onCalculate: () => void;
  calculateLabel?: string;
  resetLabel?: string;
}) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();

  const pill = (background: string, tint: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Keyboard.dismiss();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: background,
          borderRadius: radius.pill,
          paddingVertical: spacing.md + 2,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={{ color: tint, fontSize: fontSize.subhead, fontWeight: fontWeight.semibold }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.pillRow, { gap: spacing.md, marginBottom: spacing.lg }]}>
      {pill(colors.neutral, colors.onNeutral, resetLabel, onReset)}
      {pill(colors.accent, colors.onAccent, calculateLabel, onCalculate)}
    </View>
  );
}

/* ------------------------------------------------------------- nav / list ---- */

interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
  right?: ReactNode;
  last?: boolean;
}

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  onPress,
  right,
  last,
}: ListRowProps) {
  const { colors, spacing } = useTheme();
  const content = (
    <View
      style={[
        styles.listRow,
        {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {icon ? (
        <IconChip icon={icon} tint={iconColor} />
      ) : null}
      <View style={styles.flexShrink}>
        <Label size="body" weight="medium">
          {title}
        </Label>
        {subtitle ? (
          <Label size="caption" tone="muted">
            {subtitle}
          </Label>
        ) : null}
      </View>
      <View style={styles.listRight}>
        {value ? (
          <Label size="body" tone="muted" tabular>
            {value}
          </Label>
        ) : null}
        {right}
        {onPress && !right ? (
          <IconGlyph name="chevron-forward" size={16} color={colors.textFaint} />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/* -------------------------------------------------------------- chip row ---- */

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Announced to VoiceOver in place of the short label. */
  hint?: string;
}

interface SelectChipRowProps<T extends string> {
  options: ReadonlyArray<ChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Horizontal padding of the container this row sits in — a `Card` uses `spacing.lg`. */
  bleed?: number;
  /**
   * Wrap onto several lines instead of scrolling. Use it when every option must be visible at once
   * — a short, fixed set such as tax slabs — and scrolling would hide one behind the edge.
   */
  wrap?: boolean;
}

/**
 * A single-select row of chips that scrolls horizontally.
 *
 * The scroll view is pulled out to the container's padding and puts that padding back on its
 * content, so a chip that runs past the edge is cut at the card boundary rather than sliced in the
 * middle of the card's inner margin — which read as a rendering fault.
 */
export function SelectChipRow<T extends string>({
  options,
  value,
  onChange,
  bleed,
  wrap = false,
}: SelectChipRowProps<T>) {
  const { colors, radius, spacing } = useTheme();
  const inset = bleed ?? spacing.lg;

  const chips = options.map((option) => {
    const active = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={option.hint ?? option.label}
        onPress={() => {
          if (!active) void Haptics.selectionAsync();
          onChange(option.value);
        }}
        style={({ pressed }) => [
          styles.chipItem,
          {
            backgroundColor: active ? colors.accent : colors.surfaceAlt,
            borderRadius: radius.md,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Label
          size="caption"
          weight={active ? 'semibold' : 'medium'}
          numberOfLines={1}
          style={{ color: active ? colors.onAccent : colors.textMuted }}
        >
          {option.label}
        </Label>
      </Pressable>
    );
  });

  if (wrap) {
    return <View style={[styles.chipWrap, { gap: spacing.sm }]}>{chips}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -inset }}
      contentContainerStyle={[styles.chipRow, { paddingHorizontal: inset, gap: spacing.sm }]}
    >
      {chips}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ chip ---- */

interface ChipProps {
  label: string;
  tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'negative';
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Chip({ label, tone = 'neutral', icon }: ChipProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  const map = {
    neutral: { bg: colors.surfaceSunken, fg: colors.textMuted },
    accent: { bg: colors.accentSoft, fg: colors.accent },
    positive: { bg: colors.positiveSoft, fg: colors.positive },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    negative: { bg: colors.negativeSoft, fg: colors.negative },
  } as const;
  const { bg, fg } = map[tone];
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: 3,
        },
      ]}
    >
      {icon ? <IconGlyph name={icon} size={11} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: fontSize.micro, fontWeight: fontWeight.semibold }}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ empty state ---- */

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.empty, { paddingVertical: spacing.xxxl }]}>
      <IconGlyph name={icon} size={44} color={colors.textFaint} />
      <View style={{ height: spacing.md }} />
      <Label size="subhead" weight="semibold">
        {title}
      </Label>
      <View style={{ height: spacing.xs }} />
      <Label size="caption" tone="muted" align="center" style={styles.emptyMessage}>
        {message}
      </Label>
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

/* --------------------------------------------------------------- spacers ---- */

export function Gap({ size = 12 }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { spacing } = useTheme();
  return (
    <Label
      size="caption"
      weight="semibold"
      tone="muted"
      style={[styles.sectionLabel, { marginBottom: spacing.sm, marginLeft: spacing.xs }, style]}
    >
      {children}
    </Label>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { letterSpacing: 0.6 },
  kvRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kvLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  swatch: { width: 9, height: 9, borderRadius: 3 },
  flexShrink: { flexShrink: 1 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconChip: { alignItems: 'center', justifyContent: 'center' },
  listRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipRow: { flexDirection: 'row', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  chipItem: { alignItems: 'center', justifyContent: 'center' },
  pillRow: { flexDirection: 'row' },
  pill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyMessage: { maxWidth: 280 },
});
