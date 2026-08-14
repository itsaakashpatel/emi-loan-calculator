import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { LOAN_TYPES, type LoanType } from '../store/calculator';
import { useTheme } from '../theme/ThemeProvider';
import { Label } from './primitives';

/**
 * Horizontal row of loan-type pills.
 *
 * The row owns its own scroll view and pulls it out to the container's padding, so a pill that runs
 * past the edge is cut at the card boundary instead of being sliced inside the card's inner margin
 * — which reads as a rendering fault rather than as "there is more to scroll". Same treatment as
 * `SelectChipRow`.
 */
export function LoanTypeSelector({
  value,
  onChange,
  bleed,
}: {
  value: LoanType;
  onChange: (type: LoanType) => void;
  /** Horizontal padding of the container this row sits in — a `Card` uses `spacing.lg`. */
  bleed?: number;
}) {
  const { spacing } = useTheme();
  const inset = bleed ?? spacing.lg;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -inset }}
      contentContainerStyle={[styles.row, { paddingHorizontal: inset, gap: spacing.sm }]}
    >
      {LOAN_TYPES.map((type) => (
        <LoanTypePill
          key={type.value}
          icon={type.icon as keyof typeof Ionicons.glyphMap}
          label={type.label}
          active={type.value === value}
          onPress={() => {
            if (type.value !== value) void Haptics.selectionAsync();
            onChange(type.value);
          }}
        />
      ))}
    </ScrollView>
  );
}

function LoanTypePill({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} loan`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? colors.accent : colors.surfaceAlt,
          borderRadius: radius.md,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={15} color={active ? colors.onAccent : colors.textMuted} />
      <Label
        size="caption"
        weight={active ? 'semibold' : 'medium'}
        numberOfLines={1}
        style={{ color: active ? colors.onAccent : colors.textMuted }}
      >
        {label}
      </Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
