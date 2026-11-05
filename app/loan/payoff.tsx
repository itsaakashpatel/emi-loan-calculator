import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { RowField, SegmentedControl } from '../../src/components/inputs';
import { Button, Card, Chip, EmptyState, KeyValueRow, Label } from '../../src/components/primitives';
import { rankPrepayment, type PrepayCandidate } from '../../src/lib/finance/portfolio';
import type { AdjustMode } from '../../src/lib/finance/types';
import { formatMonthYear } from '../../src/lib/format/date';
import { formatMoney, formatPercent, formatTenure } from '../../src/lib/format/money';
import { loanInputOf, useLoansStore } from '../../src/store/loans';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * "I have a lump sum. Which loan do I prepay?" Puts the amount into each open loan in turn and
 * ranks them by the interest it saves.
 */
export default function PayoffScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const items = useLoansStore((s) => s.items);
  const addEvent = useLoansStore((s) => s.addEvent);

  const [amount, setAmount] = useState(100_000);
  const [mode, setMode] = useState<AdjustMode>('reduce_tenure');

  const candidates = useMemo<PrepayCandidate[]>(
    () =>
      items
        .filter((item) => !item.isClosed && item.nextInstallmentNo !== null)
        .map((item) => ({
          id: item.loan.id,
          name: item.loan.name,
          input: loanInputOf(item.loan),
          nextInstallment: item.nextInstallmentNo!,
        })),
    [items],
  );

  const options = useMemo(() => rankPrepayment(candidates, amount, mode), [candidates, amount, mode]);
  const money = (value: number) => formatMoney(value, { currency: 'INR' });

  if (candidates.length === 0) {
    return (
      <Screen>
        <Card>
          <EmptyState
            icon="wallet-outline"
            title="No open loans"
            message="Save a loan first. Then this screen shows which loan to prepay first."
            action={<Button label="Add a loan" fullWidth={false} onPress={() => router.push('/loan/form')} />}
          />
        </Card>
      </Screen>
    );
  }

  const best = options[0];

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Best use of {money(amount)}
        </Label>
        <Label size="title" weight="bold">
          {best ? best.name : 'Enter an amount'}
        </Label>
        {best ? (
          <Label size="micro" tone="faint">
            Saves {money(best.interestSaved)} in interest
            {best.monthsSaved > 0 ? ` and ends the loan ${formatTenure(best.monthsSaved)} early` : ''}.
          </Label>
        ) : null}
      </Card>

      <Card title="Extra money">
        <RowField label="Lump sum" value={amount} onChange={setAmount} prefix="currency" min={0} />
        <SegmentedControl<AdjustMode>
          label="Use the saving to"
          segments={[
            { value: 'reduce_tenure', label: 'Reduce tenure' },
            { value: 'reduce_emi', label: 'Reduce EMI' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Label size="micro" tone="faint">
          Paid as a one-time part payment with the next instalment of each loan.
        </Label>
      </Card>

      {options.map((option, index) => (
        <Card
          key={option.id}
          title={`${index + 1}. ${option.name}`}
          action={index === 0 ? <Chip label="Best choice" tone="positive" icon="star-outline" /> : undefined}
        >
          <KeyValueRow label="Interest rate" value={`${formatPercent(option.annualRate)} p.a.`} />
          <KeyValueRow label="Interest saved" value={money(option.interestSaved)} tone="positive" emphasis />
          {mode === 'reduce_tenure' ? (
            <KeyValueRow
              label="Loan ends"
              value={formatMonthYear(option.newLastPaymentDate)}
              hint={option.monthsSaved > 0 ? `${formatTenure(option.monthsSaved)} early` : undefined}
            />
          ) : (
            <KeyValueRow label="New EMI" value={money(option.newEmi)} />
          )}
          {option.applied < amount ? (
            <KeyValueRow
              label="Amount used"
              value={money(option.applied)}
              hint="This clears the loan. You keep the rest."
            />
          ) : null}
          <View style={{ marginTop: spacing.md }}>
            <Button
              label={`Record ${money(option.applied)} part payment`}
              variant={index === 0 ? 'primary' : 'secondary'}
              icon="cash-outline"
              onPress={() => {
                const candidate = candidates.find((c) => c.id === option.id)!;
                void addEvent(option.id, {
                  kind: 'part_payment',
                  amount: option.applied,
                  startMonth: candidate.nextInstallment,
                  frequency: 'once',
                  mode,
                }).then(() => router.push(`/loan/${option.id}`));
              }}
            />
          </View>
        </Card>
      ))}

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Before you prepay, ask your lender about prepayment charges. Banks in India cannot charge them on
        floating-rate home loans taken by individuals.
      </Label>
    </Screen>
  );
}
