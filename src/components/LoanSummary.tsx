import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatDate, formatMonthYear } from '../lib/format/date';
import { formatMoney, formatPercent, formatTenure, getCurrency } from '../lib/format/money';
import { useCurrency } from '../store/settings';
import { useTheme } from '../theme/ThemeProvider';
import type { LoanResult } from '../lib/finance/types';
import type { PrepaymentSavings } from '../lib/finance/emi';
import { ChartLegend, DonutChart, StackedBarChart } from './charts';
import { Card, Chip, KeyValueRow, Label } from './primitives';

/** The headline result block: EMI, a principal-vs-interest donut, and the cost breakdown. */
export function LoanResultCard({
  result,
  savings,
  title = 'Your EMI',
}: {
  result: LoanResult;
  savings?: PrepaymentSavings;
  title?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const currency = useCurrency();
  const money = (value: number) => formatMoney(value, { currency });

  const slices = [
    { label: 'Principal', value: result.principal, color: colors.principal },
    { label: 'Interest', value: result.totalInterest, color: colors.interest },
  ];
  const interestShare = result.totalPayment > 0 ? (result.totalInterest / result.totalPayment) * 100 : 0;

  return (
    <Card>
      <View style={styles.emiHeader}>
        <View style={styles.flex}>
          <Label size="caption" tone="muted">
            {title}
          </Label>
          <Label size="hero" weight="bold" tabular>
            {money(result.emi)}
          </Label>
          <Label size="caption" tone="faint">
            per month · {formatTenure(result.tenureMonths)}
          </Label>
          {result.lastEmi > 0 && Math.abs(result.lastEmi - result.emi) > 1 ? (
            <View style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }}>
              <Chip label={`Final EMI ${money(result.lastEmi)}`} tone="accent" />
            </View>
          ) : null}
        </View>
        <DonutChart
          slices={slices}
          centerLabel="Interest"
          centerValue={formatPercent(interestShare, 0)}
        />
      </View>

      <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        <ChartLegend
          items={[
            { label: 'Principal', color: colors.principal, value: money(result.principal) },
            { label: 'Interest', color: colors.interest, value: money(result.totalInterest) },
          ]}
        />
      </View>

      {result.advanceAmount > 0 ? (
        <KeyValueRow
          label={`Advance EMIs (${result.advanceEmis})`}
          value={money(result.advanceAmount)}
          hint="Collected upfront at disbursement"
        />
      ) : null}
      {result.totalPrepayment > 0 ? (
        <KeyValueRow label="Part payments" value={money(result.totalPrepayment)} tone="accent" />
      ) : null}
      {result.capitalisedInterest > 0 ? (
        <KeyValueRow
          label="Interest added to principal"
          value={money(result.capitalisedInterest)}
          hint="Accrued during the EMI holiday"
          tone="warning"
        />
      ) : null}
      {result.fees > 0 ? <KeyValueRow label="Fees & charges" value={money(result.fees)} /> : null}
      <KeyValueRow label="Total interest" value={money(result.totalInterest)} tone="warning" />
      <KeyValueRow label="Total payment" value={money(result.totalPayment)} emphasis />
      <KeyValueRow
        label="Loan period"
        value={`${formatMonthYear(result.firstPaymentDate)} – ${formatMonthYear(result.lastPaymentDate)}`}
        hint={`First EMI on ${formatDate(result.firstPaymentDate)}`}
        last
      />

      {savings && (savings.monthsSaved > 0 || savings.interestSaved > 0.5) ? (
        <View
          style={{
            backgroundColor: colors.positiveSoft,
            borderRadius: radius.md,
            padding: spacing.md,
            marginTop: spacing.md,
          }}
        >
          <Label size="caption" weight="semibold" tone="positive">
            You save {money(savings.interestSaved)} in interest
          </Label>
          {savings.monthsSaved > 0 ? (
            <Label size="micro" tone="positive">
              and close the loan {formatTenure(savings.monthsSaved)} earlier
            </Label>
          ) : (
            <Label size="micro" tone="positive">
              keeping the same {formatTenure(result.tenureMonths)} tenure
            </Label>
          )}
        </View>
      ) : null}
    </Card>
  );
}

/** Yearly principal-vs-interest outflow, stacked. */
export function YearlyOutflowChart({ result }: { result: LoanResult }) {
  const { colors, spacing } = useTheme();
  const currency = useCurrency();
  // The chart has to fit the card exactly, so it is sized from the measured container.
  const [width, setWidth] = useState(0);

  if (result.yearly.length < 2) return null;

  const bars = result.yearly.map((group) => ({
    label: String(group.year),
    segments: [
      { value: group.principal, color: colors.principal },
      { value: group.interest, color: colors.interest },
    ],
  }));

  return (
    <Card title="Yearly outflow">
      <View
        style={styles.chartScroll}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? <StackedBarChart bars={bars} width={width} /> : null}
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <ChartLegend
          items={[
            { label: 'Principal', color: colors.principal },
            { label: 'Interest', color: colors.interest },
          ]}
        />
      </View>
      <Label size="micro" tone="faint" style={{ marginTop: spacing.xs }}>
        Totals per calendar year, in {getCurrency(currency).symbol}.
      </Label>
    </Card>
  );
}

const styles = StyleSheet.create({
  emiHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  chartScroll: { alignItems: 'center' },
});
