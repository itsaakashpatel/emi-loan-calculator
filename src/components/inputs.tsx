import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { formatDate, parseISO, toISO } from '../lib/format/date';
import { formatNumber, getCurrency, parseNumber } from '../lib/format/money';
import { useCurrency } from '../store/settings';
import { useTheme } from '../theme/ThemeProvider';
import { Label } from './primitives';

/* ---------------------------------------------------------- number field ---- */

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** `currency` shows the active currency symbol; otherwise a literal string. */
  prefix?: 'currency' | string;
  suffix?: string;
  decimals?: number;
  placeholder?: string;
  hint?: string;
  /** Clamped on commit. */
  min?: number;
  max?: number;
  /** Change this to force the field to re-read `value` (e.g. after loading a saved loan). */
  resetKey?: number | string;
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  decimals = 0,
  placeholder,
  hint,
  min,
  max,
  resetKey,
}: NumberFieldProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  const currency = useCurrency();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const editing = useRef(false);

  // While the field is focused the raw text is authoritative, so external updates are ignored.
  useEffect(() => {
    if (!editing.current) setText(value === 0 ? '' : String(round(value, decimals)));
  }, [value, decimals, resetKey]);

  const symbol = prefix === 'currency' ? getCurrency(currency).symbol : prefix;
  const display = focused
    ? text
    : value === 0 && placeholder
      ? ''
      : formatNumber(value, { decimals, grouping: getCurrency(currency).grouping });

  const commit = () => {
    editing.current = false;
    setFocused(false);
    let next = parseNumber(text);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(round(next, decimals));
    setText(next === 0 ? '' : String(round(next, decimals)));
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.fieldHeader}>
        <Label size="caption" tone="muted">
          {label}
        </Label>
        {hint ? (
          <Label size="micro" tone="faint">
            {hint}
          </Label>
        ) : null}
      </View>
      <View
        style={[
          styles.fieldBox,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: focused ? colors.accent : colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        {symbol ? (
          <Label size="subhead" tone="muted" weight="medium">
            {symbol}
          </Label>
        ) : null}
        <TextInput
          value={display}
          onChangeText={setText}
          onFocus={() => {
            editing.current = true;
            setFocused(true);
            setText(value === 0 ? '' : String(round(value, decimals)));
          }}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          selectTextOnFocus
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              color: colors.text,
              fontSize: fontSize.subhead,
              fontWeight: fontWeight.semibold,
              paddingVertical: spacing.md,
            },
          ]}
        />
        {suffix ? (
          <Label size="body" tone="muted" weight="medium">
            {suffix}
          </Label>
        ) : null}
      </View>
    </View>
  );
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------- row field ---- */

interface RowFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: 'currency' | string;
  suffix?: string;
  decimals?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Small right-aligned hint under the field. */
  caption?: string;
  resetKey?: number | string;
}

/**
 * Label on the left, white input on the right — the row style the cloned app uses on every
 * calculator form. Wider label column than `CompactField` so two-line labels sit comfortably.
 */
