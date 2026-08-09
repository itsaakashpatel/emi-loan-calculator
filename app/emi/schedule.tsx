import { useMemo } from 'react';
import { View } from 'react-native';

import { YearlyOutflowChart } from '../../src/components/LoanSummary';
import { ScheduleTable } from '../../src/components/ScheduleTable';
import { Screen } from '../../src/components/Screen';
import { Button, Card, KeyValueRow, Label } from '../../src/components/primitives';
import { amortize } from '../../src/lib/finance/emi';
import { formatMoney, formatTenure, getCurrency } from '../../src/lib/format/money';
import { sharePdf } from '../../src/pdf/share';
import { scheduleHtml } from '../../src/pdf/templates';
import { useLoanInput } from '../../src/store/calculator';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function ScheduleScreen() {
  const input = useLoanInput();
  const currency = useCurrency();
  const { spacing } = useTheme();
  const result = useMemo(() => amortize(input), [input]);
  const money = (value: number) => formatMoney(value, { currency });

  return (
    <Screen>
      <Card>
        <KeyValueRow label="Loan amount" value={money(result.principal)} />
        <KeyValueRow label="EMI" value={money(result.emi)} emphasis />
        <KeyValueRow label="Installments" value={`${result.tenureMonths} (${formatTenure(result.tenureMonths)})`} />
        {result.advanceAmount > 0 ? (
          <KeyValueRow label={`Advance EMIs (${result.advanceEmis})`} value={money(result.advanceAmount)} />
        ) : null}
        {result.totalPrepayment > 0 ? (
          <KeyValueRow label="Part payments" value={money(result.totalPrepayment)} tone="accent" />
        ) : null}
        {result.fees > 0 ? <KeyValueRow label="Fees & charges" value={money(result.fees)} /> : null}
        <KeyValueRow label="Total interest" value={money(result.totalInterest)} tone="warning" />
        <KeyValueRow label="Total payment" value={money(result.totalPayment)} emphasis last />
      </Card>

      <YearlyOutflowChart result={result} />

      <Card title="Payment schedule" padded={false}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <ScheduleTable
            yearly={result.yearly}
            initiallyExpandedYear={result.yearly[0]?.year}
          />
          <Label size="micro" tone="faint" style={{ marginTop: spacing.md }}>
            All amounts in {getCurrency(currency).symbol}. Tap a year to see its monthly breakdown.
          </Label>
        </View>
      </Card>

      <Button
        label="Export schedule as PDF"
        icon="document-text-outline"
        onPress={() => void sharePdf(scheduleHtml(result, currency), 'amortisation-schedule')}
      />
    </Screen>
  );
}
