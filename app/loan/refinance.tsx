import { useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { DataTable } from '../../src/components/DataTable';
import { Screen } from '../../src/components/Screen';
import { RowField, TenureField } from '../../src/components/inputs';
import { ActionButtons, Card, Label } from '../../src/components/primitives';
import { calculateRefinance } from '../../src/lib/finance/loan-tools';
import { currencyTag, formatMoney, formatNumber, getCurrency } from '../../src/lib/format/money';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

const DEFAULTS = {
  outstandingPrincipal: 1_000_000,
  existingRate: 11,
  existingYears: 15,
  newRate: 8.5,
  newYears: 15,
  switchingCost: 0,
};

/** Compares refinancing an existing loan against a new offer, netting out a switching cost. */
export default function RefinanceScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();
  const defaultRate = useSettingsStore((s) => s.defaultRate);

  const [outstandingPrincipal, setOutstandingPrincipal] = useState(DEFAULTS.outstandingPrincipal);
  const [existingRate, setExistingRate] = useState(DEFAULTS.existingRate);
  const [existingMonths, setExistingMonths] = useState(DEFAULTS.existingYears * 12);
  const [newRate, setNewRate] = useState(defaultRate || DEFAULTS.newRate);
  const [newMonths, setNewMonths] = useState(DEFAULTS.newYears * 12);
  const [switchingCost, setSwitchingCost] = useState(DEFAULTS.switchingCost);

  const result = useMemo(
    () =>
      calculateRefinance({
        outstandingPrincipal,
        existingAnnualRate: existingRate,
        existingTenureMonths: Math.max(1, Math.round(existingMonths)),
        newAnnualRate: newRate,
        newTenureMonths: Math.max(1, Math.round(newMonths)),
        switchingCost,
      }),
    [outstandingPrincipal, existingRate, existingMonths, newRate, newMonths, switchingCost],
  );

  const money = (value: number) => formatMoney(value, { currency });
  const grouping = getCurrency(currency).grouping;
  const num = (value: number) => formatNumber(value, { grouping });
  const signedNum = (value: number) => (value > 0 ? `+${num(value)}` : num(value));

  const reset = () => {
    setOutstandingPrincipal(DEFAULTS.outstandingPrincipal);
    setExistingRate(DEFAULTS.existingRate);
    setExistingMonths(DEFAULTS.existingYears * 12);
    setNewRate(defaultRate || DEFAULTS.newRate);
    setNewMonths(DEFAULTS.newYears * 12);
    setSwitchingCost(DEFAULTS.switchingCost);
  };

  const verdict =
    result.netSaving > 0
      ? `Refinancing saves ${money(result.netSaving)}`
      : result.netSaving < 0
        ? `Refinancing costs ${money(Math.abs(result.netSaving))} more`
        : 'Refinancing makes no difference';

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Verdict
        </Label>
        <Label size="title" weight="bold" tone={result.worthIt ? 'positive' : 'negative'}>
          {verdict}
        </Label>
        <Label size="micro" tone="faint">
          Net of a {money(result.switchingCost)} switching cost, over the remaining life of both loans.
        </Label>
      </Card>

      <Card title="Existing Loan">
        <RowField
          label="Outstanding Amount"
          value={outstandingPrincipal}
          onChange={setOutstandingPrincipal}
          prefix="currency"
          min={0}
        />
        <RowField
          label="Interest Rate"
          value={existingRate}
          onChange={setExistingRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <TenureField
          label="Remaining Period"
          months={existingMonths}
          onChange={setExistingMonths}
          compact
        />
      </Card>

      <Card title="New Loan">
        <RowField
          label="Interest Rate"
          value={newRate}
          onChange={setNewRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <TenureField label="Loan Period" months={newMonths} onChange={setNewMonths} compact />
      </Card>

      <Card title="Switching Cost">
        <RowField
          label="Processing / Foreclosure Fee"
          value={switchingCost}
          onChange={setSwitchingCost}
          prefix="currency"
          min={0}
          caption="Optional"
        />
        <ActionButtons onReset={reset} onCalculate={() => Keyboard.dismiss()} />
      </Card>

      <Card title="Comparison">
        <DataTable
          columns={[
            { key: 'metric', label: '' },
            { key: 'existing', label: 'Existing' },
            { key: 'new', label: 'New' },
            { key: 'diff', label: 'Difference' },
          ]}
          rows={[
            ['EMI', num(result.existingLoan.emi), num(result.newLoan.emi), signedNum(result.emiDelta)],
            [
              'Total Interest',
              num(result.existingLoan.totalInterest),
              num(result.newLoan.totalInterest),
              signedNum(result.interestDelta),
            ],
            [
              'Total Payment',
              num(result.existingLoan.totalPayment),
              num(result.newLoan.totalPayment),
              signedNum(result.newLoan.totalPayment - result.existingLoan.totalPayment),
            ],
          ]}
          caption={`Amounts in ${currencyTag(currency)}. Difference is New minus Existing — negative is a saving.`}
        />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Assumes the new loan refinances the full outstanding amount today at the quoted rate and
        tenure, with no costs beyond the switching cost entered above.
      </Label>
    </Screen>
  );
}
