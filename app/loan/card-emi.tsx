import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DataTable } from '../../src/components/DataTable';
import { Screen } from '../../src/components/Screen';
import { RowField, SegmentedControl, TenureField } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { CARD_EMI_GST_PCT, calculateCardEmi, type CardEmiKind } from '../../src/lib/finance/card-emi';
import { currencyTag, formatMoney, formatNumber, formatPercent } from '../../src/lib/format/money';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

/** What a purchase on card EMI, or on a "no-cost" EMI, really costs. */
export default function CardEmiScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();

  const [kind, setKind] = useState<CardEmiKind>('no_cost');
  const [price, setPrice] = useState(60_000);
  const [rate, setRate] = useState(16);
  const [months, setMonths] = useState(6);
  const [fee, setFee] = useState(199);

  const result = useMemo(
    () => calculateCardEmi({ kind, price, annualRate: rate, tenureMonths: Math.max(1, months), processingFee: fee }),
    [kind, price, rate, months, fee],
  );

  const money = (value: number) => formatMoney(value, { currency, decimals: 2 });
  const num = (value: number) => formatNumber(value, { grouping: 'indian', decimals: 2 });
  const costs = result.extraCost > 0;

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          {kind === 'no_cost' ? 'Hidden cost of this no-cost EMI' : 'Extra you pay over the price'}
        </Label>
        <Label size="hero" weight="bold" tabular tone={costs ? 'warning' : 'positive'}>
          {money(Math.max(0, result.extraCost))}
        </Label>
        <Label size="micro" tone="faint">
          {costs
            ? `You pay ${money(result.totalPaid)} for a ${money(price)} purchase. That is like a loan at ${formatPercent(result.effectiveAnnualRate)} a year.`
            : 'The instalments add up to the price. Nothing extra to pay.'}
        </Label>
      </Card>

      <Card title="Purchase">
        <SegmentedControl<CardEmiKind>
          label="Type of EMI"
          segments={[
            { value: 'no_cost', label: 'No-cost EMI' },
            { value: 'standard', label: 'Card EMI' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <RowField label="Price" value={price} onChange={setPrice} prefix="currency" min={0} />
        <RowField
          label="Bank interest rate"
          value={rate}
          onChange={setRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
          caption={kind === 'no_cost' ? 'The bank still charges this' : undefined}
        />
        <TenureField label="Tenure" months={months} onChange={setMonths} compact maxMonths={60} />
        <RowField label="Processing fee" value={fee} onChange={setFee} prefix="currency" min={0} caption="Before GST" />
      </Card>

      <Card title="Where the money goes">
        <KeyValueRow label="Monthly EMI" value={money(result.emi)} hint={`for ${result.rows.length} months`} emphasis />
        {kind === 'no_cost' ? (
          <KeyValueRow
            label="Seller discount"
            value={money(result.discount)}
            hint="Given upfront to cover the interest"
            tone="positive"
          />
        ) : null}
        <KeyValueRow label="Bank lends you" value={money(result.financed)} />
        <KeyValueRow label="Interest" value={money(result.totalInterest)} />
        <KeyValueRow
          label={`GST on interest, ${CARD_EMI_GST_PCT}%`}
          value={money(result.gstOnInterest)}
          tone="warning"
          hint={kind === 'no_cost' ? 'Not covered by the discount' : undefined}
        />
        <KeyValueRow label="Processing fee" value={money(result.processingFee)} tone="warning" />
        <KeyValueRow label={`GST on fee, ${CARD_EMI_GST_PCT}%`} value={money(result.gstOnFee)} tone="warning" />
        <KeyValueRow label="Total you pay" value={money(result.totalPaid)} emphasis last />
      </Card>

      <Card title="Month by month">
        <DataTable
          columns={[
            { key: 'no', label: 'Month', flex: 0.8 },
            { key: 'emi', label: 'EMI' },
            { key: 'interest', label: 'Interest' },
            { key: 'gst', label: 'GST' },
            { key: 'total', label: 'Total' },
          ]}
          rows={result.rows.map((row) => [String(row.no), num(row.emi), num(row.interest), num(row.gst), num(row.total)])}
          caption={`Amounts in ${currencyTag(currency)}. GST shows on the card statement after each EMI.`}
        />
      </Card>

      <View style={{ marginHorizontal: spacing.xs }}>
        <Label size="micro" tone="faint">
          A no-cost EMI is a loan: the seller gives a discount equal to the interest, but you still pay
          GST on that interest and the processing fee. Some banks also charge a fee to close the EMI
          early. Check your card statement for the exact figures.
        </Label>
      </View>
    </Screen>
  );
}
