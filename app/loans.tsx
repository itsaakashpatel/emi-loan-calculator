import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressRing } from '../src/components/charts';
import { Screen } from '../src/components/Screen';
import { Button, Card, Chip, EmptyState, Label } from '../src/components/primitives';
import { daysBetween, formatDate, todayISO } from '../src/lib/format/date';
import { formatMoney, formatTenure } from '../src/lib/format/money';
import { LOAN_TYPES } from '../src/store/calculator';
import { useLoansStore, type LoanWithProgress } from '../src/store/loans';
import { useTheme } from '../src/theme/ThemeProvider';

export default function LoansScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const items = useLoansStore((s) => s.items);
  const loading = useLoansStore((s) => s.loading);
  const refresh = useLoansStore((s) => s.refresh);

  // Payments can change on the detail screen, so re-read whenever this tab comes forward.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const active = items.filter((item) => !item.isClosed);
  const closed = items.filter((item) => item.isClosed);

  if (loading) return <Screen />;

  if (items.length === 0) {
    return (
      <Screen>
        <Card>
          <EmptyState
            icon="wallet-outline"
            title="No loans saved yet"
            message="Work out an EMI on the calculator tab, then save it here to track every instalment."
            action={
              <Button
                label="Add a loan"
                icon="add-outline"
                fullWidth={false}
                onPress={() => router.push('/loan/form')}
              />
            }
          />
        </Card>
      </Screen>
    );
  }

  const totals = active.reduce(
    (acc, item) => ({
      outstanding: acc.outstanding + item.outstanding,
      monthly: acc.monthly + item.result.emi,
    }),
    { outstanding: 0, monthly: 0 },
  );

  return (
    <Screen>
      {active.length > 0 ? (
        <Card>
          <View style={styles.totalsRow}>
            <View style={styles.flex}>
              <Label size="caption" tone="muted">
                Total outstanding
              </Label>
              <Label size="display" weight="bold" tabular>
                {formatMoney(totals.outstanding, { currency: active[0]!.loan.currency })}
              </Label>
            </View>
            <View>
              <Label size="caption" tone="muted" align="right">
                Monthly
              </Label>
              <Label size="subhead" weight="semibold" tabular align="right">
                {formatMoney(totals.monthly, { currency: active[0]!.loan.currency })}
              </Label>
            </View>
          </View>
        </Card>
      ) : null}

      {active.map((item) => (
        <LoanCard key={item.loan.id} item={item} onPress={() => router.push(`/loan/${item.loan.id}`)} />
      ))}

      {closed.length > 0 ? (
        <>
          <Label
            size="caption"
            weight="semibold"
            tone="muted"
            style={{ marginTop: spacing.sm, marginBottom: spacing.sm, marginLeft: spacing.xs, letterSpacing: 0.6 }}
          >
            CLOSED
          </Label>
          {closed.map((item) => (
            <LoanCard key={item.loan.id} item={item} onPress={() => router.push(`/loan/${item.loan.id}`)} />
          ))}
        </>
      ) : null}

      <Button label="Add a loan" icon="add-outline" variant="secondary" onPress={() => router.push('/loan/form')} />
    </Screen>
  );
}

function LoanCard({ item, onPress }: { item: LoanWithProgress; onPress: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const { loan, result } = item;
  const currency = loan.currency;
  const typeMeta = LOAN_TYPES.find((t) => t.value === loan.type);
  const overdue = item.overdueCount > 0;
  const dueInDays = item.nextDueDate ? daysBetween(todayISO(), item.nextDueDate) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${loan.name}, ${Math.round(item.progressPct)} percent paid`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginBottom: spacing.md,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View
          style={[styles.typeIcon, { backgroundColor: colors.accentSoft, borderRadius: radius.sm }]}
        >
          <Ionicons
            name={(typeMeta?.icon ?? 'wallet-outline') as keyof typeof Ionicons.glyphMap}
            size={18}
            color={colors.accent}
          />
        </View>
        <View style={styles.flex}>
          <Label size="body" weight="semibold" numberOfLines={1}>
            {loan.name}
          </Label>
          <Label size="caption" tone="muted">
            {formatMoney(loan.principal, { currency })} · {loan.annualRate}% · {formatTenure(loan.tenureMonths)}
          </Label>
        </View>
        <ProgressRing
          pct={item.progressPct}
          color={item.isClosed ? colors.positive : overdue ? colors.negative : colors.accent}
        />
      </View>

      <View style={[styles.cardStats, { marginTop: spacing.md, gap: spacing.lg }]}>
        <Stat label="Outstanding" value={formatMoney(item.outstanding, { currency })} />
        <Stat label="EMI" value={formatMoney(result.emi, { currency })} />
        <Stat
          label="Paid"
          value={`${item.paidCount}/${result.tenureMonths}`}
        />
      </View>

      <View style={[styles.cardFooter, { marginTop: spacing.md, gap: spacing.sm }]}>
        {item.isClosed ? (
          <Chip label="Fully repaid" tone="positive" icon="checkmark-circle-outline" />
        ) : overdue ? (
          <Chip
            label={`${item.overdueCount} overdue`}
            tone="negative"
            icon="alert-circle-outline"
          />
        ) : dueInDays !== null ? (
          <Chip
            label={
              dueInDays === 0
                ? 'Due today'
                : dueInDays > 0
                  ? `Due in ${dueInDays} day${dueInDays === 1 ? '' : 's'}`
                  : `Due ${formatDate(item.nextDueDate!)}`
            }
            tone={dueInDays <= 3 ? 'warning' : 'neutral'}
            icon="calendar-outline"
          />
        ) : null}
        {loan.events.length > 0 ? (
          <Chip label={`${loan.events.length} adjustment${loan.events.length > 1 ? 's' : ''}`} tone="accent" />
        ) : null}
      </View>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <Label size="micro" tone="faint">
        {label}
      </Label>
      <Label size="caption" weight="semibold" tabular numberOfLines={1}>
        {value}
      </Label>
    </View>
  );
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: 'row', alignItems: 'flex-end' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  cardStats: { flexDirection: 'row' },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  flex: { flex: 1 },
});
