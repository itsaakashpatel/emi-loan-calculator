import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { saveCalculation } from '../../src/db/calculations';

import { ChartLegend, DonutChart } from '../../src/components/charts';
import { LoanTypeSelector } from '../../src/components/LoanTypeSelector';
import { Screen } from '../../src/components/Screen';
import { CompactField, DateField, SegmentedControl, StepperField, TenureField } from '../../src/components/inputs';
import { Button, Card, Chip, IconGlyph, KeyValueRow, Label, ListRow } from '../../src/components/primitives';
import {
  computeSavings,
  resolveFirstPaymentDate,
  solveAnnualRate,
  solvePrincipal,
  solveTenureMonths,
} from '../../src/lib/finance/emi';
import { describeMonthGap, formatDate, monthsBetween, todayISO } from '../../src/lib/format/date';
import {
  amountToWords,
  formatMoney,
  formatPercent,
  formatTenure,
  getCurrency,
} from '../../src/lib/format/money';
import {
  LOAN_TYPES,
  SOLVE_FOR_OPTIONS,
  useCalculatorStore,
  type SolveFor,
} from '../../src/store/calculator';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function EmiCalculatorScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const currency = useCurrency();
  const grouping = getCurrency(currency).grouping;

  const principal = useCalculatorStore((s) => s.principal);
  const annualRate = useCalculatorStore((s) => s.annualRate);
  const tenureMonths = useCalculatorStore((s) => s.tenureMonths);
  const emiInput = useCalculatorStore((s) => s.emi);
  const startDate = useCalculatorStore((s) => s.startDate);
  const firstPaymentDate = useCalculatorStore((s) => s.firstPaymentDate);
  const fees = useCalculatorStore((s) => s.fees);
  const advanceEmis = useCalculatorStore((s) => s.advanceEmis);
  const loanType = useCalculatorStore((s) => s.loanType);
  const events = useCalculatorStore((s) => s.events);
  const solveFor = useCalculatorStore((s) => s.solveFor);
  const revision = useCalculatorStore((s) => s.revision);

  const setPrincipal = useCalculatorStore((s) => s.setPrincipal);
  const setAnnualRate = useCalculatorStore((s) => s.setAnnualRate);
  const setTenureMonths = useCalculatorStore((s) => s.setTenureMonths);
  const setEmi = useCalculatorStore((s) => s.setEmi);
  const setStartDate = useCalculatorStore((s) => s.setStartDate);
  const setFirstPaymentDate = useCalculatorStore((s) => s.setFirstPaymentDate);
  const setFees = useCalculatorStore((s) => s.setFees);
  const setAdvanceEmis = useCalculatorStore((s) => s.setAdvanceEmis);
  const setLoanType = useCalculatorStore((s) => s.setLoanType);
  const setSolveFor = useCalculatorStore((s) => s.setSolveFor);

  const [moreOpen, setMoreOpen] = useState(false);

  const money = (value: number) => formatMoney(value, { currency });

  /**
   * Resolve the unknown variable, then amortise. `null` means the inputs describe a loan that can
   * never be repaid (an EMI below the monthly interest, say), which the UI has to explain.
   */
  const resolved = useMemo(() => {
    switch (solveFor) {
      case 'emi':
        return { principal, annualRate, tenureMonths };
      case 'amount': {
        const solved = solvePrincipal(emiInput, annualRate, tenureMonths);
        return solved > 0 ? { principal: solved, annualRate, tenureMonths } : null;
      }
      case 'rate': {
        const solved = solveAnnualRate(principal, tenureMonths, emiInput);
        return solved === null ? null : { principal, annualRate: solved, tenureMonths };
      }
      case 'tenure': {
        const solved = solveTenureMonths(principal, annualRate, emiInput);
        return solved === null ? null : { principal, annualRate, tenureMonths: solved };
      }
    }
  }, [solveFor, principal, annualRate, tenureMonths, emiInput]);

  const savings = useMemo(
    () =>
      resolved
        ? computeSavings({ ...resolved, startDate, fees, advanceEmis, events })
        : null,
    [resolved, startDate, fees, advanceEmis, events],
  );
  const result = savings?.withEvents ?? null;
  const hasEvents = events.length > 0;

  const headline = useMemo(() => {
    if (!result) return null;
    switch (solveFor) {
      case 'emi':
        return {
          label: 'Monthly EMI',
          value: money(result.emi),
          caption: amountToWords(result.emi, grouping),
        };
      case 'amount':
        return {
          label: 'You can borrow',
          value: money(result.principal),
          caption: amountToWords(result.principal, grouping),
        };
      case 'rate':
        return {
          label: 'Interest rate',
          value: formatPercent(result.schedule.length > 0 ? impliedRate(result) : 0),
          caption: `per annum, on a reducing balance`,
        };
      case 'tenure':
        return {
          label: 'Loan closes in',
          value: formatTenure(result.tenureMonths),
          caption: `${result.tenureMonths} instalments`,
        };
    }
  }, [result, solveFor, currency, grouping]);

  /**
   * Record the calculation in History, but only once the user stops adjusting — a slider drag fires
   * dozens of renders and every one of them would otherwise be a row.
   */
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!resolved) return;
    if (historyTimer.current) clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      void saveCalculation('loan', 'EMI calculation', {
        principal: resolved.principal,
        annualRate: resolved.annualRate,
        tenureMonths: resolved.tenureMonths,
        startDate,
        fees,
        advanceEmis,
      }).catch(() => {
        // History is a convenience; a failed write must never interrupt the calculator.
      });
    }, 2500);
    return () => {
      if (historyTimer.current) clearTimeout(historyTimer.current);
    };
  }, [resolved, startDate, fees, advanceEmis]);


  // The date the first instalment actually falls on, whether or not the user has overridden it.
  const firstEmiOn = resolveFirstPaymentDate(startDate, firstPaymentDate ?? undefined);

  const resetAll = () => {
    const { defaultRate, defaultTenureYears } = useSettingsStore.getState();
    useCalculatorStore.getState().loadFrom({
      principal: 1_000_000,
      annualRate: defaultRate,
      tenureMonths: Math.round(defaultTenureYears * 12),
      startDate: todayISO(),
      events: [],
      fees: 0,
      advanceEmis: 0,
    });
  };

  return (
    <Screen>
      <SegmentedControl<SolveFor>
        label="Calculate"
        segments={SOLVE_FOR_OPTIONS}
        value={solveFor}
        onChange={setSolveFor}
      />

      {result && headline ? (
        <Card>
          <View style={styles.headlineRow}>
            <View style={styles.flex}>
              <Label size="caption" tone="muted">
                {headline.label}
              </Label>
              <Label size="hero" weight="bold" tabular>
                {headline.value}
              </Label>
              <Label size="micro" tone="faint" numberOfLines={2}>
                {headline.caption}
              </Label>
            </View>
            <DonutChart
              size={116}
              thickness={17}
              centerLabel="Interest"
              centerValue={formatPercent(interestShare(result), 0)}
              slices={[
                { label: 'Principal', value: result.principal, color: colors.principal },
                { label: 'Interest', value: result.totalInterest, color: colors.interest },
              ]}
            />
          </View>

          <View style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
            {/* The share goes in the legend rather than on the ring — a 116pt donut is far too
                small to hold text on the band without clipping it. */}
            <ChartLegend
              items={[
                {
                  label: 'Principal',
                  color: colors.principal,
                  value: formatPercent(100 - interestShare(result), 0),
                },
                {
                  label: 'Interest',
                  color: colors.interest,
                  value: formatPercent(interestShare(result), 0),
                },
              ]}
            />
          </View>

          {solveFor !== 'emi' ? <KeyValueRow label="Monthly EMI" value={money(result.emi)} /> : null}
          {solveFor !== 'amount' ? (
            <KeyValueRow label="Loan amount" value={money(result.principal)} />
          ) : null}
          <KeyValueRow label="Total interest" value={money(result.totalInterest)} tone="warning" />
          <KeyValueRow label="Total payment" value={money(result.totalPayment)} emphasis last />

          {hasEvents && savings && savings.interestSaved > 0.5 ? (
            <View
              style={{
                backgroundColor: colors.positiveSoft,
                borderRadius: radius.md,
                padding: spacing.md,
                marginTop: spacing.md,
              }}
            >
              <Label size="caption" weight="semibold" tone="positive">
                Adjustments save {money(savings.interestSaved)}
                {savings.monthsSaved > 0 ? ` and ${formatTenure(savings.monthsSaved)}` : ''}
              </Label>
            </View>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Label size="body" weight="semibold" tone="negative">
            No repayment schedule fits these numbers
          </Label>
          <Label size="caption" tone="muted" style={{ marginTop: 4 }}>
            {solveFor === 'rate'
              ? 'The instalment is either too small to repay the loan or larger than the loan itself. Adjust the EMI, amount or tenure.'
              : 'The instalment does not cover the monthly interest, so the balance would never fall. Increase the EMI or reduce the amount.'}
          </Label>
        </Card>
      )}

      <Card>
        {solveFor !== 'amount' ? (
          <CompactField
            label="Loan amount"
            value={principal}
            onChange={setPrincipal}
            prefix="currency"
            caption={amountToWords(principal, grouping)}
            min={0}
            resetKey={revision}
            slider={{ min: 50_000, max: 20_000_000, step: 50_000, minLabel: '50 K', maxLabel: '2 Cr' }}
          />
        ) : null}

        {solveFor !== 'emi' ? (
          <CompactField
            label="Monthly EMI"
            value={emiInput}
            onChange={setEmi}
            prefix="currency"
            caption={amountToWords(emiInput, grouping)}
            min={0}
            resetKey={revision}
            slider={{ min: 1_000, max: 500_000, step: 500, minLabel: '1 K', maxLabel: '5 L' }}
          />
        ) : null}

        {solveFor !== 'rate' ? (
          <CompactField
            label="Interest rate"
            value={annualRate}
            onChange={setAnnualRate}
            suffix="%"
            decimals={2}
            min={0}
            max={60}
            resetKey={revision}
            slider={{ min: 1, max: 24, step: 0.05, minLabel: '1%', maxLabel: '24%' }}
          />
        ) : null}

        {solveFor !== 'tenure' ? (
          <TenureField
            label="Tenure"
            months={tenureMonths}
            onChange={setTenureMonths}
            resetKey={revision}
            slider
            compact
          />
        ) : null}
      </Card>

      <Button
        label="View full details"
        icon="list-outline"
        onPress={() => router.push('/emi/schedule')}
        style={{ marginBottom: spacing.md }}
      />

      <Card padded={false}>
        <ListRow
          title="Part payment, advance EMI & holiday"
          subtitle={
            hasEvents
              ? `${events.length} adjustment${events.length > 1 ? 's' : ''} applied`
              : 'Model prepayments and EMI holidays'
          }
          icon="options-outline"
          onPress={() => router.push('/emi/advanced')}
          right={hasEvents ? <Chip label="Active" tone="accent" /> : undefined}
        />
        <ListRow
          title="Compare loans"
          subtitle="Up to 3 scenarios side by side"
          icon="git-compare-outline"
          onPress={() => router.push('/compare')}
        />
        <ListRow
          title="Save to My Loans"
          subtitle="Track payments against this loan"
          icon="bookmark-outline"
          onPress={() => router.push('/loan/form')}
          last
        />
      </Card>

      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: moreOpen }}
          onPress={() => setMoreOpen((open) => !open)}
          style={({ pressed }) => [
            styles.moreHeader,
            { padding: spacing.lg, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Label size="body" weight="medium">
            More options
          </Label>
          <Label size="caption" tone="muted" numberOfLines={1} style={styles.moreSummary}>
            {LOAN_TYPES.find((t) => t.value === loanType)?.label ?? 'Loan'} · from{' '}
            {formatDate(startDate)}
            {fees > 0 ? ` · fee ${money(fees)}` : ''}
            {advanceEmis > 0 ? ` · ${advanceEmis} advance` : ''}
          </Label>
          <IconGlyph
            name={moreOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textFaint}
            style={styles.moreChevron}
          />
        </Pressable>

        {moreOpen ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
            <Label size="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
              Loan type
            </Label>
            <LoanTypeSelector value={loanType} onChange={setLoanType} />
            <View style={{ height: spacing.lg }} />
            <DateField
              label="Money disbursed on"
              value={startDate}
              onChange={setStartDate}
              hint="The day the loan amount reaches you."
            />
            <DateField
              label="First EMI on"
              value={firstEmiOn}
              onChange={setFirstPaymentDate}
              hint={`Instalment 1 falls due ${describeMonthGap(monthsBetween(startDate, firstEmiOn))}.`}
            />
            <CompactField
              label="Processing fee"
              value={fees}
              onChange={setFees}
              prefix="currency"
              min={0}
              resetKey={revision}
            />
            <StepperField
              label="Advance EMIs"
              value={advanceEmis}
              onChange={setAdvanceEmis}
              min={0}
              max={12}
            />
            <Button label="Reset to defaults" variant="ghost" icon="refresh-outline" onPress={resetAll} />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

/** Interest as a share of everything paid — the figure the donut visualises. */
function interestShare(result: { totalPayment: number; totalInterest: number }): number {
  return result.totalPayment > 0 ? (result.totalInterest / result.totalPayment) * 100 : 0;
}

/** Recovers the rate actually used from the first instalment, for the solve-for-rate headline. */
function impliedRate(result: { schedule: Array<{ opening: number; interest: number }> }): number {
  const first = result.schedule[0];
  if (!first || first.opening <= 0) return 0;
  return (first.interest / first.opening) * 1200;
}

const styles = StyleSheet.create({
  headlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  moreHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreSummary: { flexShrink: 1 },
  moreChevron: { marginLeft: 'auto' },
});
