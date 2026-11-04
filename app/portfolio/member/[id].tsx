import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, View } from 'react-native';

import { Screen } from '../../../src/components/Screen';
import { useHeaderAction } from '../../../src/components/Header';
import { GainLabel } from '../../../src/components/portfolio/GainLabel';
import {
  Button,
  Card,
  EmptyState,
  KeyValueRow,
  Label,
  ListRow,
} from '../../../src/components/primitives';
import type { MfHolding, StockHolding } from '../../../src/lib/api/types';
import { formatDate } from '../../../src/lib/format/date';
import { formatMoney, formatNumber } from '../../../src/lib/format/money';
import { usePortfolioStore } from '../../../src/store/portfolio';
import { useCurrency } from '../../../src/store/settings';
import { useTheme } from '../../../src/theme/ThemeProvider';

export default function MemberDetailScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const currency = useCurrency();
  const { id } = useLocalSearchParams<{ id: string }>();

  const member = usePortfolioStore((s) => s.memberById(id));
  const mfHoldings = usePortfolioStore((s) => s.mfHoldings);
  const stockHoldings = usePortfolioStore((s) => s.stockHoldings);
  const removeMember = usePortfolioStore((s) => s.removeMember);
  const removeMfHolding = usePortfolioStore((s) => s.removeMfHolding);
  const removeStockHolding = usePortfolioStore((s) => s.removeStockHolding);

  const mf = mfHoldings.filter((holding) => holding.memberId === id);
  const stocks = stockHoldings.filter((holding) => holding.memberId === id);

  useHeaderAction({
    icon: 'ellipsis-horizontal',
    label: 'Member options',
    enabled: member !== undefined,
    onPress: () => {
      Alert.alert(member?.name ?? 'Member', undefined, [
        { text: 'Edit details', onPress: () => router.push(`/portfolio/member-form?id=${id}` as never) },
        {
          text: 'Delete member',
          style: 'destructive',
          onPress: () => confirmDeleteMember(),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
  });

  const confirmDeleteMember = () => {
    const count = mf.length + stocks.length;
    Alert.alert(
      `Delete ${member?.name ?? 'this member'}?`,
      count === 0
        ? 'This cannot be undone.'
        : `Their ${count} holding${count === 1 ? '' : 's'} will be deleted too. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void removeMember(id)
              .then(() => router.back())
              .catch((error: unknown) =>
                Alert.alert(
                  'Could not delete',
                  error instanceof Error ? error.message : 'Please try again.',
                ),
              );
          },
        },
      ],
    );
  };

  const confirmDeleteHolding = (name: string, remove: () => Promise<void>) => {
    Alert.alert(`Remove ${name}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void remove().catch((error: unknown) =>
            Alert.alert(
              'Could not remove',
              error instanceof Error ? error.message : 'Please try again.',
            ),
          );
        },
      },
    ]);
  };

  // The member was deleted, or this screen was opened before a sync landed.
  if (!member) {
    return (
      <Screen>
        <EmptyState
          icon="person-outline"
          title="Member not found"
          message="They may have been deleted on another device."
        />
      </Screen>
    );
  }

  const owned = [...mf, ...stocks];
  const invested = owned.reduce((sum, holding) => sum + holding.invested, 0);
  const currentValue = owned.reduce((sum, holding) => sum + holding.currentValue, 0);
  const gain = currentValue - invested;

  return (
    <Screen
      footer={
        <Button
          label="Add a holding"
          icon="add"
          onPress={() => router.push(`/portfolio/holding-form?memberId=${id}` as never)}
        />
      }
    >
      <Card>
        <Label size="caption" tone="muted">
          {member.name}
        </Label>
        <Label size="display" weight="bold" tabular>
          {formatMoney(currentValue, { currency })}
        </Label>
        <View style={{ height: spacing.xs }} />
        <GainLabel
          gain={gain}
          gainPct={invested > 0 ? (gain / invested) * 100 : 0}
          currency={currency}
        />
        <View style={{ height: spacing.md }} />
        <KeyValueRow label="Invested" value={formatMoney(invested, { currency })} last />
      </Card>

      {owned.length === 0 ? (
        <EmptyState
          icon="trending-up-outline"
          title="No holdings yet"
          message="Add a mutual fund or a stock, or import a statement to load them all at once."
          action={
            <Button
              label="Import a statement"
              icon="document-text-outline"
              fullWidth={false}
              onPress={() => router.push(`/portfolio/cas-upload?memberId=${id}` as never)}
            />
          }
        />
      ) : null}

      {mf.length > 0 ? (
        <Card title="Mutual funds" padded={false}>
          {mf.map((holding, index) => (
            <MfRow
              key={holding.id}
              holding={holding}
              currency={currency}
              last={index === mf.length - 1}
              onPress={() =>
                router.push(`/portfolio/holding-form?memberId=${id}&mfId=${holding.id}` as never)
              }
              onLongPress={() =>
                confirmDeleteHolding(holding.schemeName, () => removeMfHolding(holding.id))
              }
            />
          ))}
        </Card>
      ) : null}

      {stocks.length > 0 ? (
        <Card title="Stocks" padded={false}>
          {stocks.map((holding, index) => (
            <StockRow
              key={holding.id}
              holding={holding}
              currency={currency}
              last={index === stocks.length - 1}
              onPress={() =>
                router.push(`/portfolio/holding-form?memberId=${id}&stockId=${holding.id}` as never)
              }
              onLongPress={() =>
                confirmDeleteHolding(holding.stockName, () => removeStockHolding(holding.id))
              }
            />
          ))}
        </Card>
      ) : null}

      {owned.length > 0 ? (
        <Button
          label="Import a statement"
          icon="document-text-outline"
          variant="ghost"
          onPress={() => router.push(`/portfolio/cas-upload?memberId=${id}` as never)}
        />
      ) : null}
    </Screen>
  );
}

function MfRow({
  holding,
  currency,
  last,
  onPress,
  onLongPress,
}: {
  holding: MfHolding;
  currency: string;
  last: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <HoldingRow
      title={holding.schemeName}
      subtitle={`${formatNumber(holding.units, { decimals: 3, trim: true })} units${
        holding.navDate ? ` · NAV ${formatDate(holding.navDate)}` : ''
      }`}
      value={formatMoney(holding.currentValue, { currency })}
      gain={holding.gain}
      currency={currency}
      last={last}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}

function StockRow({
  holding,
  currency,
  last,
  onPress,
  onLongPress,
}: {
  holding: StockHolding;
  currency: string;
  last: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <HoldingRow
      title={holding.stockName}
      subtitle={`${formatNumber(holding.quantity, { decimals: 2, trim: true })} × ${
        holding.currentPrice === null
          ? 'no price yet'
          : formatMoney(holding.currentPrice, { currency, decimals: 2 })
      }`}
      value={formatMoney(holding.currentValue, { currency })}
      gain={holding.gain}
      currency={currency}
      last={last}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}

function HoldingRow({
  title,
  subtitle,
  value,
  gain,
  currency,
  last,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle: string;
  value: string;
  gain: number;
  currency: string;
  last: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      last={last}
      onPress={onPress}
      onLongPress={onLongPress}
      right={
        <View style={{ alignItems: 'flex-end' }}>
          <Label size="body" weight="medium" tabular>
            {value}
          </Label>
          <GainLabel gain={gain} size="micro" currency={currency} />
        </View>
      }
    />
  );
}
