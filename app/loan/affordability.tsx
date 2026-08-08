import { useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { RowField } from '../../src/components/inputs';
import { ActionButtons, Card, KeyValueRow, Label } from '../../src/components/primitives';
import { calculateAffordability } from '../../src/lib/finance/loan-tools';
import { amountToWords, formatMoney, getCurrency } from '../../src/lib/format/money';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

const DEFAULTS = {
  monthlyIncome: 100_000,
  existingEmis: 0,
  foirPct: 50,
  periodYears: 20,
  downPayment: 500_000,
};

/** How much house/car/asset someone can afford, given income, obligations and a down payment. */
export default function AffordabilityScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();
  const defaultRate = useSettingsStore((s) => s.defaultRate);

  const [monthlyIncome, setMonthlyIncome] = useState(DEFAULTS.monthlyIncome);
  const [existingEmis, setExistingEmis] = useState(DEFAULTS.existingEmis);
  const [foirPct, setFoirPct] = useState(DEFAULTS.foirPct);
  const [annualRate, setAnnualRate] = useState(defaultRate || 9);
  const [periodYears, setPeriodYears] = useState(DEFAULTS.periodYears);
  const [downPayment, setDownPayment] = useState(DEFAULTS.downPayment);

  const tenureMonths = Math.max(1, Math.round(periodYears * 12));
  const result = useMemo(
    () => calculateAffordability({ monthlyIncome, foirPct, existingEmis, annualRate, tenureMonths, downPayment }),
    [monthlyIncome, foirPct, existingEmis, annualRate, tenureMonths, downPayment],
  );

  const money = (value: number) => formatMoney(value, { currency });
  const grouping = getCurrency(currency).grouping;

  const reset = () => {
    setMonthlyIncome(DEFAULTS.monthlyIncome);
    setExistingEmis(DEFAULTS.existingEmis);
    setFoirPct(DEFAULTS.foirPct);
    setAnnualRate(defaultRate || 9);
    setPeriodYears(DEFAULTS.periodYears);
    setDownPayment(DEFAULTS.downPayment);
  };

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Affordable property price
        </Label>
        <Label size="hero" weight="bold" tabular>
          {money(result.affordablePrice)}
        </Label>
        <Label size="micro" tone="faint">
          {amountToWords(result.affordablePrice, grouping)}
        </Label>
      </Card>

      <Card title="Inputs">
        <RowField
          label="Gross Monthly Income"
          value={monthlyIncome}
          onChange={setMonthlyIncome}
          prefix="currency"
          min={0}
        />
        <RowField
          label="Existing EMIs"
          value={existingEmis}
          onChange={setExistingEmis}
          prefix="currency"
          min={0}
        />
        <RowField
          label="Income Available for EMI"
          value={foirPct}
          onChange={setFoirPct}
          suffix="%"
          min={0}
          max={100}
        />
        <RowField
          label="Interest Rate"
          value={annualRate}
          onChange={setAnnualRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <RowField label="Loan Period" value={periodYears} onChange={setPeriodYears} suffix="yr" min={1} max={40} />
        <RowField
          label="Down Payment Available"
          value={downPayment}
          onChange={setDownPayment}
          prefix="currency"
          min={0}
        />
        <ActionButtons onReset={reset} onCalculate={() => Keyboard.dismiss()} />
      </Card>

      <Card title="Breakdown">
        <KeyValueRow label="Affordable EMI" value={money(result.eligibleEmi)} />
        <KeyValueRow label="Affordable Loan Amount" value={money(result.loanAmount)} />
        <KeyValueRow label="Down Payment" value={money(result.downPayment)} />
        <KeyValueRow label="Affordable Property Price" value={money(result.affordablePrice)} emphasis last />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Assumes lenders cap total EMIs at the chosen share of income and that the down payment is paid
        entirely upfront; actual eligibility also depends on credit score and lender policy — this is
        an estimate, not an offer.
      </Label>
    </Screen>
  );
}
