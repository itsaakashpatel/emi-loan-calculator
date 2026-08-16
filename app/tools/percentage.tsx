import { useMemo, useState } from 'react';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { formatNumber, formatPercent } from '../../src/lib/format/money';
import { calculatePercent, type PercentMode } from '../../src/lib/tools/everyday';
import { useTheme } from '../../src/theme/ThemeProvider';

const MODES: ReadonlyArray<{
  value: PercentMode;
  segment: string;
  question: string;
  firstLabel: string;
  secondLabel: string;
  /** `true` when the answer is a percentage rather than a plain number. */
  answerIsPercent: boolean;
}> = [
  {
    value: 'of',
    segment: '% of',
    question: 'What is A% of B?',
    firstLabel: 'A — the percentage',
    secondLabel: 'B — the amount',
    answerIsPercent: false,
  },
  {
    value: 'is_what',
    segment: 'Is what %',
    question: 'A is what percent of B?',
    firstLabel: 'A — the part',
    secondLabel: 'B — the whole',
    answerIsPercent: true,
  },
  {
    value: 'change',
    segment: '% change',
    question: 'What is the change from A to B?',
    firstLabel: 'A — the starting value',
    secondLabel: 'B — the ending value',
    answerIsPercent: true,
  },
];

export default function PercentageScreen() {
  const { spacing } = useTheme();
  const [mode, setMode] = useState<PercentMode>('of');
  const [a, setA] = useState(15);
  const [b, setB] = useState(200);

  const spec = MODES.find((entry) => entry.value === mode)!;
  const result = useMemo(() => calculatePercent(mode, a, b), [mode, a, b]);

  const number = (value: number) => formatNumber(value, { decimals: 2, grouping: 'western' });
  const answer = result.undefinedResult
    ? '—'
    : spec.answerIsPercent
      ? formatPercent(result.value)
      : number(result.value);

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          {spec.question}
        </Label>
        <Label size="hero" weight="bold" tabular>
          {answer}
        </Label>
        <Label size="micro" tone="faint">
          {result.undefinedResult
            ? mode === 'is_what'
              ? 'A share of zero has no percentage.'
              : 'Change from zero has no percentage.'
            : mode === 'of'
              ? `${number(a)}% of ${number(b)}`
              : mode === 'is_what'
                ? `${number(a)} out of ${number(b)}`
                : `${number(a)} to ${number(b)} — ${result.value >= 0 ? 'an increase' : 'a decrease'}`}
        </Label>
      </Card>

      <Card title="Inputs">
        <SegmentedControl<PercentMode>
          segments={MODES.map((entry) => ({ value: entry.value, label: entry.segment }))}
          value={mode}
          onChange={setMode}
        />
        <NumberField
          label={spec.firstLabel}
          value={a}
          onChange={setA}
          suffix={mode === 'of' ? '%' : undefined}
          decimals={2}
        />
        <NumberField label={spec.secondLabel} value={b} onChange={setB} decimals={2} />
      </Card>

      {mode === 'change' && !result.undefinedResult ? (
        <Card title="Breakdown">
          <KeyValueRow label="Starting value" value={number(a)} />
          <KeyValueRow label="Ending value" value={number(b)} />
          <KeyValueRow
            label="Absolute change"
            value={number(b - a)}
            tone={b - a >= 0 ? 'positive' : 'negative'}
          />
          <KeyValueRow
            label="Percentage change"
            value={formatPercent(result.value)}
            tone={result.value >= 0 ? 'positive' : 'negative'}
            emphasis
            last
          />
        </Card>
      ) : null}

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Percentage change is measured against the size of the starting value, so a move from -200 to
        -100 counts as a 50% rise.
      </Label>
    </Screen>
  );
}
