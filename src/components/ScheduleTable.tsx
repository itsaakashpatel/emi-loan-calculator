import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatMonthYear, monthShort, parseISO } from '../lib/format/date';
import { formatMoney } from '../lib/format/money';
import { useCurrency } from '../store/settings';
import { useTheme } from '../theme/ThemeProvider';
import type { ScheduleRow, YearGroup } from '../lib/finance/types';
import { Chip, Label } from './primitives';

/**
 * Year-wise amortisation table that expands into month rows, mirroring how the original app
 * presents the schedule. Amounts are shown in full (no `formatCompact` rounding) with the
 * currency symbol carried once in each header, the way the original app avoids repeating it in
 * every cell — that's what keeps four columns of real numbers legible on a phone.
 */
export function ScheduleTable({
  yearly,
  /** Installments already settled, so the loan manager can tick them off. */
  paidInstallments,
  onToggleRow,
  initiallyExpandedYear,
}: {
  yearly: YearGroup[];
  paidInstallments?: ReadonlySet<number>;
  onToggleRow?: (row: ScheduleRow) => void;
  initiallyExpandedYear?: number;
}) {
  const { colors, spacing, radius } = useTheme();
  const currency = useCurrency();
  const money = (v: number) => formatMoney(v, { currency, symbol: false });
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(initiallyExpandedYear !== undefined ? [initiallyExpandedYear] : []),
  );

  const toggle = (year: number) => {
    void Haptics.selectionAsync();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <View>
      <View
        style={[
          styles.headerRow,
          { borderBottomColor: colors.border, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
        ]}
      >
        <Label size="micro" tone="faint" weight="semibold" numberOfLines={1} style={styles.colPeriod}>
          PERIOD
        </Label>
        <Label size="micro" tone="faint" weight="semibold" align="right" numberOfLines={1} style={styles.colNum}>
          PRINCIPAL
        </Label>
        <Label size="micro" tone="faint" weight="semibold" align="right" numberOfLines={1} style={styles.colNum}>
          INTEREST
        </Label>
        <Label size="micro" tone="faint" weight="semibold" align="right" numberOfLines={1} style={styles.colBalance}>
          BALANCE
        </Label>
      </View>

      {yearly.map((group) => {
        const open = expanded.has(group.year);
        return (
          <View key={group.year}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`Year ${group.year}, ${Math.round(group.paidPct)} percent repaid`}
              onPress={() => toggle(group.year)}
              style={({ pressed }) => [
                styles.yearRow,
                {
                  backgroundColor: open ? colors.surfaceAlt : 'transparent',
                  borderBottomColor: colors.border,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.sm,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={[styles.colPeriod, styles.yearLabel]}>
                <Ionicons
                  name={open ? 'chevron-down' : 'chevron-forward'}
                  size={13}
                  color={colors.textFaint}
                />
                <Label size="body" weight="semibold">
                  {group.year}
                </Label>
              </View>
              <Label size="micro" weight="medium" align="right" tabular numberOfLines={1} style={styles.colNum}>
                {money(group.principal)}
              </Label>
              <Label size="micro" weight="medium" align="right" tabular numberOfLines={1} style={styles.colNum} tone="warning">
                {money(group.interest)}
              </Label>
              <Label size="micro" align="right" tabular numberOfLines={1} style={styles.colBalance} tone="muted">
                {money(group.closing)}
              </Label>
            </Pressable>

            {open
              ? group.rows.map((row) => {
                  const paid = paidInstallments?.has(row.no) ?? false;
                  const inner = (
                    <View
                      style={[
                        styles.monthRow,
                        {
                          borderBottomColor: colors.border,
                          paddingVertical: spacing.sm + 1,
                          paddingHorizontal: spacing.xs,
                          backgroundColor: paid ? colors.positiveSoft : colors.surfaceAlt,
                        },
                      ]}
                    >
                      <View style={[styles.colPeriod, styles.monthLabel]}>
                        {onToggleRow ? (
                          <Ionicons
                            name={paid ? 'checkmark-circle' : 'ellipse-outline'}
                            size={15}
                            color={paid ? colors.positive : colors.textFaint}
                          />
                        ) : null}
                        <Label size="caption" tone={paid ? 'positive' : 'muted'}>
                          {monthShort(parseISO(row.date).month)}
                        </Label>
                        {row.moratorium ? (
                          <Chip label={row.moratorium === 'full' ? 'EMI holiday' : 'Interest only'} tone="warning" />
                        ) : null}
                        {row.prepayment > 0 ? <Chip label="Prepaid" tone="accent" /> : null}
                      </View>
                      <Label size="micro" align="right" tabular numberOfLines={1} style={styles.colNum}>
                        {money(row.principal + row.prepayment)}
                      </Label>
                      <Label size="micro" align="right" tabular numberOfLines={1} style={styles.colNum} tone="muted">
                        {money(row.interest)}
                      </Label>
                      <Label size="micro" align="right" tabular numberOfLines={1} style={styles.colBalance} tone="muted">
                        {money(row.closing)}
                      </Label>
                    </View>
                  );

                  return onToggleRow ? (
                    <Pressable
                      key={row.no}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: paid }}
                      accessibilityLabel={`Installment ${row.no}, ${formatMoney(row.emi, { currency })} due ${formatMonthYear(row.date)}`}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onToggleRow(row);
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      {inner}
                    </Pressable>
                  ) : (
                    <View key={row.no}>{inner}</View>
                  );
                })
              : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  yearRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  monthRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  colPeriod: { flex: 1.1 },
  colNum: { flex: 1 },
  /** The balance column carries the largest running totals, so it gets extra room. */
  colBalance: { flex: 1.25 },
  yearLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, flexWrap: 'wrap' },
});
