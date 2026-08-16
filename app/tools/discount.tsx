import { useMemo, useState } from 'react';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl, SliderRow } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { formatMoney, formatPercent } from '../../src/lib/format/money';
import { applyDiscount, discountFromPrices } from '../../src/lib/tools/everyday';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

/** `apply` takes a percentage off a price; `derive` works out the percentage from what was paid. */
type DiscountMode = 'apply' | 'derive';

export default function DiscountScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();

  const [mode, setMode] = useState<DiscountMode>('apply');
  const [listPrice, setListPrice] = useState(2_000);
  const [discountPct, setDiscountPct] = useState(25);
  const [extraPct, setExtraPct] = useState(0);
  const [paidPrice, setPaidPrice] = useState(1_500);

  const applied = useMemo(
    () => applyDiscount(listPrice, discountPct, extraPct),
    [listPrice, discountPct, extraPct],
  );
  const derivedPct = useMemo(() => discountFromPrices(listPrice, paidPrice), [listPrice, paidPrice]);

  const money = (value: number) => formatMoney(value, { currency, decimals: 2 });

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          {mode === 'apply' ? 'You pay' : 'Discount'}
        </Label>
        <Label size="hero" weight="bold" tabular>
          {mode === 'apply' ? money(applied.finalPrice) : formatPercent(derivedPct)}
        </Label>
        <Label size="micro" tone="faint">
          {mode === 'apply'
            ? `You save ${money(applied.savings)} — ${formatPercent(applied.effectivePct)} off ${money(applied.listPrice)}.`
            : `${money(Math.max(0, listPrice - paidPrice))} off ${money(listPrice)}.`}
        </Label>
      </Card>

      <Card title="Inputs">
        <SegmentedControl<DiscountMode>
          segments={[
            { value: 'apply', label: 'Take % off' },
            { value: 'derive', label: 'Find the %' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <NumberField
          label="Original price"
          value={listPrice}
          onChange={setListPrice}
          prefix="currency"
          decimals={2}
          min={0}
        />

        {mode === 'apply' ? (
          <>
            <NumberField
              label="Discount"
              value={discountPct}
              onChange={setDiscountPct}
              suffix="%"
              decimals={2}
              min={0}
              max={100}
            />
            <SliderRow
              min={0}
              max={100}
              step={1}
              value={discountPct}
              onChange={setDiscountPct}
              minLabel="0%"
              maxLabel="100%"
            />
            <NumberField
              label="Extra discount"
              hint="Taken off the reduced price"
              value={extraPct}
              onChange={setExtraPct}
              suffix="%"
              decimals={2}
              min={0}
              max={100}
              placeholder="Optional"
            />
          </>
        ) : (
          <NumberField
            label="Price you paid"
            value={paidPrice}
            onChange={setPaidPrice}
            prefix="currency"
            decimals={2}
            min={0}
          />
        )}
      </Card>

      {mode === 'apply' ? (
        <Card title="Breakdown">
          <KeyValueRow label="Original price" value={money(applied.listPrice)} />
          <KeyValueRow label={`Discount at ${formatPercent(discountPct)}`} value={`-${money(applied.listPrice * (discountPct / 100))}`} tone="positive" />
          {extraPct > 0 ? (
            <KeyValueRow
              label={`Extra ${formatPercent(extraPct)} off the reduced price`}
              value={`-${money(applied.savings - applied.listPrice * (discountPct / 100))}`}
              tone="positive"
            />
          ) : null}
          <KeyValueRow label="Total saved" value={money(applied.savings)} tone="positive" />
          <KeyValueRow label="You pay" value={money(applied.finalPrice)} emphasis last />
        </Card>
      ) : null}

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        A second discount comes off the already-reduced price, so 50% then a further 10% is 55% off
        in total, not 60%.
      </Label>
    </Screen>
  );
}
