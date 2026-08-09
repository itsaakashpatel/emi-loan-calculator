import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl, StepperField } from '../../src/components/inputs';
import { Button, Card, Chip, EmptyState, KeyValueRow, Label } from '../../src/components/primitives';
import { computeSavings } from '../../src/lib/finance/emi';
import { addMonths, formatMonthYear } from '../../src/lib/format/date';
import { formatMoney, formatPercent, formatTenure } from '../../src/lib/format/money';
import type {
  AdjustMode,
  LoanEvent,
  MoratoriumRecovery,
  MoratoriumType,
  PartPaymentFrequency,
} from '../../src/lib/finance/types';
import { useCalculatorStore, useLoanInput } from '../../src/store/calculator';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

type Draft = 'part_payment' | 'advance_emi' | 'moratorium' | 'rate_change';

function isDraft(value: string | undefined): value is Draft {
  return (
    value === 'part_payment' ||
    value === 'advance_emi' ||
    value === 'moratorium' ||
    value === 'rate_change'
  );
}

export default function AdvancedScreen() {
  const { colors, spacing } = useTheme();
  const currency = useCurrency();
  const input = useLoanInput();

  const advanceEmis = useCalculatorStore((s) => s.advanceEmis);
  const setAdvanceEmis = useCalculatorStore((s) => s.setAdvanceEmis);
  const events = useCalculatorStore((s) => s.events);
  const addEvent = useCalculatorStore((s) => s.addEvent);
  const removeEvent = useCalculatorStore((s) => s.removeEvent);
  const clearEvents = useCalculatorStore((s) => s.clearEvents);

  // Home has a separate tile per adjustment type, each deep-linking to its section here.
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Draft>(isDraft(initialTab) ? initialTab : 'part_payment');
  const savings = useMemo(() => computeSavings(input), [input]);
  const money = (value: number) => formatMoney(value, { currency });

  const startDate = input.startDate ?? '';
  const maxMonth = Math.max(1, savings.baseline.tenureMonths);

  return (
    <Screen>
      <Card>
        <KeyValueRow label="Base EMI" value={money(savings.baseline.emi)} />
        <KeyValueRow label="Adjusted EMI" value={money(savings.withEvents.emi)} emphasis />
        <KeyValueRow
          label="Tenure"
          value={`${formatTenure(savings.withEvents.tenureMonths)}${
            savings.monthsSaved !== 0 ? ` (${savings.monthsSaved > 0 ? '−' : '+'}${Math.abs(savings.monthsSaved)} mo)` : ''
          }`}
        />
        <KeyValueRow
          label="Interest saved"
          value={savings.interestSaved >= 0 ? money(savings.interestSaved) : `−${money(-savings.interestSaved)}`}
          tone={savings.interestSaved > 0 ? 'positive' : savings.interestSaved < 0 ? 'negative' : undefined}
          last
        />
      </Card>

      <SegmentedControl<Draft>
        segments={[
          { value: 'part_payment', label: 'Part pay' },
          { value: 'advance_emi', label: 'Advance' },
          { value: 'moratorium', label: 'Holiday' },
          { value: 'rate_change', label: 'Rate' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'part_payment' ? (
        <PartPaymentForm maxMonth={maxMonth} startDate={startDate} onAdd={addEvent} />
      ) : null}

      {tab === 'advance_emi' ? (
        <Card title="Advance EMI">
          <Label size="caption" tone="muted" style={{ marginBottom: spacing.md }}>
            Some lenders collect the first few EMIs at disbursement. Those instalments are pure principal,
            so both the EMI and the total interest come down.
          </Label>
          <StepperField
            label="EMIs paid upfront"
            value={advanceEmis}
            onChange={setAdvanceEmis}
            min={0}
            max={Math.max(0, Math.min(12, maxMonth - 1))}
          />
          {advanceEmis > 0 ? (
            <KeyValueRow
              label="Payable at disbursement"
              value={money(savings.withEvents.advanceAmount)}
              hint={`${advanceEmis} × ${money(savings.withEvents.emi)}`}
              last
            />
          ) : null}
        </Card>
      ) : null}

      {tab === 'moratorium' ? (
        <MoratoriumForm maxMonth={maxMonth} startDate={startDate} onAdd={addEvent} />
      ) : null}

      {tab === 'rate_change' ? (
        <RateChangeForm
          maxMonth={maxMonth}
          startDate={startDate}
          currentRate={input.annualRate}
          onAdd={addEvent}
        />
      ) : null}

      <Card title="Applied adjustments" padded={false}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          {events.length === 0 ? (
            <EmptyState
              icon="options-outline"
              title="Nothing applied yet"
              message="Add a part payment, an EMI holiday or a rate change above to see its effect."
            />
          ) : (
            events.map((event, index) => (
              <EventRow
                key={`${event.kind}-${index}`}
                event={event}
                startDate={startDate}
                currency={currency}
                onRemove={() => removeEvent(index)}
                last={index === events.length - 1}
              />
            ))
          )}
        </View>
      </Card>

      {events.length > 0 ? (
        <Button label="Remove all adjustments" variant="danger" icon="trash-outline" onPress={clearEvents} />
      ) : null}

      <Label size="micro" tone="faint" style={{ marginTop: spacing.md, color: colors.textFaint }}>
        Prepayments are applied after that month's EMI. "Reduce tenure" keeps the EMI and closes the loan
        sooner; "reduce EMI" keeps the end date and lowers the instalment.
      </Label>
    </Screen>
  );
}

/* ------------------------------------------------------------------ forms ---- */

function PartPaymentForm({
  maxMonth,
  startDate,
  onAdd,
}: {
  maxMonth: number;
  startDate: string;
  onAdd: (event: LoanEvent) => void;
}) {
  const { spacing } = useTheme();
  const [amount, setAmount] = useState(100_000);
  const [startMonth, setStartMonth] = useState(12);
  const [frequency, setFrequency] = useState<PartPaymentFrequency>('once');
  const [mode, setMode] = useState<AdjustMode>('reduce_tenure');

  return (
    <Card title="Part payment">
      <NumberField label="Amount" value={amount} onChange={setAmount} prefix="currency" min={0} />
      <SegmentedControl<PartPaymentFrequency>
        label="How often"
        segments={[
          { value: 'once', label: 'One-time' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
        value={frequency}
        onChange={setFrequency}
      />
      <NumberField
        label="Starting from installment"
        value={startMonth}
        onChange={setStartMonth}
        min={1}
        max={maxMonth}
        hint={startDate ? formatMonthYear(addMonths(startDate, startMonth)) : undefined}
      />
      <SegmentedControl<AdjustMode>
        label="Apply the saving to"
        segments={[
          { value: 'reduce_tenure', label: 'Reduce tenure' },
          { value: 'reduce_emi', label: 'Reduce EMI' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={{ marginTop: spacing.xs }}>
        <Button
          label="Add part payment"
          icon="add-circle-outline"
          disabled={amount <= 0}
          onPress={() => onAdd({ kind: 'part_payment', amount, startMonth, frequency, mode })}
        />
      </View>
    </Card>
  );
}

function MoratoriumForm({
  maxMonth,
  startDate,
  onAdd,
}: {
  maxMonth: number;
  startDate: string;
  onAdd: (event: LoanEvent) => void;
}) {
  const { spacing } = useTheme();
  const [startMonth, setStartMonth] = useState(1);
  const [months, setMonths] = useState(6);
  const [type, setType] = useState<MoratoriumType>('full');
  const [recovery, setRecovery] = useState<MoratoriumRecovery>('extend_tenure');

  return (
    <Card title="EMI holiday (moratorium)">
      <SegmentedControl<MoratoriumType>
        label="During the holiday"
        segments={[
          { value: 'full', label: 'Pay nothing' },
          { value: 'interest_only', label: 'Pay interest' },
        ]}
        value={type}
        onChange={setType}
      />
      <Label size="micro" tone="faint" style={{ marginBottom: spacing.md }}>
        {type === 'full'
          ? 'Interest keeps accruing and is added to your principal, so the loan gets more expensive.'
          : 'You service the interest each month, so the principal is untouched and nothing capitalises.'}
      </Label>
      <NumberField
        label="Starting from installment"
        value={startMonth}
        onChange={setStartMonth}
        min={1}
        max={maxMonth}
        hint={startDate ? formatMonthYear(addMonths(startDate, startMonth)) : undefined}
      />
      <NumberField label="For how many months" value={months} onChange={setMonths} min={1} max={60} suffix="mo" />
      <SegmentedControl<MoratoriumRecovery>
        label="Afterwards"
        segments={[
          { value: 'extend_tenure', label: 'Extend tenure' },
          { value: 'increase_emi', label: 'Increase EMI' },
        ]}
        value={recovery}
        onChange={setRecovery}
      />
      <View style={{ marginTop: spacing.xs }}>
        <Button
          label="Add EMI holiday"
          icon="pause-circle-outline"
          onPress={() => onAdd({ kind: 'moratorium', startMonth, months, type, recovery })}
        />
      </View>
    </Card>
  );
}

function RateChangeForm({
  maxMonth,
  startDate,
  currentRate,
  onAdd,
}: {
  maxMonth: number;
  startDate: string;
  currentRate: number;
  onAdd: (event: LoanEvent) => void;
}) {
  const { spacing } = useTheme();
  const [annualRate, setAnnualRate] = useState(Math.round((currentRate + 0.5) * 100) / 100);
  const [startMonth, setStartMonth] = useState(13);
  const [mode, setMode] = useState<AdjustMode>('reduce_tenure');

  return (
    <Card title="Floating rate change">
      <Label size="caption" tone="muted" style={{ marginBottom: spacing.md }}>
        Model a repo-linked reset: from the chosen installment the loan switches to the new rate.
      </Label>
      <NumberField
        label="New interest rate"
        value={annualRate}
        onChange={setAnnualRate}
        suffix="% p.a."
        decimals={2}
        min={0}
        max={60}
      />
      <NumberField
        label="Effective from installment"
        value={startMonth}
        onChange={setStartMonth}
        min={1}
        max={maxMonth}
        hint={startDate ? formatMonthYear(addMonths(startDate, startMonth)) : undefined}
      />
      <SegmentedControl<AdjustMode>
        label="Absorb the change by"
        segments={[
          { value: 'reduce_tenure', label: 'Changing tenure' },
          { value: 'reduce_emi', label: 'Changing EMI' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={{ marginTop: spacing.xs }}>
        <Button
          label="Add rate change"
          icon="swap-vertical-outline"
          onPress={() => onAdd({ kind: 'rate_change', annualRate, startMonth, mode })}
        />
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------- event list ---- */

const FREQUENCY_LABEL: Record<PartPaymentFrequency, string> = {
  once: 'one-time',
  monthly: 'every month',
  quarterly: 'every quarter',
  yearly: 'every year',
};

function describe(event: LoanEvent, currency: string): { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (event.kind) {
    case 'part_payment':
      return {
        icon: 'cash-outline',
        title: `${formatMoney(event.amount, { currency })} ${FREQUENCY_LABEL[event.frequency]}`,
        subtitle: event.mode === 'reduce_tenure' ? 'Reduces tenure' : 'Reduces EMI',
      };
    case 'moratorium':
      return {
        icon: 'pause-circle-outline',
        title: `${event.months}-month ${event.type === 'full' ? 'EMI holiday' : 'interest-only period'}`,
        subtitle: event.recovery === 'extend_tenure' ? 'Tenure extends after' : 'EMI increases after',
      };
    case 'rate_change':
      return {
        icon: 'swap-vertical-outline',
        title: `Rate changes to ${formatPercent(event.annualRate)}`,
        subtitle: event.mode === 'reduce_tenure' ? 'Tenure absorbs it' : 'EMI absorbs it',
      };
  }
}

function EventRow({
  event,
  startDate,
  currency,
  onRemove,
  last,
}: {
  event: LoanEvent;
  startDate: string;
  currency: string;
  onRemove: () => void;
  last: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const { title, subtitle, icon } = describe(event, currency);

  return (
    <View
      style={[
        styles.eventRow,
        {
          paddingVertical: spacing.md,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View
        style={[styles.eventIcon, { backgroundColor: colors.accentSoft, borderRadius: radius.sm }]}
      >
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <View style={styles.flex}>
        <Label size="body" weight="medium">
          {title}
        </Label>
        <Label size="caption" tone="muted">
          {subtitle}
        </Label>
      </View>
      <View style={styles.eventMeta}>
        <Chip
          label={
            startDate ? formatMonthYear(addMonths(startDate, event.startMonth)) : `#${event.startMonth}`
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title}`}
          hitSlop={8}
          onPress={onRemove}
        >
          <Ionicons name="close-circle" size={20} color={colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
