import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { DateField, NumberField, StepperField, TextField } from '../../src/components/inputs';
import { Button, Card, KeyValueRow, Label } from '../../src/components/primitives';
import { draftFromLoan, type LoanDraft } from '../../src/db/loans';
import { amortize } from '../../src/lib/finance/emi';
import { todayISO } from '../../src/lib/format/date';
import { formatMoney, formatTenure } from '../../src/lib/format/money';
import { LOAN_TYPES, useCalculatorStore, type LoanType } from '../../src/store/calculator';
import { useLoansStore } from '../../src/store/loans';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';
import { LoanTypeSelector } from '../../src/components/LoanTypeSelector';

/**
 * Create or edit a saved loan. With no `id` it seeds itself from whatever is on the calculator tab,
 * so "Save to My Loans" carries the working numbers straight through.
 */
export default function LoanFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const loanId = id ? Number(id) : undefined;

  const { spacing } = useTheme();
  const currency = useCurrency();
  const create = useLoansStore((s) => s.create);
  const update = useLoansStore((s) => s.update);

  // Seeded once on mount: either the loan being edited, or the calculator's current working numbers.
  const [draft, setDraft] = useState<LoanDraft>(() => {
    const existing = loanId ? useLoansStore.getState().byId(loanId) : undefined;
    if (existing) return draftFromLoan(existing.loan);
    const calculator = useCalculatorStore.getState();
    return {
      name: '',
      type: calculator.loanType,
      principal: calculator.principal,
      annualRate: calculator.annualRate,
      tenureMonths: calculator.tenureMonths,
      startDate: calculator.startDate,
      advanceEmis: calculator.advanceEmis,
      fees: calculator.fees,
      currency,
      events: calculator.events,
    };
  });

  useEffect(() => {
    navigation.setOptions({ title: loanId ? 'Edit Loan' : 'Save Loan' });
  }, [navigation, loanId]);

  const patch = (changes: Partial<LoanDraft>) => setDraft((prev) => ({ ...prev, ...changes }));

  const preview = useMemo(
    () =>
      amortize({
        principal: draft.principal,
        annualRate: draft.annualRate,
        tenureMonths: draft.tenureMonths,
        startDate: draft.startDate,
        advanceEmis: draft.advanceEmis,
        fees: draft.fees,
        events: draft.events,
      }),
    [draft],
  );

  const defaultName = useMemo(() => {
    const label = LOAN_TYPES.find((t) => t.value === draft.type)?.label ?? 'Loan';
    return `${label} loan`;
  }, [draft.type]);

  const save = async () => {
    const named: LoanDraft = { ...draft, name: draft.name.trim() || defaultName };
    if (named.principal <= 0) {
      Alert.alert('Add an amount', 'Enter the loan amount before saving.');
      return;
    }
    try {
      if (loanId) {
        await update(loanId, named);
        router.back();
      } else {
        const newId = await create(named);
        router.dismissTo(`/loan/${newId}`);
      }
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Unknown error.');
    }
  };

  return (
    <Screen
      footer={
        <Button label={loanId ? 'Save changes' : 'Save loan'} icon="checkmark-outline" onPress={() => void save()} />
      }
    >
      <Card title="Loan">
        <TextField
          label="Name"
          value={draft.name}
          onChange={(name) => patch({ name })}
          placeholder={defaultName}
        />
        <Label size="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
          Type
        </Label>
        <LoanTypeSelector value={draft.type} onChange={(type: LoanType) => patch({ type })} />
      </Card>

      <Card title="Terms">
        <NumberField
          label="Loan amount"
          value={draft.principal}
          onChange={(principal) => patch({ principal })}
          prefix="currency"
          min={0}
        />
        <NumberField
          label="Interest rate"
          value={draft.annualRate}
          onChange={(annualRate) => patch({ annualRate })}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <NumberField
          label="Tenure"
          value={draft.tenureMonths}
          onChange={(tenureMonths) => patch({ tenureMonths })}
          suffix="mo"
          hint={formatTenure(draft.tenureMonths)}
          min={1}
          max={480}
        />
        <DateField
          label="Loan starts on"
          value={draft.startDate || todayISO()}
          onChange={(startDate) => patch({ startDate })}
        />
        <StepperField
          label="Advance EMIs"
          value={draft.advanceEmis}
          onChange={(advanceEmis) => patch({ advanceEmis })}
          min={0}
          max={12}
        />
        <NumberField
          label="Processing fee"
          value={draft.fees}
          onChange={(fees) => patch({ fees })}
          prefix="currency"
          placeholder="Optional"
          min={0}
        />
      </Card>

      <Card title="Preview">
        <KeyValueRow label="EMI" value={formatMoney(preview.emi, { currency: draft.currency })} emphasis />
        <KeyValueRow label="Installments" value={String(preview.tenureMonths)} />
        <KeyValueRow
          label="Total interest"
          value={formatMoney(preview.totalInterest, { currency: draft.currency })}
          tone="warning"
        />
        <KeyValueRow
          label="Adjustments carried over"
          value={draft.events.length === 0 ? 'None' : String(draft.events.length)}
          last
        />
      </Card>

      <View style={{ height: spacing.sm }} />
    </Screen>
  );
}
