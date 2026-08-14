import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { NumberField } from '../src/components/inputs';
import { Button, Card, Chip, Label } from '../src/components/primitives';
import { compareLoans, type ComparisonScenario } from '../src/lib/finance/compare';
import { formatMoney, formatTenure } from '../src/lib/format/money';
import { comparisonHtml } from '../src/pdf/templates';
import { sharePdf } from '../src/pdf/share';
import { useLoanInput } from '../src/store/calculator';
import { useCurrency } from '../src/store/settings';
import { useTheme } from '../src/theme/ThemeProvider';

interface Row {
  id: string;
  label: string;
  principal: number;
  annualRate: number;
  tenureYears: number;
  fees: number;
}

const MAX_SCENARIOS = 3;

export default function CompareScreen() {
  const { colors, spacing, radius } = useTheme();
  const currency = useCurrency();
  const input = useLoanInput();

  const [rows, setRows] = useState<Row[]>(() => [
    {
      id: 'a',
      label: 'Option A',
      principal: input.principal,
      annualRate: input.annualRate,
      tenureYears: Math.max(1, Math.round(input.tenureMonths / 12)),
      fees: input.fees ?? 0,
    },
    {
      id: 'b',
      label: 'Option B',
      principal: input.principal,
      annualRate: Math.round((input.annualRate + 0.75) * 100) / 100,
      tenureYears: Math.max(1, Math.round(input.tenureMonths / 12)),
      fees: 0,
    },
  ]);

  const scenarios: ComparisonScenario[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        label: row.label,
        principal: row.principal,
        annualRate: row.annualRate,
        tenureMonths: Math.round(row.tenureYears * 12),
        startDate: input.startDate,
        fees: row.fees,
      })),
    [rows, input.startDate],
  );

  const comparison = useMemo(() => compareLoans(scenarios), [scenarios]);
  const money = (value: number) => formatMoney(value, { currency });

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const nextId = String.fromCharCode(97 + prev.length);
      return [
        ...prev,
        {
          id: nextId,
          label: `Option ${nextId.toUpperCase()}`,
          principal: last?.principal ?? input.principal,
          annualRate: Math.round(((last?.annualRate ?? input.annualRate) + 0.5) * 100) / 100,
          tenureYears: last?.tenureYears ?? 20,
          fees: 0,
        },
      ];
    });

  return (
    <Screen>
      <Card title="Result" padded={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ padding: spacing.lg, paddingTop: 0 }}>
            <View style={styles.headerRow}>
              <View style={styles.labelCol} />
              {comparison.entries.map((entry) => (
                <View key={entry.id} style={styles.valueCol}>
                  <Label size="caption" weight="semibold" align="center" numberOfLines={1}>
                    {entry.label}
                  </Label>
                  {entry.isBest ? (
                    <View style={styles.bestChip}>
                      <Chip label="Cheapest" tone="positive" icon="trophy-outline" />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>

            <CompareRow
              label="Monthly EMI"
              values={comparison.entries.map((e) => money(e.result.emi))}
              emphasis
            />
            <CompareRow
              label="Total interest"
              values={comparison.entries.map((e) => money(e.result.totalInterest))}
            />
            <CompareRow
              label="Total payment"
              values={comparison.entries.map((e) => money(e.result.totalPayment))}
              emphasis
            />
            <CompareRow
              label="Tenure"
              values={comparison.entries.map((e) => formatTenure(e.result.tenureMonths))}
            />
            <CompareRow
              label="Extra cost"
              values={comparison.entries.map((e) => (e.extraCost > 0 ? `+${money(e.extraCost)}` : '—'))}
              tones={comparison.entries.map((e) => (e.extraCost > 0 ? 'negative' : 'positive'))}
              last
            />
          </View>
        </ScrollView>
      </Card>

      {comparison.maxSaving > 0 ? (
        <Card>
          <Label size="body" weight="semibold" tone="positive">
            Picking the cheapest option saves {money(comparison.maxSaving)}
          </Label>
          <Label size="caption" tone="muted" style={{ marginTop: 2 }}>
            Ranked by total outflow including fees — a lower EMI over a longer term usually costs more.
          </Label>
        </Card>
      ) : null}

      {rows.map((row, index) => (
        <Card key={row.id} title={row.label}>
          <NumberField
            label="Loan amount"
            value={row.principal}
            onChange={(principal) => update(row.id, { principal })}
            prefix="currency"
            min={0}
          />
          <NumberField
            label="Interest rate"
            value={row.annualRate}
            onChange={(annualRate) => update(row.id, { annualRate })}
            suffix="% p.a."
            decimals={2}
            min={0}
            max={60}
          />
          <NumberField
            label="Tenure"
            value={row.tenureYears}
            onChange={(tenureYears) => update(row.id, { tenureYears })}
            suffix="yr"
            min={1}
            max={40}
          />
          <NumberField
            label="Processing fee"
            value={row.fees}
            onChange={(fees) => update(row.id, { fees })}
            prefix="currency"
            placeholder="Optional"
            min={0}
          />
          {rows.length > 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${row.label}`}
              onPress={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
              style={({ pressed }) => [styles.removeRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="trash-outline" size={15} color={colors.negative} />
              <Label size="caption" tone="negative">
                Remove {row.label}
              </Label>
            </Pressable>
          ) : null}
          {index === rows.length - 1 && rows.length < MAX_SCENARIOS ? (
            <View style={{ marginTop: spacing.sm }}>
              <Button label="Add another option" variant="secondary" icon="add-outline" onPress={addRow} />
            </View>
          ) : null}
        </Card>
      ))}

      <Button
        label="Export comparison as PDF"
        icon="document-text-outline"
        variant="secondary"
        onPress={() => void sharePdf(comparisonHtml(comparison, currency), 'loan-comparison')}
        style={{ borderRadius: radius.md }}
      />
    </Screen>
  );
}

function CompareRow({
  label,
  values,
  tones,
  emphasis,
  last,
}: {
  label: string;
  values: string[];
  tones?: Array<'positive' | 'negative'>;
  emphasis?: boolean;
  last?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.compareRow,
        {
          paddingVertical: spacing.sm + 2,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Label size="caption" tone="muted" style={styles.labelCol}>
        {label}
      </Label>
      {values.map((value, index) => (
        <Label
          key={index}
          size={emphasis ? 'body' : 'caption'}
          weight={emphasis ? 'semibold' : 'medium'}
          tone={tones?.[index]}
          align="center"
          tabular
          style={styles.valueCol}
          numberOfLines={1}
        >
          {value}
        </Label>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // flex-start, not flex-end: the "Cheapest" chip is taller than a bare column header, and
  // bottom alignment pushed the other columns' labels out of line with it.
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 8 },
  compareRow: { flexDirection: 'row', alignItems: 'center' },
  labelCol: { width: 104 },
  valueCol: { width: 108 },
  bestChip: { alignItems: 'center', marginTop: 3 },
  removeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
});
