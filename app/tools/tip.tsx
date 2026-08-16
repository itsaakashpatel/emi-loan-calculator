import { useMemo, useState } from 'react';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl, StepperField } from '../../src/components/inputs';
import { Card, KeyValueRow, Label, SelectChipRow } from '../../src/components/primitives';
import { formatMoney, formatPercent } from '../../src/lib/format/money';
import { splitBill } from '../../src/lib/tools/everyday';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

const TIP_PRESETS = [0, 5, 10, 12.5, 15, 18, 20, 25] as const;
type Rounding = 'exact' | 'round_up';

export default function TipScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();

  const [bill, setBill] = useState(1_000);
  const [tipPct, setTipPct] = useState<number>(10);
  const [people, setPeople] = useState(2);
  const [rounding, setRounding] = useState<Rounding>('exact');

  const result = useMemo(
    () => splitBill(bill, tipPct, people, rounding === 'round_up'),
    [bill, tipPct, people, rounding],
  );
  const money = (value: number) => formatMoney(value, { currency, decimals: 2 });

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          {people === 1 ? 'You pay' : 'Each person pays'}
        </Label>
        <Label size="hero" weight="bold" tabular>
          {money(result.perPerson)}
        </Label>
        <Label size="micro" tone="faint">
          {money(result.total)} in total across {people} {people === 1 ? 'person' : 'people'},
          including {money(result.tip)} tip.
        </Label>
      </Card>

      <Card title="Inputs">
        <NumberField label="Bill" value={bill} onChange={setBill} prefix="currency" decimals={2} min={0} />

        <Label size="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
          Tip
        </Label>
        <SelectChipRow
          options={TIP_PRESETS.map((preset) => ({
            value: String(preset),
            label: `${preset}%`,
            hint: `Tip ${preset} percent`,
          }))}
          value={String(tipPct)}
          onChange={(next) => setTipPct(Number(next))}
        />
        <Label size="micro" tone="faint" style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
          Or type any rate below.
        </Label>
        <NumberField label="Custom tip" value={tipPct} onChange={setTipPct} suffix="%" decimals={2} min={0} />

        <StepperField label="Split between" value={people} onChange={setPeople} min={1} max={50} />

        <SegmentedControl<Rounding>
          label="Each share"
          segments={[
            { value: 'exact', label: 'Exact' },
            { value: 'round_up', label: 'Round up' },
          ]}
          value={rounding}
          onChange={setRounding}
        />
      </Card>

      <Card title="Breakdown">
        <KeyValueRow label="Bill" value={money(bill)} />
        <KeyValueRow label={`Tip at ${formatPercent(tipPct)}`} value={money(bill * (tipPct / 100))} />
        {result.roundingAdded > 0 ? (
          <KeyValueRow label="Added by rounding up" value={money(result.roundingAdded)} tone="warning" />
        ) : null}
        <KeyValueRow label="Total" value={money(result.total)} />
        <KeyValueRow label="Tip per person" value={money(result.tipPerPerson)} />
        <KeyValueRow label="Each person pays" value={money(result.perPerson)} emphasis last />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Rounding up takes each share to the next whole unit and adds the difference to the tip, so
        the table still covers the bill.
      </Label>
    </Screen>
  );
}
