import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl } from '../../src/components/inputs';
import { Card, KeyValueRow, Label, SelectChipRow } from '../../src/components/primitives';
import { GST_SLABS, calculateGst, type GstMode, type GstSplit } from '../../src/lib/finance/gst';
import { formatMoney, formatPercent } from '../../src/lib/format/money';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function GstScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();

  const [amount, setAmount] = useState(10_000);
  const [rate, setRate] = useState<number>(18);
  const [mode, setMode] = useState<GstMode>('add');
  const [split, setSplit] = useState<GstSplit>('cgst_sgst');

  const result = useMemo(() => calculateGst({ amount, ratePct: rate, mode, split }), [amount, rate, mode, split]);
  const money = (value: number) => formatMoney(value, { currency, decimals: 2 });

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          {mode === 'add' ? 'Total including GST' : 'Amount before GST'}
        </Label>
        <Label size="hero" weight="bold" tabular>
          {money(mode === 'add' ? result.total : result.base)}
        </Label>
        <Label size="micro" tone="faint">
          {mode === 'add'
            ? `${money(result.base)} + ${formatPercent(rate)} GST`
            : `${money(result.total)} includes ${money(result.gst)} GST`}
        </Label>
      </Card>

      <Card title="Inputs">
        <SegmentedControl<GstMode>
          label="Mode"
          segments={[
            { value: 'add', label: 'Add GST' },
            { value: 'remove', label: 'Remove GST' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <NumberField
          label={mode === 'add' ? 'Amount before GST' : 'Amount including GST'}
          value={amount}
          onChange={setAmount}
          prefix="currency"
          decimals={2}
          min={0}
        />

        <Label size="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
          GST rate
        </Label>
        <SelectChipRow
          options={GST_SLABS.map((slab) => ({
            value: String(slab),
            label: `${slab}%`,
            hint: `GST at ${slab} percent`,
          }))}
          value={String(rate)}
          onChange={(next) => setRate(Number(next))}
          wrap
        />
        <View style={{ height: spacing.md }} />
        <NumberField label="Custom rate" value={rate} onChange={setRate} suffix="%" decimals={2} min={0} max={100} />

        <SegmentedControl<GstSplit>
          label="Supply type"
          segments={[
            { value: 'cgst_sgst', label: 'Intra-state' },
            { value: 'igst', label: 'Inter-state' },
          ]}
          value={split}
          onChange={setSplit}
        />
      </Card>

      <Card title="Breakdown">
        <KeyValueRow label="Amount before GST" value={money(result.base)} />
        <KeyValueRow label={`GST at ${formatPercent(rate)}`} value={money(result.gst)} tone="warning" />
        {split === 'cgst_sgst' ? (
          <>
            <KeyValueRow label={`CGST at ${formatPercent(rate / 2)}`} value={money(result.cgst)} />
            <KeyValueRow label={`SGST at ${formatPercent(rate / 2)}`} value={money(result.sgst)} />
          </>
        ) : (
          <KeyValueRow label={`IGST at ${formatPercent(rate)}`} value={money(result.igst)} />
        )}
        <KeyValueRow label="Total including GST" value={money(result.total)} emphasis last />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Intra-state supply splits the tax evenly into CGST and SGST; inter-state supply is charged as a
        single IGST. Cess on specific goods is not included.
      </Label>
    </Screen>
  );
}
