import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl } from '../../src/components/inputs';
import { Card, KeyValueRow, Label, SelectChipRow } from '../../src/components/primitives';
import { calculateEligibility } from '../../src/lib/finance/emi';
import { formatMoney, formatPercent } from '../../src/lib/format/money';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

type TenureUnit = 'years' | 'months';

const FOIR_QUICK_PICKS = [40, 45, 50, 60] as const;

export default function EligibilityScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();
  const defaultRate = useSettingsStore((s) => s.defaultRate);

  const [income, setIncome] = useState(75_000);
  const [foirPct, setFoirPct] = useState(45);
  const [existingEmis, setExistingEmis] = useState(0);
  const [annualRate, setAnnualRate] = useState(defaultRate || 9);
  const [tenureUnit, setTenureUnit] = useState<TenureUnit>('years');
  const [tenureMonths, setTenureMonths] = useState(240);

  const tenureValue = tenureUnit === 'years' ? Math.round(tenureMonths / 12) : tenureMonths;
  const onTenureChange = (value: number) =>
    setTenureMonths(tenureUnit === 'years' ? Math.round(value * 12) : Math.round(value));

  const result = useMemo(
    () => calculateEligibility({ monthlyIncome: income, foirPct, existingEmis, annualRate, tenureMonths }),
    [income, foirPct, existingEmis, annualRate, tenureMonths],
  );

  const money = (value: number) => formatMoney(value, { currency });

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Eligible loan amount
        </Label>
        <Label size="hero" weight="bold" tabular>
          {money(result.eligibleAmount)}
        </Label>
        <Label size="micro" tone="faint">
          At {money(result.eligibleEmi)} EMI for {tenureUnit === 'years' ? `${tenureValue} yr` : `${tenureValue} mo`}
          {' '}at {formatPercent(annualRate)}
        </Label>
      </Card>

      <Card title="Inputs">
        <NumberField
          label="Gross monthly income"
          value={income}
          onChange={setIncome}
          prefix="currency"
          min={0}
        />

        <NumberField
          label="FOIR (max % of income that may go to EMIs)"
          value={foirPct}
          onChange={setFoirPct}
          suffix="%"
          decimals={0}
          min={0}
          max={100}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <SelectChipRow
            options={FOIR_QUICK_PICKS.map((pick) => ({
              value: String(pick),
              label: `${pick}%`,
              hint: `Set FOIR to ${pick} percent`,
            }))}
            value={String(foirPct)}
            onChange={(next: string) => setFoirPct(Number(next))}
            wrap
          />
        </View>

        <NumberField
          label="Total existing EMIs"
          value={existingEmis}
          onChange={setExistingEmis}
          prefix="currency"
          min={0}
        />

        <NumberField
          label="Interest rate"
          value={annualRate}
          onChange={setAnnualRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />

        <SegmentedControl<TenureUnit>
          label="Tenure"
          segments={[
            { value: 'years', label: 'Years' },
            { value: 'months', label: 'Months' },
          ]}
          value={tenureUnit}
          onChange={setTenureUnit}
        />
        <NumberField
          label="Loan tenure"
          value={tenureValue}
          onChange={onTenureChange}
          suffix={tenureUnit === 'years' ? 'yr' : 'mo'}
          min={1}
          max={tenureUnit === 'years' ? 40 : 480}
        />
      </Card>

      <Card title="Breakdown">
        <KeyValueRow label="Gross monthly income" value={money(income)} />
        <KeyValueRow label={`EMI ceiling at ${formatPercent(foirPct, 0)} FOIR`} value={money(result.emiCeiling)} />
        <KeyValueRow label="Existing EMIs" value={money(existingEmis)} tone="warning" />
        <KeyValueRow label="Eligible EMI" value={money(result.eligibleEmi)} emphasis />
        <KeyValueRow label="Eligible loan amount" value={money(result.eligibleAmount)} emphasis last />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Lenders typically cap total EMIs (the fixed-obligation-to-income ratio, or FOIR) at a share of
        your income. Actual eligibility also depends on your credit score, employment stability and the
        lender's own policy — this is an estimate, not an offer.
      </Label>
    </Screen>
  );
}
