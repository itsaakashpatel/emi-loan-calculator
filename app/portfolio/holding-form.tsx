import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl, TextField } from '../../src/components/inputs';
import { Button, Card, Label, ListRow } from '../../src/components/primitives';
import { searchSchemes } from '../../src/lib/api/portfolio';
import type { Exchange, SchemeMatch } from '../../src/lib/api/types';
import { useAuthStore } from '../../src/store/auth';
import { usePortfolioStore } from '../../src/store/portfolio';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

type Kind = 'mf' | 'stock';

/**
 * Add or edit one holding. Editing arrives with `mfId` or `stockId`, which
 * also fixes the kind — a fund cannot become a stock.
 */
export default function HoldingFormScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const currency = useCurrency();
  const { memberId, mfId, stockId } = useLocalSearchParams<{
    memberId: string;
    mfId?: string;
    stockId?: string;
  }>();

  const existingMf = usePortfolioStore((s) => s.mfHoldings.find((h) => h.id === mfId));
  const existingStock = usePortfolioStore((s) => s.stockHoldings.find((h) => h.id === stockId));
  const editing = Boolean(mfId || stockId);

  const [kind, setKind] = useState<Kind>(stockId ? 'stock' : 'mf');
  const [saving, setSaving] = useState(false);

  const createMfHolding = usePortfolioStore((s) => s.createMfHolding);
  const updateMfHolding = usePortfolioStore((s) => s.updateMfHolding);
  const createStockHolding = usePortfolioStore((s) => s.createStockHolding);
  const updateStockHolding = usePortfolioStore((s) => s.updateStockHolding);

  // Mutual fund fields
  const [scheme, setScheme] = useState<SchemeMatch | null>(
    existingMf ? { amfiCode: existingMf.amfiCode, schemeName: existingMf.schemeName } : null,
  );
  const [units, setUnits] = useState(existingMf?.units ?? 0);
  const [avgNav, setAvgNav] = useState(existingMf?.avgNav ?? 0);
  const [folio, setFolio] = useState(existingMf?.folioNumber ?? '');

  // Stock fields
  const [symbol, setSymbol] = useState(existingStock?.symbol ?? '');
  const [exchange, setExchange] = useState<Exchange>(existingStock?.exchange ?? 'NSE');
  const [stockName, setStockName] = useState(existingStock?.stockName ?? '');
  const [quantity, setQuantity] = useState(existingStock?.quantity ?? 0);
  const [avgPrice, setAvgPrice] = useState(existingStock?.avgPrice ?? 0);

  const canSave =
    !saving &&
    (kind === 'mf'
      ? scheme !== null && units > 0
      : symbol.trim().length > 0 && stockName.trim().length > 0 && quantity > 0);

  const save = async () => {
    setSaving(true);
    try {
      if (kind === 'mf' && scheme) {
        const draft = {
          memberId,
          amfiCode: scheme.amfiCode,
          schemeName: scheme.schemeName,
          folioNumber: folio.trim() || null,
          units,
          avgNav: avgNav > 0 ? avgNav : null,
          investedValue: avgNav > 0 ? avgNav * units : null,
        };
        if (mfId) await updateMfHolding(mfId, draft);
        else await createMfHolding(draft);
      } else {
        const draft = {
          memberId,
          symbol: symbol.trim().toUpperCase(),
          exchange,
          stockName: stockName.trim(),
          quantity,
          avgPrice: avgPrice > 0 ? avgPrice : null,
          investedValue: avgPrice > 0 ? avgPrice * quantity : null,
        };
        if (stockId) await updateStockHolding(stockId, draft);
        else await createStockHolding(draft);
      }
      router.back();
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={saving ? 'Saving…' : editing ? 'Save changes' : 'Add holding'}
          disabled={!canSave}
          onPress={() => void save()}
        />
      }
    >
      {editing ? null : (
        <SegmentedControl
          segments={[
            { value: 'mf' as const, label: 'Mutual fund' },
            { value: 'stock' as const, label: 'Stock' },
          ]}
          value={kind}
          onChange={setKind}
        />
      )}

      {kind === 'mf' ? (
        <>
          <SchemePicker selected={scheme} onSelect={setScheme} />
          <Card>
            <NumberField label="Units" value={units} onChange={setUnits} decimals={3} />
            <NumberField
              label="Average NAV"
              value={avgNav}
              onChange={setAvgNav}
              decimals={4}
              prefix="currency"
            />
            <TextField
              label="Folio number (optional)"
              value={folio}
              onChange={setFolio}
              placeholder="12345678/90"
            />
            <Label size="micro" tone="faint">
              Leave the average NAV blank if you do not know it. Today&apos;s value still shows; the
              gain does not.
            </Label>
          </Card>
        </>
      ) : (
        <Card>
          <TextField
            label="Symbol"
            value={symbol}
            onChange={(next) => setSymbol(next.toUpperCase())}
            placeholder="RELIANCE"
          />
          <SegmentedControl
            label="Exchange"
            segments={[
              { value: 'NSE' as const, label: 'NSE' },
              { value: 'BSE' as const, label: 'BSE' },
            ]}
            value={exchange}
            onChange={setExchange}
          />
          <TextField
            label="Company name"
            value={stockName}
            onChange={setStockName}
            placeholder="Reliance Industries"
          />
          <NumberField label="Quantity" value={quantity} onChange={setQuantity} decimals={2} />
          <NumberField
            label="Average price"
            value={avgPrice}
            onChange={setAvgPrice}
            decimals={2}
            prefix="currency"
          />
          <View style={{ height: spacing.xs }} />
          <Label size="micro" tone="faint">
            Use the ticker as the exchange lists it. Prices refresh once a day.
          </Label>
        </Card>
      )}
    </Screen>
  );
}

