import { useMemo, useState } from 'react';

import { Screen } from '../../src/components/Screen';
import { RowField, SegmentedControl } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { calculateHra } from '../../src/lib/finance/tax';
import { formatMoney } from '../../src/lib/format/money';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

type City = 'metro' | 'other';

/** HRA exemption under Section 10(13A). All inputs are monthly, like a salary slip. */
export default function HraScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();

  const [basic, setBasic] = useState(50_000);
  const [hra, setHra] = useState(20_000);
  const [rent, setRent] = useState(18_000);
  const [city, setCity] = useState<City>('metro');

  const result = useMemo(
    () => calculateHra({ basicDa: basic * 12, hraReceived: hra * 12, rentPaid: rent * 12, metro: city === 'metro' }),
    [basic, hra, rent, city],
  );
  const money = (value: number) => formatMoney(value, { currency });
  const lowest = (key: typeof result.binding) => (result.binding === key ? 'Lowest: this sets the exemption' : undefined);

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          HRA exempt from tax, per year
        </Label>
        <Label size="hero" weight="bold" tabular tone="positive">
          {money(result.exempt)}
        </Label>
        <Label size="micro" tone="faint">
          {money(result.taxable)} of your HRA is still taxable.
        </Label>
      </Card>

      <Card title="Each month">
        <RowField label="Basic + DA" value={basic} onChange={setBasic} prefix="currency" min={0} />
        <RowField label="HRA received" value={hra} onChange={setHra} prefix="currency" min={0} />
        <RowField label="Rent paid" value={rent} onChange={setRent} prefix="currency" min={0} />
        <SegmentedControl<City>
          label="You live in"
          segments={[
            { value: 'metro', label: 'Metro city' },
            { value: 'other', label: 'Other city' },
          ]}
          value={city}
          onChange={setCity}
        />
        <Label size="micro" tone="faint">
          Metro means Mumbai, Delhi, Kolkata or Chennai.
        </Label>
      </Card>

      <Card title="The three limits, per year">
        <KeyValueRow label="HRA received" value={money(result.limits.received)} hint={lowest('received')} />
        <KeyValueRow
          label="Rent minus 10% of basic + DA"
          value={money(result.limits.rentOverTenPct)}
          hint={lowest('rentOverTenPct')}
        />
        <KeyValueRow
          label={`${city === 'metro' ? '50%' : '40%'} of basic + DA`}
          value={money(result.limits.salaryShare)}
          hint={lowest('salaryShare')}
        />
        <KeyValueRow label="Exempt HRA" value={money(result.exempt)} tone="positive" emphasis last />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        The exemption is the lowest of the three limits. It is available only in the old tax regime. If
        your rent is more than ₹1 lakh a year, give your employer the landlord's PAN.
      </Label>
    </Screen>
  );
}