export function RowField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  decimals = 0,
  min,
  max,
  placeholder,
  caption,
  resetKey,
}: RowFieldProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  const currency = useCurrency();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value === 0 ? '' : String(round(value, decimals)));
  }, [value, decimals, resetKey]);

  const symbol = prefix === 'currency' ? getCurrency(currency).symbol : prefix;
  const display = focused
    ? text
    : value === 0 && placeholder
      ? ''
      : formatNumber(value, { decimals, grouping: getCurrency(currency).grouping });

  const commit = () => {
    editing.current = false;
    setFocused(false);
    let next = parseNumber(text);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(round(next, decimals));
  };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.rowFieldRow}>
        <Label size="body" style={styles.rowFieldLabel} numberOfLines={2}>
          {label}
        </Label>
        <View
          style={[
            styles.rowFieldBox,
            {
              backgroundColor: colors.surface,
              borderColor: focused ? colors.accent : colors.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          {symbol ? (
            <Label size="body" tone="muted" weight="medium">
              {symbol}
            </Label>
          ) : null}
          <TextInput
            value={display}
            onChangeText={setText}
            onFocus={() => {
              editing.current = true;
              setFocused(true);
              setText(value === 0 ? '' : String(round(value, decimals)));
            }}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            selectTextOnFocus
            accessibilityLabel={label}
            style={[
              styles.input,
              {
                color: colors.text,
                fontSize: fontSize.subhead,
                fontWeight: fontWeight.semibold,
                paddingVertical: spacing.md + 2,
              },
            ]}
          />
          {suffix ? (
            <Label size="caption" tone="muted" weight="semibold">
              {suffix}
            </Label>
          ) : null}
        </View>
      </View>
      {caption ? (
        <Label size="micro" tone="faint" align="right" numberOfLines={1} style={styles.rowFieldCaption}>
          {caption}
        </Label>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------- compact field ---- */

interface CompactFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: 'currency' | string;
  suffix?: string;
  decimals?: number;
  /** Right-aligned caption under the input — amount in words, "240 months", etc. */
  caption?: string;
  min?: number;
  max?: number;
  slider?: { min: number; max: number; step: number; minLabel?: string; maxLabel?: string };
  /** Rendered to the right of the input, e.g. a Years/Months toggle. */
  trailing?: React.ReactNode;
  resetKey?: number | string;
}

/**
 * Label on the left, value on the right, caption underneath — the dense one-row rhythm the
 * original app uses, which fits three inputs plus the result on a single screen.
 */
export function CompactField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  decimals = 0,
  caption,
  min,
  max,
  slider,
  trailing,
  resetKey,
}: CompactFieldProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  const currency = useCurrency();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value === 0 ? '' : String(round(value, decimals)));
  }, [value, decimals, resetKey]);

  const symbol = prefix === 'currency' ? getCurrency(currency).symbol : prefix;
  const display = focused
    ? text
    : formatNumber(value, { decimals, grouping: getCurrency(currency).grouping });

  const commit = () => {
    editing.current = false;
    setFocused(false);
    let next = parseNumber(text);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(round(next, decimals));
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.compactRow}>
        <Label size="body" style={styles.compactLabel} numberOfLines={2}>
          {label}
        </Label>
        <View
          style={[
            styles.compactBox,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: focused ? colors.accent : colors.border,
              borderRadius: radius.sm,
              paddingHorizontal: spacing.sm + 2,
            },
          ]}
        >
          {symbol ? (
            <Label size="body" tone="muted" weight="medium">
              {symbol}
            </Label>
          ) : null}
          <TextInput
            value={display}
            onChangeText={setText}
            onFocus={() => {
              editing.current = true;
              setFocused(true);
              setText(value === 0 ? '' : String(round(value, decimals)));
            }}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
            selectTextOnFocus
            accessibilityLabel={label}
            textAlign="right"
            style={[
              styles.input,
              {
                color: colors.text,
                fontSize: fontSize.subhead,
                fontWeight: fontWeight.semibold,
                paddingVertical: spacing.sm + 1,
              },
            ]}
          />
          {suffix ? (
            <Label size="caption" tone="accent" weight="semibold">
              {suffix}
            </Label>
          ) : null}
        </View>
        {trailing}
      </View>

      {caption ? (
        <Label size="micro" tone="faint" align="right" numberOfLines={1} style={styles.compactCaption}>
          {caption}
        </Label>
      ) : null}

      {slider ? (
        <SliderRow
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={value}
          onChange={(next) => onChange(round(next, decimals))}
          minLabel={slider.minLabel}
          maxLabel={slider.maxLabel}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ slider row ---- */

interface SliderRowProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  minLabel?: string;
  maxLabel?: string;
}

export function SliderRow({ min, max, step, value, onChange, minLabel, maxLabel }: SliderRowProps) {
  const { colors, spacing } = useTheme();
  const lastHaptic = useRef(value);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.sliderBar}>
        <Slider
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={Math.min(Math.max(value, min), max)}
          onValueChange={(next) => {
            onChange(next);
            // One tick per ~5% of travel, so dragging feels responsive without buzzing constantly.
            if (Math.abs(next - lastHaptic.current) >= (max - min) / 20) {
              lastHaptic.current = next;
              void Haptics.selectionAsync();
            }
          }}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.track}
          // No thumbTintColor: the system thumb stays visible against the accent-filled track.
          style={styles.slider}
        />
      </View>
      {minLabel || maxLabel ? (
        <View style={styles.sliderLabels}>
          <Label size="micro" tone="faint">
            {minLabel}
          </Label>
          <Label size="micro" tone="faint">
            {maxLabel}
          </Label>
        </View>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------- segmented control ---- */

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <Label size="caption" tone="muted" style={{ marginBottom: spacing.xs }}>
          {label}
        </Label>
      ) : null}
      <View
        style={[
          styles.segmentTrack,
          { backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: 3 },
        ]}
      >
        {segments.map((segment) => {
          const active = segment.value === value;
          return (
            <Pressable
              key={segment.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(segment.value);
              }}
              style={[
                styles.segment,
                {
                  backgroundColor: active ? colors.segmentActive : 'transparent',
                  borderRadius: radius.sm + 1,
                  paddingVertical: spacing.sm,
                },
              ]}
            >
              <Label
                size="caption"
                weight={active ? 'semibold' : 'medium'}
                tone={active ? 'default' : 'muted'}
                numberOfLines={1}
              >
                {segment.label}
              </Label>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ date field ---- */

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const { colors, radius, spacing, mode } = useTheme();
  const [open, setOpen] = useState(false);
  const { year, month, day } = parseISO(value);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Label size="caption" tone="muted" style={{ marginBottom: spacing.xs }}>
        {label}
      </Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDate(value)}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.fieldBox,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md + 1,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Label size="subhead" weight="semibold">
          {formatDate(value)}
        </Label>
        <View style={styles.spacer} />
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Label size="subhead" weight="semibold" align="center">
              {label}
            </Label>
            <DateTimePicker
              value={new Date(year, month - 1, day)}
              mode="date"
              display="spinner"
              themeVariant={mode}
              onChange={(_, date) => {
                if (!date) return;
                onChange(toISO({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }));
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={[
                styles.modalDone,
                { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md },
              ]}
            >
              <Label size="body" weight="semibold" align="center" style={{ color: colors.onAccent }}>
                Done
              </Label>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* --------------------------------------------------------------- stepper ---- */

export function StepperField({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    void Haptics.selectionAsync();
    onChange(next);
  };
  return (
    <View style={[styles.stepperRow, { marginBottom: spacing.md }]}>
      <Label size="body">{label}</Label>
      <View style={[styles.stepper, { backgroundColor: colors.surfaceSunken, borderRadius: radius.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => step(-1)}
          style={styles.stepperButton}
        >
          <Ionicons name="remove" size={18} color={value <= min ? colors.textFaint : colors.accent} />
        </Pressable>
        <Label size="body" weight="semibold" tabular style={styles.stepperValue}>
          {value}
          {suffix ? ` ${suffix}` : ''}
        </Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={() => step(1)}
          style={styles.stepperButton}
        >
          <Ionicons name="add" size={18} color={value >= max ? colors.textFaint : colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------- text field ---- */

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Label size="caption" tone="muted" style={{ marginBottom: spacing.xs }}>
        {label}
      </Label>
      <View
        style={[
          styles.fieldBox,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: focused ? colors.accent : colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              color: colors.text,
              fontSize: fontSize.subhead,
              fontWeight: fontWeight.medium,
              paddingVertical: spacing.md,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowFieldLabel: { flex: 1 },
  rowFieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1.25,
  },
  rowFieldCaption: { marginTop: 5 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactLabel: { flex: 1 },
  compactBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 150,
    flexShrink: 0,
  },
  compactCaption: { marginTop: 3 },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1 },
  // The Slider itself is left unstyled. iOS 26 draws UISlider with a capsule thumb and gives it a
  // native shadow; the wrapper reserves the vertical room instead of resizing the control.
  slider: {},
  sliderBar: { height: 34, justifyContent: 'center' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  segmentTrack: { flexDirection: 'row', gap: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360 },
  modalDone: { marginTop: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperButton: { paddingHorizontal: 14, paddingVertical: 8 },
  stepperValue: { minWidth: 44, textAlign: 'center' },
});
