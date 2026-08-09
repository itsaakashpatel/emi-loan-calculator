import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ProgressRing } from '../../src/components/charts';
import { LoanResultCard, YearlyOutflowChart } from '../../src/components/LoanSummary';
import { ScheduleTable } from '../../src/components/ScheduleTable';
import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl } from '../../src/components/inputs';
import { Button, Card, Chip, EmptyState, KeyValueRow, Label, ListRow } from '../../src/components/primitives';
import { computeSavings } from '../../src/lib/finance/emi';
import { daysBetween, formatDate, todayISO } from '../../src/lib/format/date';
import { formatMoney, formatTenure, getCurrency } from '../../src/lib/format/money';
import type { AdjustMode, ScheduleRow } from '../../src/lib/finance/types';
import { sharePdf } from '../../src/pdf/share';
import { loanSummaryHtml, scheduleHtml } from '../../src/pdf/templates';
import { useLoansStore } from '../../src/store/loans';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loanId = Number(id);
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, spacing, radius } = useTheme();

  const item = useLoansStore((s) => s.byId(loanId));
  const refresh = useLoansStore((s) => s.refresh);
  const setInstallmentPaid = useLoansStore((s) => s.setInstallmentPaid);
  const addEvent = useLoansStore((s) => s.addEvent);
  const remove = useLoansStore((s) => s.remove);

  const [prepayOpen, setPrepayOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (item) navigation.setOptions({ title: item.loan.name });
  }, [navigation, item]);

  const paidNumbers = useMemo(
    () => new Set(item?.payments.filter((p) => p.paidDate !== null).map((p) => p.installmentNo) ?? []),
    [item],
  );

  const savings = useMemo(
    () =>
      item
        ? computeSavings({
            principal: item.loan.principal,
            annualRate: item.loan.annualRate,
            tenureMonths: item.loan.tenureMonths,
            startDate: item.loan.startDate,
            advanceEmis: item.loan.advanceEmis,
            fees: item.loan.fees,
            events: item.loan.events,
          })
        : null,
    [item],
  );

  if (!item) {
    return (
      <Screen>
        <Card>
          <EmptyState
            icon="alert-circle-outline"
            title="Loan not found"
            message="It may have been deleted."
            action={<Button label="Back to My Loans" fullWidth={false} onPress={() => router.back()} />}
          />
        </Card>
      </Screen>
    );
  }

  const { loan, result } = item;
  const currency = loan.currency;
  const money = (value: number) => formatMoney(value, { currency });

  const nextRow = result.schedule.find((row) => !paidNumbers.has(row.no));
  const dueInDays = item.nextDueDate ? daysBetween(todayISO(), item.nextDueDate) : null;

  const confirmDelete = () =>
    Alert.alert('Delete this loan?', `"${loan.name}" and its payment history will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await remove(loanId);
            router.back();
          })();
        },
      },
    ]);

  const toggle = (row: ScheduleRow) =>
    void setInstallmentPaid(
      loanId,
      { no: row.no, dueDate: row.date, amountDue: row.emi + row.prepayment },
      !paidNumbers.has(row.no),
    );

  return (
    <Screen>
      <Card>
        <View style={styles.progressRow}>
          <ProgressRing
            pct={item.progressPct}
            size={64}
            thickness={7}
            color={item.isClosed ? colors.positive : item.overdueCount > 0 ? colors.negative : colors.accent}
          />
          <View style={styles.flex}>
            <Label size="caption" tone="muted">
              Outstanding
            </Label>
            <Label size="title" weight="bold" tabular>
              {money(item.outstanding)}
            </Label>
            <Label size="caption" tone="muted">
              {item.paidCount} of {result.tenureMonths} instalments paid
            </Label>
          </View>
        </View>

        <View style={[styles.chipRow, { marginTop: spacing.md, gap: spacing.sm }]}>
          {item.isClosed ? (
            <Chip label="Fully repaid" tone="positive" icon="checkmark-circle-outline" />
          ) : item.overdueCount > 0 ? (
            <Chip label={`${item.overdueCount} overdue`} tone="negative" icon="alert-circle-outline" />
          ) : dueInDays !== null ? (
            <Chip
              label={dueInDays === 0 ? 'Due today' : `Next due ${formatDate(item.nextDueDate!)}`}
              tone={dueInDays <= 3 ? 'warning' : 'neutral'}
              icon="calendar-outline"
            />
          ) : null}
          <Chip label={`Paid so far ${money(item.paidAmount)}`} />
        </View>
      </Card>

      {nextRow && !item.isClosed ? (
        <Card title="Next instalment">
          <KeyValueRow label={`Instalment ${nextRow.no}`} value={money(nextRow.emi + nextRow.prepayment)} emphasis />
          <KeyValueRow label="Due on" value={formatDate(nextRow.date)} />
          <KeyValueRow label="Towards principal" value={money(nextRow.principal + nextRow.prepayment)} />
          <KeyValueRow label="Towards interest" value={money(nextRow.interest)} tone="warning" last />
          <View style={{ marginTop: spacing.md }}>
            <Button
              label={`Mark instalment ${nextRow.no} as paid`}
              icon="checkmark-circle-outline"
              onPress={() => toggle(nextRow)}
            />
          </View>
        </Card>
      ) : null}

      <LoanResultCard
        result={result}
        savings={loan.events.length > 0 && savings ? savings : undefined}
        title="EMI"
      />

      <Card title="Payment log" padded={false}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <ScheduleTable
            yearly={result.yearly}
            paidInstallments={paidNumbers}
            onToggleRow={toggle}
            initiallyExpandedYear={
              nextRow ? Number(nextRow.date.slice(0, 4)) : result.yearly[0]?.year
            }
          />
          <Label size="micro" tone="faint" style={{ marginTop: spacing.md }}>
            All amounts in {getCurrency(currency).symbol}. Tap any month to mark it paid or unpaid.
          </Label>
        </View>
      </Card>

      <YearlyOutflowChart result={result} />

      <Card title="Loan details">
        <KeyValueRow label="Principal" value={money(loan.principal)} />
        <KeyValueRow label="Interest rate" value={`${loan.annualRate}% p.a.`} />
        <KeyValueRow label="Original tenure" value={formatTenure(loan.tenureMonths)} />
        <KeyValueRow label="Started" value={formatDate(loan.startDate)} />
        {loan.advanceEmis > 0 ? (
          <KeyValueRow label="Advance EMIs" value={`${loan.advanceEmis} (${money(result.advanceAmount)})`} />
        ) : null}
        {loan.fees > 0 ? <KeyValueRow label="Processing fee" value={money(loan.fees)} /> : null}
        <KeyValueRow label="Adjustments" value={loan.events.length === 0 ? 'None' : String(loan.events.length)} last />
      </Card>

      <Card padded={false}>
        <ListRow
          title="Record a part payment"
          subtitle="Prepay a lump sum and see the saving"
          icon="cash-outline"
          onPress={() => setPrepayOpen(true)}
        />
        <ListRow
          title="Edit loan"
          subtitle="Change the amount, rate or tenure"
          icon="create-outline"
          onPress={() => router.push(`/loan/form?id=${loanId}`)}
        />
        <ListRow
          title="Export summary as PDF"
          icon="document-text-outline"
          onPress={() => void sharePdf(loanSummaryHtml(result, currency, loan.name), 'loan-summary')}
        />
        <ListRow
          title="Export full schedule as PDF"
          icon="list-outline"
          onPress={() => void sharePdf(scheduleHtml(result, currency, loan.name), 'loan-schedule')}
          last
        />
      </Card>

      <Button label="Delete loan" variant="danger" icon="trash-outline" onPress={confirmDelete} />

      <PrepaymentModal
        visible={prepayOpen}
        onClose={() => setPrepayOpen(false)}
        maxMonth={result.tenureMonths}
        defaultMonth={nextRow?.no ?? 1}
        currency={currency}
        onSubmit={(amount, startMonth, mode) => {
          setPrepayOpen(false);
          void addEvent(loanId, { kind: 'part_payment', amount, startMonth, frequency: 'once', mode });
        }}
      />
    </Screen>
  );
}

function PrepaymentModal({
  visible,
  onClose,
  maxMonth,
  defaultMonth,
  currency,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  maxMonth: number;
  defaultMonth: number;
  currency: string;
  onSubmit: (amount: number, startMonth: number, mode: AdjustMode) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const [amount, setAmount] = useState(50_000);
  const [month, setMonth] = useState(defaultMonth);
  const [mode, setMode] = useState<AdjustMode>('reduce_tenure');

  useEffect(() => {
    if (visible) setMonth(defaultMonth);
  }, [visible, defaultMonth]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Label size="subhead" weight="semibold">
              Part payment
            </Label>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <NumberField label="Amount" value={amount} onChange={setAmount} prefix="currency" min={0} />
          <NumberField
            label="On instalment"
            value={month}
            onChange={setMonth}
            min={1}
            max={maxMonth}
            hint={`1 – ${maxMonth}`}
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
          <Label size="micro" tone="faint" style={{ marginBottom: spacing.md }}>
            Recorded against the loan, so the schedule and outstanding balance update immediately.
          </Label>
          <Button
            label={`Add ${formatMoney(amount, { currency })} part payment`}
            icon="checkmark-outline"
            disabled={amount <= 0}
            onPress={() => onSubmit(amount, month, mode)}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
});
