import { useMemo } from 'react';
import { Alert, View } from 'react-native';

import { useHeaderAction } from '../../src/components/Header';
import { CompactField, DateField, TenureField } from '../../src/components/inputs';
import { YearlyOutflowChart } from '../../src/components/LoanSummary';
import { ScheduleTable } from '../../src/components/ScheduleTable';
import { Screen } from '../../src/components/Screen';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { amortize } from '../../src/lib/finance/emi';
import { amountToWords, formatMoney, formatTenure, getCurrency } from '../../src/lib/format/money';
import { scheduleCsv } from '../../src/lib/csv';
import { shareCsv, sharePdf } from '../../src/pdf/share';
import { scheduleHtml } from '../../src/pdf/templates';
import { useCalculatorStore, useLoanInput } from '../../src/store/calculator';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function ScheduleScreen() {
  const input = useLoanInput();
  const currency = useCurrency();

  const { spacing } = useTheme();
  const grouping = getCurrency(currency).grouping;

  // The same values as the EMI calculator: a change here carries back there, and the other way round.
  const principal = useCalculatorStore((s) => s.principal);
  const annualRate = useCalculatorStore((s) => s.annualRate);
  const tenureMonths = useCalculatorStore((s) => s.tenureMonths);
  const startDate = useCalculatorStore((s) => s.startDate);
  const revision = useCalculatorStore((s) => s.revision);
  const setPrincipal = useCalculatorStore((s) => s.setPrincipal);
  const setAnnualRate = useCalculatorStore((s) => s.setAnnualRate);
  const setTenureMonths = useCalculatorStore((s) => s.setTenureMonths);
  const setStartDate = useCalculatorStore((s) => s.setStartDate);

  const result = useMemo(() => amortize(input), [input]);
  const money = (value: number) => formatMoney(value, { currency });

  useHeaderAction({
    icon: 'share-outline',
    label: 'Export schedule',
    onPress: () =>
      Alert.alert('Export schedule', undefined, [
        { text: 'PDF', onPress: () => void sharePdf(scheduleHtml(result, currency), 'amortisation-schedule') },
        { text: 'CSV for Excel', onPress: () => void shareCsv(scheduleCsv(result), 'amortisation-schedule') },
        { text: 'Cancel', style: 'cancel' },
      ]),
  });

  return (
    <Screen>
      <Card>
        <CompactField
          label="Loan amount"
          value={principal}
          onChange={setPrincipal}
          prefix="currency"
          caption={amountToWords(principal, grouping)}
          min={0}
          resetKey={revision}
          slider={{ min: 50_000, max: 20_000_000, step: 50_000, minLabel: '50 K', maxLabel: '2 Cr' }}
        />
        <CompactField
          label="Interest rate"
          value={annualRate}
          onChange={setAnnualRate}
          suffix="%"
          decimals={2}
          min={0}
          max={60}
          resetKey={revision}
          slider={{ min: 1, max: 24, step: 0.05, minLabel: '1%', maxLabel: '24%' }}
        />
        <TenureField label="Tenure" months={tenureMonths} onChange={setTenureMonths} resetKey={revision} slider compact />
        <DateField label="Loan start date" value={startDate} onChange={setStartDate} />
      </Card>

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

    </Screen>
  );
}
