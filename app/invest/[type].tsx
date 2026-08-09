import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChartLegend, DonutChart, StackedBarChart } from '../../src/components/charts';
import { DataTable, type DataTableColumn } from '../../src/components/DataTable';
import { saveCalculation } from '../../src/db/calculations';
import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl, SliderRow } from '../../src/components/inputs';
import { Button, Card, EmptyState, KeyValueRow, Label } from '../../src/components/primitives';
import {
  CALCULATORS,
  isCalculatorId,
  type CalculatorSpec,
  type FieldSpec,
} from '../../src/lib/finance/calculators';
import { formatCompact, formatTenure, getCurrency } from '../../src/lib/format/money';
import { sharePdf } from '../../src/pdf/share';
import { investmentHtml } from '../../src/pdf/templates';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * `result.table` cells arrive pre-formatted with a currency symbol (built in
 * `lib/finance/calculators.ts`, owned by another workstream, so it cannot be changed here). The
 * app-wide convention is to keep the symbol in the column header only and show bare numbers in
 * cells, so we strip a leading symbol (after any minus sign) back off each formatted cell rather
 * than reformatting from raw numbers the table doesn't expose.
 */
function stripCurrencySymbol(cell: string, symbol: string): string {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cell.replace(new RegExp(`^(-?)${escaped}\\s*`), '$1');
}

type Values = Record<string, number | string>;

