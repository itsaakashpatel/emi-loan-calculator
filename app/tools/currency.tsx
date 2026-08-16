import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { NumberField } from '../../src/components/inputs';
import { Button, Card, Chip, IconChip, KeyValueRow, Label, SelectChipRow } from '../../src/components/primitives';
import { formatDate, toISO } from '../../src/lib/format/date';
import { CURRENCIES, currencyTag, formatMoney } from '../../src/lib/format/money';
import { convert, getRates, type RatesResult } from '../../src/lib/fx';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

const QUICK_QUOTES = ['USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD', 'JPY'];

export default function CurrencyScreen() {
  const { colors, spacing } = useTheme();
  const homeCurrency = useCurrency();

  const [amount, setAmount] = useState(1_000);
  const [from, setFrom] = useState(homeCurrency);
  const [to, setTo] = useState(homeCurrency === 'USD' ? 'INR' : 'USD');
  const [rates, setRates] = useState<RatesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setRates(await getRates('USD', forceRefresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load exchange rates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const converted = rates ? convert(amount, from, to, rates.rates, rates.base) : null;
  const unitRate = rates ? convert(1, from, to, rates.rates, rates.base) : null;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          {amount} {from} equals
        </Label>
        {loading && !rates ? (
          <View style={{ paddingVertical: spacing.lg }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : converted !== null ? (
          <>
            <Label size="hero" weight="bold" tabular>
              {formatMoney(converted, { currency: to, decimals: 2 })}
            </Label>
            <Label size="micro" tone="faint">
              1 {from} = {unitRate !== null ? unitRate.toFixed(4) : '—'} {to}
            </Label>
          </>
        ) : (
          <Label size="subhead" tone="negative">
            Rate unavailable for this pair
          </Label>
        )}

        {rates ? (
          <View style={{ marginTop: spacing.md, flexDirection: 'row' }}>
            <Chip
              label={`${rates.source === 'live' ? 'Live' : 'Saved'} rates as of ${formatDate(isoDate(rates.fetchedAt))}`}
              tone={rates.source === 'live' ? 'positive' : 'warning'}
              icon={rates.source === 'live' ? 'cloud-done-outline' : 'cloud-offline-outline'}
            />
          </View>
        ) : null}
      </Card>

      {error ? (
        <Card>
          <Label size="caption" tone="negative">
            {error}
          </Label>
          <Label size="micro" tone="faint" style={{ marginTop: 2 }}>
            Connect to the internet once and the rates are stored for offline use.
          </Label>
        </Card>
      ) : null}

      <Card title="Convert">
        <NumberField label="Amount" value={amount} onChange={setAmount} decimals={2} min={0} />

        <CurrencyPicker label="From" value={from} onChange={setFrom} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap the two currencies"
          hitSlop={8}
          onPress={swap}
          style={({ pressed }) => [styles.swap, { opacity: pressed ? 0.6 : 1, marginBottom: spacing.md }]}
        >
          <IconChip icon="swap-vertical" />
        </Pressable>
        <CurrencyPicker label="To" value={to} onChange={setTo} />
      </Card>

      {rates ? (
        <Card title={`Popular rates for 1 ${from}`}>
          {QUICK_QUOTES.filter((code) => code !== from).map((code, index, list) => {
            const rate = convert(1, from, code, rates.rates, rates.base);
            return (
              <KeyValueRow
                key={code}
                label={currencyTag(code)}
                hint={CURRENCIES.find((c) => c.code === code)?.name}
                value={rate !== null ? rate.toFixed(4) : '—'}
                last={index === list.length - 1}
              />
            );
          })}
        </Card>
      ) : null}

      <Button
        label={loading ? 'Refreshing…' : 'Refresh rates'}
        icon="refresh-outline"
        variant="secondary"
        disabled={loading}
        onPress={() => void load(true)}
      />

      <Label size="micro" tone="faint" style={{ marginTop: spacing.md, marginHorizontal: spacing.xs }}>
        Mid-market rates from open.er-api.com, updated once a day. Banks and cards apply their own
        spread, so the amount you actually receive will differ.
      </Label>
    </Screen>
  );
}

/** ISO timestamp -> `YYYY-MM-DD` for display. */
function isoDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10);
  return toISO({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

function CurrencyPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Label size="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
        {label}
      </Label>
      <SelectChipRow
        options={CURRENCIES.map((entry) => ({
          value: entry.code,
          label: entry.code,
          hint: entry.name,
        }))}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  swap: { alignSelf: 'center' },
});
