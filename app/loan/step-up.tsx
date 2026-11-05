import { useMemo, useState } from 'react';

import { DataTable } from '../../src/components/DataTable';
import { Screen } from '../../src/components/Screen';
import { RowField, TenureField } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { calculateStepUpEmi } from '../../src/lib/finance/step-up';
import { currencyTag, formatMoney, formatNumber, formatTenure } from '../../src/lib/format/money';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Raise the EMI every year with your salary, and see how much sooner the loan closes. */
export default function StepUpEmiScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();
  const defaultRate = useSettingsStore((s) => s.defaultRate);

  const [principal, setPrincipal] = useState(5_000_000);
  const [rate, setRate] = useState(defaultRate || 8.5);
  const [months, setMonths] = useState(240);
  const [stepUp, setStepUp] = useState(5);

  const result = useMemo(
    () => calculateStepUpEmi({ principal, annualRate: rate, tenureMonths: Math.max(1, months), stepUpPct: stepUp }),
    [principal, rate, months, stepUp],
  );
  const money = (value: number) => formatMoney(value, { currency });
  const num = (value: number) => formatNumber(value, { grouping: 'indian' });

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Interest you save
        </Label>
        <Label size="hero" weight="bold" tabular tone="positive">
          {money(result.interestSaved)}
        </Label>
        <Label size="micro" tone="faint">
          {result.monthsSaved > 0
            ? `The loan closes ${formatTenure(result.monthsSaved)} early, in ${formatTenure(result.months)}.`
            : 'Set a yearly rise to see the saving.'}
        </Label>
      </Card>

      <Card title="Loan">
        <RowField label="Loan Amount" value={principal} onChange={setPrincipal} prefix="currency" min={0} />
        <RowField label="Interest Rate" value={rate} onChange={setRate} suffix="% p.a." decimals={2} min={0} max={60} />
        <TenureField label="Loan Period" months={months} onChange={setMonths} compact />
        <RowField
          label="Raise EMI each year by"
          value={stepUp}
          onChange={setStepUp}
          suffix="%"
          decimals={1}
          min={0}
          max={50}
          caption="Most lenders allow this without a fee"
        />
      </Card>

      <Card title="Flat EMI against step-up EMI">
        <KeyValueRow label="EMI in year 1" value={money(result.startEmi)} hint="Same for both" />
        <KeyValueRow label="EMI in the final year" value={money(result.finalEmi)} />
        <KeyValueRow label="Interest, flat EMI" value={money(result.flatInterest)} />
        <KeyValueRow label="Interest, step-up EMI" value={money(result.totalInterest)} tone="positive" />
        <KeyValueRow
          label="Tenure"
          value={formatTenure(result.months)}
          hint={`instead of ${formatTenure(result.flatMonths)}`}
          emphasis
          last
        />
      </Card>

      <Card title="Year by year">
        <DataTable
          columns={[
            { key: 'year', label: 'Year', flex: 0.8 },
            { key: 'emi', label: 'EMI' },
            { key: 'interest', label: 'Interest' },
            { key: 'closing', label: 'Balance' },
          ]}
          rows={result.years.map((y) => [String(y.year), num(y.emi), num(y.interest), num(y.closing)])}
          caption={`Amounts in ${currencyTag(currency)}.`}
        />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        To do this with your lender, ask to raise the EMI or make a part payment each year. Some lenders
        offer a step-up plan when the loan starts.
      </Label>
    </Screen>
  );
}
