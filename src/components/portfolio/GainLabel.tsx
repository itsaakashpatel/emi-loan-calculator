import { formatMoney, formatPercent } from '../../lib/format/money';
import { Label } from '../primitives';

/**
 * A gain or loss, signed and coloured.
 *
 * Gains and losses are the figures people scan for, so they always carry an
 * explicit sign and a colour. Exactly zero stays neutral: tinting it green
 * would imply a gain that is not there.
 */
export function GainLabel({
  gain,
  gainPct,
  size = 'body',
  currency = 'INR',
}: {
  gain: number;
  gainPct?: number;
  size?: 'micro' | 'caption' | 'body' | 'subhead' | 'title';
  currency?: string;
}) {
  const tone = gain > 0 ? 'positive' : gain < 0 ? 'negative' : 'muted';
  const sign = gain > 0 ? '+' : '';
  const amount = `${sign}${formatMoney(gain, { currency })}`;

  return (
    <Label size={size} weight="semibold" tone={tone} tabular>
      {gainPct === undefined ? amount : `${amount} (${sign}${formatPercent(gainPct, 1)})`}
    </Label>
  );
}
