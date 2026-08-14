import { useMemo, useState } from 'react';

import { Screen } from '../../src/components/Screen';
import { DateField } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { formatDate, todayISO } from '../../src/lib/format/date';
import { formatNumber } from '../../src/lib/format/money';
import { calculateAge } from '../../src/lib/tools/everyday';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function AgeScreen() {
  const { spacing } = useTheme();
  const [birthDate, setBirthDate] = useState('1990-01-01');
  const [on, setOn] = useState(todayISO());

  const result = useMemo(() => calculateAge(birthDate, on), [birthDate, on]);
  const count = (value: number) => formatNumber(value, { grouping: 'western' });

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Age
        </Label>
        {result.unborn ? (
          <>
            <Label size="hero" weight="bold">
              —
            </Label>
            <Label size="micro" tone="faint">
              The date of birth is later than the date you are measuring to.
            </Label>
          </>
        ) : (
          <>
            <Label size="hero" weight="bold">
              {result.years} {result.years === 1 ? 'year' : 'years'}
            </Label>
            <Label size="micro" tone="faint">
              {result.months} {result.months === 1 ? 'month' : 'months'} and {result.days}{' '}
              {result.days === 1 ? 'day' : 'days'} on {formatDate(on)}.
            </Label>
          </>
        )}
      </Card>

      <Card title="Dates">
        <DateField label="Date of birth" value={birthDate} onChange={setBirthDate} />
        <DateField label="Age on" value={on} onChange={setOn} />
      </Card>

      {result.unborn ? null : (
        <Card title="Details">
          <KeyValueRow label="Total months" value={count(result.totalMonths)} />
          <KeyValueRow label="Total days" value={count(result.totalDays)} />
          <KeyValueRow label="Next birthday" value={formatDate(result.nextBirthday)} />
          <KeyValueRow
            label="Days until then"
            value={result.daysToNextBirthday === 0 ? 'Today' : count(result.daysToNextBirthday)}
            tone={result.daysToNextBirthday === 0 ? 'positive' : undefined}
            emphasis
            last
          />
        </Card>
      )}

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        A 29 February birthday is observed on 28 February in a common year, which is the rule most
        places use for age of majority.
      </Label>
    </Screen>
  );
}
