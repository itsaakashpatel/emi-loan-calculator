import { useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { RowField } from '../../src/components/inputs';
import { ActionButtons, Card, KeyValueRow, Label } from '../../src/components/primitives';
import { amortize } from '../../src/lib/finance/emi';
import { amountToWords, formatMoney, getCurrency } from '../../src/lib/format/money';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

const DEFAULT_AMOUNT = 1_000_000;
const DEFAULT_PERIOD_YEARS = 20;

/** The stripped-back EMI calculator: amount, rate, period -> EMI, total interest, total payment. */
export default function QuickCalculatorScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();
  const defaultRate = useSettingsStore((s) => s.defaultRate);

  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [rate, setRate] = useState(defaultRate || 9);
  const [periodYears, setPeriodYears] = useState(DEFAULT_PERIOD_YEARS);

  const tenureMonths = Math.max(1, Math.round(periodYears * 12));
  const result = useMemo(
    () => amortize({ principal: amount, annualRate: rate, tenureMonths }),
    [amount, rate, tenureMonths],
  );

  const money = (value: number) => formatMoney(value, { currency });
  const grouping = getCurrency(currency).grouping;

  const reset = () => {
    setAmount(DEFAULT_AMOUNT);
    setRate(defaultRate || 9);
    setPeriodYears(DEFAULT_PERIOD_YEARS);
  };

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Monthly EMI
        </Label>
        <Label size="hero" weight="bold" tabular>
          {money(result.emi)}
        </Label>
        <Label size="micro" tone="faint">
          {amountToWords(result.emi, grouping)}
        </Label>
      </Card>

      <Card title="Inputs">
        <RowField label="Loan Amount" value={amount} onChange={setAmount} prefix="currency" min={0} />
        <RowField
          label="Interest Rate"
          value={rate}
          onChange={setRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <RowField
          label="Loan Period"
          value={periodYears}
          onChange={setPeriodYears}
          suffix="yr"
          min={1}
          max={40}
        />
        <ActionButtons onReset={reset} onCalculate={() => Keyboard.dismiss()} />
      </Card>

      <Card title="Results">
        <KeyValueRow label="Monthly EMI" value={money(result.emi)} emphasis />
        <KeyValueRow label="Total Interest" value={money(result.totalInterest)} tone="warning" />
        <KeyValueRow label="Total Payment" value={money(result.totalPayment)} emphasis last />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Assumes a fixed interest rate for the full tenure, with no prepayments, fees or rate changes.
      </Label>
    </Screen>
  );
}
