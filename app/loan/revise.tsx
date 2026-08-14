import { useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { RowField, SegmentedControl } from '../../src/components/inputs';
import { ActionButtons, Card, KeyValueRow, Label } from '../../src/components/primitives';
import { reviseLoan, type ReviseOutcome } from '../../src/lib/finance/revise';
import { formatMoney, formatPercent, formatTenure } from '../../src/lib/format/money';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Which change is being modelled against the running loan. */
type Change = 'prepayment' | 'rate';

const DEFAULTS = {
  outstanding: 1_000_000,
  currentRate: 9,
  currentEmi: 12_000,
  prepayment: 200_000,
};

/**
 * What a lump sum or a rate change does to a loan already running.
 *
 * It starts from where the borrower actually is — outstanding balance, the rate being charged, the
 * instalment being paid — and derives the months left from those three, rather than asking for the
 * original loan again.
 */
export default function ReviseScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();
  const defaultRate = useSettingsStore((s) => s.defaultRate);

  const [change, setChange] = useState<Change>('prepayment');
  const [outstanding, setOutstanding] = useState(DEFAULTS.outstanding);
  const [currentRate, setCurrentRate] = useState(defaultRate || DEFAULTS.currentRate);
  const [currentEmi, setCurrentEmi] = useState(DEFAULTS.currentEmi);
  const [prepayment, setPrepayment] = useState(DEFAULTS.prepayment);
  const [revisedRate, setRevisedRate] = useState(Math.max(0, (defaultRate || DEFAULTS.currentRate) - 1));

  const result = useMemo(
    () =>
      reviseLoan({
        outstanding,
        currentAnnualRate: currentRate,
        currentEmi,
        ...(change === 'prepayment' ? { prepayment } : { revisedAnnualRate: revisedRate }),
      }),
    [change, outstanding, currentRate, currentEmi, prepayment, revisedRate],
  );

  const money = (value: number) => formatMoney(value, { currency });

  const reset = () => {
    setOutstanding(DEFAULTS.outstanding);
    setCurrentRate(defaultRate || DEFAULTS.currentRate);
    setCurrentEmi(DEFAULTS.currentEmi);
    setPrepayment(DEFAULTS.prepayment);
    setRevisedRate(Math.max(0, (defaultRate || DEFAULTS.currentRate) - 1));
  };

  return (
    <Screen>
      <Card>
        {result.current === null ? (
          <>
            <Label size="caption" tone="muted">
              Revised EMI and tenure
            </Label>
            <Label size="hero" weight="bold">
              —
            </Label>
            <Label size="micro" tone="faint">
              {money(currentEmi)} does not cover a month of interest on {money(outstanding)} at{' '}
              {formatPercent(currentRate)}, so this loan never closes. Raise the EMI.
            </Label>
          </>
        ) : (
          <>
            <Label size="caption" tone="muted">
              {change === 'prepayment' ? 'Paying' : 'Moving to'}{' '}
              {change === 'prepayment' ? money(prepayment) : formatPercent(revisedRate)}
            </Label>
            <Label size="hero" weight="bold" tabular>
              {result.monthsSaved > 0
                ? `${formatTenure(result.monthsSaved)} sooner`
                : result.monthsSaved < 0
                  ? `${formatTenure(-result.monthsSaved)} longer`
                  : 'No change'}
            </Label>
            <Label size="micro" tone="faint">
              {result.interestSavedKeepingEmi >= 0
                ? `Saves ${money(result.interestSavedKeepingEmi)} of interest if you keep paying ${money(currentEmi)}.`
                : `Costs ${money(-result.interestSavedKeepingEmi)} more interest at the same EMI.`}
            </Label>
          </>
        )}
      </Card>

      <Card title="Your loan today">
        <RowField
          label="Outstanding Amount"
          value={outstanding}
          onChange={setOutstanding}
          prefix="currency"
          min={0}
        />
        <RowField
          label="Current Rate"
          value={currentRate}
          onChange={setCurrentRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <RowField
          label="Current EMI"
          value={currentEmi}
          onChange={setCurrentEmi}
          prefix="currency"
          min={0}
          caption={result.current ? `${formatTenure(result.current.tenureMonths)} left at this EMI` : undefined}
        />
      </Card>

      <Card title="The change">
        <SegmentedControl<Change>
          segments={[
            { value: 'prepayment', label: 'Pre Payment' },
            { value: 'rate', label: 'Rate Change' },
          ]}
          value={change}
          onChange={setChange}
        />
        {change === 'prepayment' ? (
          <RowField
            label="Pre Payment Amount"
            value={prepayment}
            onChange={setPrepayment}
            prefix="currency"
            min={0}
            caption={`Balance after: ${money(result.balanceAfterPrepayment)}`}
          />
        ) : (
          <RowField
            label="Revised Rate"
            value={revisedRate}
            onChange={setRevisedRate}
            suffix="%"
            decimals={2}
            min={0}
            max={60}
            caption={
              revisedRate === currentRate
                ? 'Same as the current rate'
                : `${formatPercent(Math.abs(revisedRate - currentRate))} ${revisedRate < currentRate ? 'lower' : 'higher'}`
            }
          />
        )}
        <ActionButtons onReset={reset} onCalculate={() => Keyboard.dismiss()} />
      </Card>

      {result.current ? (
        <>
          <Card title="Keep the same EMI">
            <Outcome
              outcome={result.keepEmi}
              before={result.current}
              currency={currency}
              interestSaved={result.interestSavedKeepingEmi}
            />
          </Card>

          <Card title="Keep the same end date">
            <Outcome
              outcome={result.keepTenure}
              before={result.current}
              currency={currency}
              interestSaved={result.interestSavedKeepingTenure}
            />
          </Card>

          <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
            Keeping the EMI almost always saves more, because every rupee not paid as interest this
            month is a rupee that never compounds. Lowering the EMI instead frees up cash flow.
          </Label>
        </>
      ) : null}
    </Screen>
  );
}

function Outcome({
  outcome,
  before,
  currency,
  interestSaved,
}: {
  outcome: ReviseOutcome | null;
  before: ReviseOutcome;
  currency: string;
  interestSaved: number;
}) {
  const money = (value: number) => formatMoney(value, { currency });

  if (!outcome) {
    return (
      <Label size="caption" tone="muted">
        Not possible — the instalment would not cover the interest.
      </Label>
    );
  }

  return (
    <>
      <KeyValueRow label="Revised EMI" value={money(outcome.emi)} emphasis />
      <KeyValueRow label="Revised tenure" value={formatTenure(outcome.tenureMonths)} emphasis />
      <KeyValueRow label="Was" value={`${money(before.emi)} · ${formatTenure(before.tenureMonths)}`} />
      <KeyValueRow label="Interest still to pay" value={money(outcome.totalInterest)} tone="warning" />
      <KeyValueRow
        label={interestSaved >= 0 ? 'Interest saved' : 'Extra interest'}
        value={money(Math.abs(interestSaved))}
        tone={interestSaved > 0 ? 'positive' : interestSaved < 0 ? 'negative' : undefined}
        emphasis
        last
      />
    </>
  );
}
