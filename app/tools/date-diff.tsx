import { useMemo, useState } from 'react';

import { Screen } from '../../src/components/Screen';
import { DateField } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { addMonths, formatDate, todayISO } from '../../src/lib/format/date';
import { formatNumber } from '../../src/lib/format/money';
import { dateSpan } from '../../src/lib/tools/everyday';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Renders a calendar span as "3 years 2 months 5 days", skipping the parts that are zero. */
function describeSpan(years: number, months: number, days: number): string {
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (months) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  if (days || parts.length === 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  return parts.join(' ');
}

export default function DateDifferenceScreen() {
  const { spacing } = useTheme();
  // Open on a span that shows something, rather than on today-to-today and a row of zeroes.
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(() => addMonths(todayISO(), 1));

  const result = useMemo(() => dateSpan(from, to), [from, to]);
  const count = (value: number) => formatNumber(value, { grouping: 'western' });

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Difference
        </Label>
        <Label size="hero" weight="bold">
          {describeSpan(result.years, result.months, result.days)}
        </Label>
        <Label size="micro" tone="faint">
          {result.direction === 'same'
            ? 'The two dates are the same day.'
            : `${formatDate(from)} to ${formatDate(to)} — ${
                result.direction === 'past' ? 'the end date is earlier' : 'the end date is later'
              }.`}
        </Label>
      </Card>

      <Card title="Dates">
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
      </Card>

      <Card title="The same span, other ways">
        <KeyValueRow label="Total days" value={count(result.totalDays)} />
        <KeyValueRow
          label="Weeks"
          value={
            result.remainderDays === 0
              ? count(result.totalWeeks)
              : `${count(result.totalWeeks)} weeks ${result.remainderDays} d`
          }
        />
        <KeyValueRow label="Whole months" value={count(result.totalMonths)} />
        <KeyValueRow label="Hours" value={count(result.totalDays * 24)} emphasis last />
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        Both dates are counted from midnight, so the span excludes the end date itself. Months are
        measured on the calendar, which is why a month can be 28 to 31 days long.
      </Label>
    </Screen>
  );
}
