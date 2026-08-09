import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl } from '../../src/components/inputs';
import { Button, Card, Label, ListRow } from '../../src/components/primitives';
import { resetDatabase } from '../../src/db/client';
import { COMPOUNDING_LABELS, type Compounding } from '../../src/lib/finance/deposits';
import { CURRENCIES, currencyTag, formatMoney } from '../../src/lib/format/money';
import { useCalculatorStore } from '../../src/store/calculator';
import { useLoansStore } from '../../src/store/loans';
import { useSettingsStore, type ThemePreference } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

const FD_COMPOUNDING: Compounding[] = ['monthly', 'quarterly', 'halfyearly', 'yearly'];

export default function SettingsScreen() {
  const { colors, radius, spacing } = useTheme();

  const currency = useSettingsStore((s) => s.currency);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const defaultRate = useSettingsStore((s) => s.defaultRate);
  const setDefaultRate = useSettingsStore((s) => s.setDefaultRate);
  const defaultTenureYears = useSettingsStore((s) => s.defaultTenureYears);
  const setDefaultTenureYears = useSettingsStore((s) => s.setDefaultTenureYears);
  const defaultFdCompounding = useSettingsStore((s) => s.defaultFdCompounding);
  const setDefaultFdCompounding = useSettingsStore((s) => s.setDefaultFdCompounding);

  const loanCount = useLoansStore((s) => s.items.length);
  const refreshLoans = useLoansStore((s) => s.refresh);

  const confirmClear = () =>
    Alert.alert(
      'Delete all saved data?',
      'Every saved loan, payment record and cached exchange rate will be removed. Your settings are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await resetDatabase();
                await refreshLoans();
                Alert.alert('Done', 'All saved loans and payment history have been deleted.');
              } catch (error) {
                Alert.alert('Could not clear', error instanceof Error ? error.message : 'Unknown error.');
              }
            })();
          },
        },
      ],
    );

  return (
    <Screen floatingTabBar>
      <LargeTitleHeader title="Setting" />
      <Card title="Currency">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {CURRENCIES.map((option) => {
            const active = option.code === currency;
            return (
              <Pressable
                key={option.code}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.name}
                onPress={() => setCurrency(option.code)}
                style={({ pressed }) => [
                  {
                    backgroundColor: active ? colors.accent : colors.surfaceAlt,
                    borderRadius: radius.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    opacity: pressed ? 0.7 : 1,
                    alignItems: 'center',
                  },
                ]}
              >
                <Label
                  size="caption"
                  weight={active ? 'semibold' : 'medium'}
                  style={{ color: active ? colors.onAccent : colors.textMuted }}
                >
                  {currencyTag(option.code)}
                </Label>
              </Pressable>
            );
          })}
        </ScrollView>
        <Label size="micro" tone="faint" style={{ marginTop: spacing.md }}>
          Numbers are grouped {CURRENCIES.find((c) => c.code === currency)?.grouping === 'indian'
            ? 'the Indian way'
            : 'in thousands'}
          , e.g. {formatMoney(12345678, { currency })}.
        </Label>
      </Card>

      <Card title="Appearance">
        <SegmentedControl<ThemePreference>
          segments={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={themePreference}
          onChange={setThemePreference}
        />
      </Card>

      <Card title="Calculator defaults">
        <NumberField
          label="Default interest rate"
          value={defaultRate}
          onChange={setDefaultRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <NumberField
          label="Default tenure"
          value={defaultTenureYears}
          onChange={setDefaultTenureYears}
          suffix="yr"
          min={1}
          max={40}
        />
        <SegmentedControl<Compounding>
          label="Default FD compounding"
          segments={FD_COMPOUNDING.map((value) => ({ value, label: COMPOUNDING_LABELS[value].split('-')[0]! }))}
          value={defaultFdCompounding}
          onChange={setDefaultFdCompounding}
        />
        <Button
          label="Apply defaults to the calculator now"
          variant="secondary"
          icon="refresh-outline"
          onPress={() =>
            useCalculatorStore
              .getState()
              .seedDefaults({ annualRate: defaultRate, tenureYears: defaultTenureYears })
          }
        />
      </Card>

      <Card title="Data" padded={false}>
        <ListRow
          title="Saved loans"
          value={String(loanCount)}
          icon="wallet-outline"
        />
        <ListRow
          title="Storage"
          subtitle="Everything is kept locally in SQLite on this device"
          icon="phone-portrait-outline"
          last
        />
      </Card>

      <Button label="Delete all saved data" variant="danger" icon="trash-outline" onPress={confirmClear} />

      <View style={[styles.about, { marginTop: spacing.xl }]}>
        <Ionicons name="calculator-outline" size={26} color={colors.textFaint} />
        <Label size="caption" tone="muted" align="center" style={{ marginTop: spacing.sm }}>
          EMI Calculator & Loan Manager
        </Label>
        <Label size="micro" tone="faint" align="center">
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Label>
        <Label size="micro" tone="faint" align="center" style={{ marginTop: spacing.md, maxWidth: 300 }}>
          Results are indicative. Your lender's schedule may differ slightly because of day-count
          conventions and rounding. Tax treatment is not modelled.
        </Label>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  about: { alignItems: 'center' },
});
