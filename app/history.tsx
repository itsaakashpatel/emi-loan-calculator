import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { Screen } from '../src/components/Screen';
import { Card, EmptyState, Label, ListRow } from '../src/components/primitives';
import { clearCalculations, listCalculations, type SavedCalculation } from '../src/db/calculations';
import type { LoanInput } from '../src/lib/finance/types';
import { formatDate } from '../src/lib/format/date';
import { formatMoney, formatPercent } from '../src/lib/format/money';
import { useCalculatorStore } from '../src/store/calculator';
import { useCurrency } from '../src/store/settings';
import { useTheme } from '../src/theme/ThemeProvider';

export default function HistoryScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { spacing } = useTheme();
  const currency = useCurrency();
  // The SIP tab links here with ?kind=invest; Home omits it and gets loan history.
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind = kindParam === 'invest' ? 'invest' : 'loan';
  const [items, setItems] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const rows = await listCalculations(kind);
    setItems(rows);
    setLoading(false);
  }, [kind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmClearAll = useCallback(() => {
    Alert.alert('Clear all history?', 'Every saved calculation will be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearCalculations(kind);
            await load();
          })();
        },
      },
    ]);
  }, [load, kind]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        headerRight: () =>
          items.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={confirmClearAll} hitSlop={10}>
              <Label size="body" tone="accent" weight="medium">
                Clear all
              </Label>
            </Pressable>
          ) : null,
      });
    }, [navigation, items.length, confirmClearAll]),
  );

  const openCalculation = (item: SavedCalculation) => {
    if (kind === 'invest') {
      // Investment entries record which calculator produced them, so reopen that screen.
      const calculator = (item.inputs as { calculator?: string }).calculator;
      if (calculator) router.replace(`/invest/${calculator}` as never);
      return;
    }
    useCalculatorStore.getState().loadFrom(item.inputs as unknown as LoanInput);
    router.replace('/loan/emi');
  };

  if (loading) return <Screen />;

  if (items.length === 0) {
    return (
      <Screen>
        <Card>
          <EmptyState
            icon="time-outline"
            title="No saved calculations"
            message={
              kind === 'invest'
                ? 'Every investment calculation you run is saved here automatically, newest first.'
                : 'Every EMI calculation you run is saved here automatically, newest first.'
            }
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card padded={false}>
        {items.map((item, index) => {
          const inputs = item.inputs as Partial<LoanInput>;
          const principal = typeof inputs.principal === 'number' ? inputs.principal : 0;
          const annualRate = typeof inputs.annualRate === 'number' ? inputs.annualRate : 0;
          const tenureMonths = typeof inputs.tenureMonths === 'number' ? inputs.tenureMonths : 0;
          const isInvest = kind === 'invest';
          return (
            <ListRow
              key={item.id}
              title={
                isInvest
                  ? item.title
                  : `Amount - ${formatMoney(principal, { currency })} (${formatPercent(annualRate)})`
              }
              subtitle={isInvest ? undefined : `${tenureMonths} Months`}
              value={formatDate(item.createdAt.slice(0, 10))}
              icon="time-outline"
              onPress={() => openCalculation(item)}
              last={index === items.length - 1}
            />
          );
        })}
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        {kind === 'invest'
          ? 'Tap an entry to reopen that calculator.'
          : 'Tap a calculation to load it back into the EMI calculator.'}
      </Label>
    </Screen>
  );
}
