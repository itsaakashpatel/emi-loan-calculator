import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';

import { LOAN_TYPES, type LoanType } from '../store/calculator';
import { useTheme } from '../theme/ThemeProvider';
import { Label } from './primitives';

/** Horizontal row of loan-type pills. Wrap in a horizontal ScrollView at the call site. */
export function LoanTypeSelector({
  value,
  onChange,
}: {
  value: LoanType;
  onChange: (type: LoanType) => void;
}) {
  return (
    <>
      {LOAN_TYPES.map((type) => (
        <LoanTypePill
          key={type.value}
          icon={type.icon as keyof typeof Ionicons.glyphMap}
          label={type.label}
          active={type.value === value}
          onPress={() => onChange(type.value)}
        />
      ))}
    </>
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
        style={{ color: active ? colors.onAccent : colors.textMuted }}
      >
        {label}
      </Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