/** Type-ahead over AMFI's scheme list, served by the API. */
function SchemePicker({
  selected,
  onSelect,
}: {
  selected: SchemeMatch | null;
  onSelect: (scheme: SchemeMatch | null) => void;
}) {
  const { colors, spacing } = useTheme();
  const token = useAuthStore((s) => s.token);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SchemeMatch[]>([]);
  const [searching, setSearching] = useState(false);
  // Guards against an earlier, slower response overwriting a later one.
  const latest = useRef(0);

  const run = useCallback(
    async (text: string) => {
      if (!token || text.trim().length < 3) {
        setResults([]);
        return;
      }
      const ticket = ++latest.current;
      setSearching(true);
      try {
        const { schemes } = await searchSchemes(token, text.trim());
        if (ticket === latest.current) setResults(schemes);
      } catch {
        if (ticket === latest.current) setResults([]);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    },
    [token],
  );

  // Debounced: one request per pause in typing, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void run(query), 350);
    return () => clearTimeout(timer);
  }, [query, run]);

  const hint = useMemo(() => {
    if (query.trim().length > 0 && query.trim().length < 3) return 'Keep typing to search.';
    if (searching) return 'Searching…';
    if (query.trim().length >= 3 && results.length === 0) return 'No schemes matched.';
    return null;
  }, [query, searching, results.length]);

  if (selected) {
    return (
      <Card title="Scheme">
        <Label size="body" weight="medium">
          {selected.schemeName}
        </Label>
        <View style={{ height: spacing.sm }} />
        <Button
          label="Choose a different scheme"
          variant="ghost"
          onPress={() => {
            setQuery('');
            setResults([]);
            // Clearing the selection is what reopens the search.
            onSelect(null);
          }}
        />
      </Card>
    );
  }

  return (
    <Card title="Scheme">
      <TextField
        label="Search"
        value={query}
        onChange={setQuery}
        placeholder="e.g. HDFC Flexi Cap"
        autoFocus
      />
      {hint ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {searching ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          <Label size="caption" tone="muted">
            {hint}
          </Label>
        </View>
      ) : null}
      {results.map((scheme, index) => (
        <ListRow
          key={scheme.amfiCode}
          title={scheme.schemeName}
          last={index === results.length - 1}
          onPress={() => onSelect(scheme)}
        />
      ))}
    </Card>
  );
}