/** One screen for every investment calculator, driven by the spec in `lib/finance/calculators`. */
export default function InvestmentCalculatorScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const navigation = useNavigation();
  const { colors, spacing } = useTheme();
  const currency = useCurrency();

  const spec: CalculatorSpec | null = type && isCalculatorId(type) ? CALCULATORS[type] : null;
  const [values, setValues] = useState<Values>(() => ({ ...(spec?.defaults ?? {}) }));

  useEffect(() => {
    if (spec) navigation.setOptions({ title: spec.title });
  }, [navigation, spec]);

  // Re-seed when navigating between calculators without unmounting.
  useEffect(() => {
    if (spec) setValues({ ...spec.defaults });
  }, [spec]);

  const result = useMemo(() => (spec ? spec.compute(values, currency) : null), [spec, values, currency]);

  // Record in History once the user stops adjusting, so a slider drag is one entry rather than many.
  useEffect(() => {
    if (!spec) return;
    const timer = setTimeout(() => {
      void saveCalculation('invest', spec.title, { calculator: spec.id, ...values }).catch(() => {
        // History is a convenience; a failed write must not interrupt the calculator.
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [spec, values]);

  if (!spec || !result) {
    return (
      <Screen>
        <Card>
          <EmptyState icon="help-circle-outline" title="Unknown calculator" message="Pick one from the Invest tab." />
        </Card>
      </Screen>
    );
  }

  const set = (key: string, value: number | string) => setValues((prev) => ({ ...prev, [key]: value }));
  const swatchColor = { invested: colors.principal, gain: colors.prepayment } as const;

  // The first column (Year/Month) is a plain label; the rest are money, so the currency symbol is
  // stripped from the pre-formatted cells and stated once in the caption instead. Repeating it in
  // each header made "INVESTED (₹)" too wide for its column and it truncated.
  const currencySymbol = getCurrency(currency).symbol;
  const tableColumns: DataTableColumn[] = result.table.columns.map((column, index) => ({
    key: column,
    label: column,
    align: index === 0 ? 'left' : 'right',
    flex: index === 0 ? 1.3 : 1,
  }));
  const tableRows = result.table.rows.map((row) =>
    row.map((cell, index) => (index === 0 ? cell : stripCurrencySymbol(cell, currencySymbol))),
  );

  return (
    <Screen>
      <Card>
        <View style={styles.headline}>
          <View style={styles.flex}>
            <Label size="caption" tone="muted">
              {result.headline.label}
            </Label>
            <Label size="display" weight="bold" tabular>
              {result.headline.value}
            </Label>
            <Label size="micro" tone="faint">
              {result.headline.caption}
            </Label>
          </View>
          {result.invested + result.gain > 0 ? (
            <DonutChart
              size={112}
              thickness={16}
              slices={[
                { label: result.investedLabel, value: result.invested, color: colors.principal },
                { label: result.gainLabel, value: result.gain, color: colors.prepayment },
              ]}
            />
          ) : null}
        </View>
        <View style={{ marginTop: spacing.md }}>
          <ChartLegend
            items={[
              { label: result.investedLabel, color: colors.principal },
              { label: result.gainLabel, color: colors.prepayment },
            ]}
          />
        </View>
      </Card>

      {result.warning ? (
        <Card>
          <Label size="caption" tone="warning">
            {result.warning}
          </Label>
        </Card>
      ) : null}

      <Card title="Inputs">
        {spec.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={typeof values[field.key] === 'number' ? (values[field.key] as number) : 0}
            onChange={(next) => set(field.key, next)}
          />
        ))}
        {spec.options?.map((option) => (
          <SegmentedControl
            key={option.key}
            label={option.label}
            segments={option.options}
            value={String(values[option.key] ?? option.options[0]?.value ?? '')}
            onChange={(next) => set(option.key, next)}
          />
        ))}
      </Card>

      <Card title="Breakdown">
        {result.rows.map((row, index) => (
          <KeyValueRow
            key={row.label}
            label={row.label}
            value={row.value}
            tone={row.tone}
            emphasis={row.emphasis}
            swatch={row.swatch ? swatchColor[row.swatch] : undefined}
            last={index === result.rows.length - 1}
          />
        ))}
      </Card>

      {result.chart.length > 1 ? (
        <Card title="Growth">
          <View style={styles.chartWrap}>
            <StackedBarChart
              bars={result.chart.map((point) => ({
                label: point.label,
                segments: [
                  { value: Math.min(point.invested, point.value), color: colors.principal },
                  { value: Math.max(0, point.value - point.invested), color: colors.prepayment },
                ],
              }))}
            />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <ChartLegend
              items={[
                { label: result.investedLabel, color: colors.principal },
                { label: result.gainLabel, color: colors.prepayment },
              ]}
            />
          </View>
        </Card>
      ) : null}

      <Card title={result.table.columns[0] === 'Month' ? 'Year-end balances' : 'Year-wise breakdown'} padded={false}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <DataTable
            columns={tableColumns}
            rows={tableRows}
            caption={`All amounts in ${currencySymbol}`}
          />
        </View>
      </Card>

      {result.note ? (
        <Label size="micro" tone="faint" style={{ marginBottom: spacing.md, marginHorizontal: spacing.xs }}>
          {result.note}
        </Label>
      ) : null}

      <Button
        label="Export as PDF"
        icon="document-text-outline"
        variant="secondary"
        onPress={() =>
          void sharePdf(
            investmentHtml({
              title: spec.title,
              subtitle: result.headline.caption,
              headline: result.headline,
              facts: result.rows.map((row) => [row.label, row.value] as [string, string]),
              table: result.table,
              ...(result.note ? { note: result.note } : null),
            }),
            `${spec.id}-calculation`,
          )
        }
      />
    </Screen>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: number;
  onChange: (value: number) => void;
}) {
  const currency = useCurrency();
  const decimals = field.kind === 'rate' || field.kind === 'percent' ? 2 : 0;
  const suffix =
    field.kind === 'rate'
      ? '% p.a.'
      : field.kind === 'percent'
        ? '%'
        : field.kind === 'years'
          ? 'yr'
          : field.kind === 'months'
            ? 'mo'
            : undefined;

  const sliderMax = field.kind === 'rate' ? Math.min(field.max, 30) : field.max;

  return (
    <>
      <NumberField
        label={field.label}
        value={value}
        onChange={onChange}
        prefix={field.kind === 'money' ? 'currency' : undefined}
        suffix={suffix}
        decimals={decimals}
        min={field.min}
        max={field.max}
        placeholder={field.optional ? 'Optional' : undefined}
        hint={
          field.kind === 'months' && value > 0
            ? formatTenure(value)
            : field.hint
        }
      />
      {field.slider ? (
        <SliderRow
          min={field.min}
          max={sliderMax}
          step={field.step}
          value={value}
          onChange={(next) => onChange(Math.round(next / field.step) * field.step)}
          minLabel={sliderLabel(field, field.min, currency)}
          maxLabel={sliderLabel(field, sliderMax, currency)}
        />
      ) : null}
    </>
  );
}

function sliderLabel(field: FieldSpec, value: number, currency: string): string {
  switch (field.kind) {
    case 'money':
      return formatCompact(value, { currency });
    case 'rate':
    case 'percent':
      return `${value}%`;
    case 'years':
      return `${value} yr`;
    case 'months':
      return `${value} mo`;
  }
}

const styles = StyleSheet.create({
  headline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chartWrap: { alignItems: 'center' },
  flex: { flex: 1 },
});
