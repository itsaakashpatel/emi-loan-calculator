import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { RefreshControl, View } from 'react-native';

import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { ChartLegend, DonutChart } from '../../src/components/charts';
import { AuthGate } from '../../src/components/portfolio/AuthGate';
import { GainLabel } from '../../src/components/portfolio/GainLabel';
import { SyncStatus } from '../../src/components/portfolio/SyncStatus';
import { Button, Card, EmptyState, KeyValueRow, Label, ListRow } from '../../src/components/primitives';
import { formatMoney } from '../../src/lib/format/money';
import { useAuthStore } from '../../src/store/auth';
import { usePortfolioStore } from '../../src/store/portfolio';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function PortfolioTab() {
  return (
    <PortfolioScreen>
      <AuthGate>
        <PortfolioBody />
      </AuthGate>
    </PortfolioScreen>
  );
}

/** Header and pull-to-refresh sit outside the gate so both states can scroll. */
function PortfolioScreen({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const signedIn = useAuthStore((s) => s.user !== null);
  const syncing = usePortfolioStore((s) => s.syncing);
  const sync = usePortfolioStore((s) => s.sync);

  return (
    <Screen
      floatingTabBar
      refreshControl={
        signedIn ? (
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => void sync()}
            tintColor={colors.textMuted}
          />
        ) : undefined
      }
    >
      <LargeTitleHeader
        title="Portfolio"
        {...(signedIn
          ? {
              action: {
                icon: 'person-add-outline' as const,
                label: 'Add family member',
                onPress: () => router.push('/portfolio/member-form' as never),
              },
            }
          : null)}
      />
      {children}
    </Screen>
  );
}

function PortfolioBody() {
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const currency = useCurrency();

  const loading = usePortfolioStore((s) => s.loading);
  const members = usePortfolioStore((s) => s.members);
  const summary = usePortfolioStore((s) => s.summary);
  const mfHoldings = usePortfolioStore((s) => s.mfHoldings);
  const stockHoldings = usePortfolioStore((s) => s.stockHoldings);
  const hydrate = usePortfolioStore((s) => s.hydrate);
  const sync = usePortfolioStore((s) => s.sync);

  useEffect(() => {
    // Cache first so the screen paints at once, then refresh behind it.
    void hydrate().then(() => sync());
  }, [hydrate, sync]);

  const openMember = useCallback(
    (id: string) => router.push(`/portfolio/member/${id}` as never),
    [router],
  );

  if (loading) return null;

  if (members.length === 0) {
    return (
      <EmptyState
        icon="people-outline"
        title="No one added yet"
        message="Add yourself and anyone else whose investments you track. Each person keeps their own holdings."
        action={
          <Button
            label="Add a family member"
            icon="person-add-outline"
            fullWidth={false}
            onPress={() => router.push('/portfolio/member-form' as never)}
          />
        }
      />
    );
  }

  // Falls back to the cache's own totals when a sync has not landed yet, so
  // an offline launch still shows a summary rather than an empty card.
  const invested =
    summary?.total.invested ??
    [...mfHoldings, ...stockHoldings].reduce((sum, h) => sum + h.invested, 0);
  const currentValue =
    summary?.total.currentValue ??
    [...mfHoldings, ...stockHoldings].reduce((sum, h) => sum + h.currentValue, 0);
  const gain = currentValue - invested;
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0;

  const mfValue =
    summary?.byAssetType.mutualFunds.currentValue ??
    mfHoldings.reduce((sum, h) => sum + h.currentValue, 0);
  const stockValue =
    summary?.byAssetType.stocks.currentValue ??
    stockHoldings.reduce((sum, h) => sum + h.currentValue, 0);

  const slices = [
    { label: 'Mutual funds', value: mfValue, color: colors.principal },
    { label: 'Stocks', value: stockValue, color: colors.interest },
  ].filter((slice) => slice.value > 0);

  return (
    <>
      <Card>
        <Label size="caption" tone="muted">
          Current value
        </Label>
        <Label size="hero" weight="bold" tabular>
          {formatMoney(currentValue, { currency })}
        </Label>
        <View style={{ height: spacing.xs }} />
        <GainLabel gain={gain} gainPct={gainPct} size="subhead" currency={currency} />
        <View style={{ height: spacing.md }} />
        <KeyValueRow label="Invested" value={formatMoney(invested, { currency })} last />
      </Card>

      <SyncStatus />

      {slices.length > 1 ? (
        <Card title="Allocation">
          <View style={{ alignItems: 'center' }}>
            <DonutChart slices={slices} centerLabel="Total" centerValue={formatMoney(currentValue, { currency })} />
          </View>
          <View style={{ height: spacing.md }} />
          <ChartLegend
            items={slices.map((slice) => ({
              label: slice.label,
              color: slice.color,
              value: formatMoney(slice.value, { currency }),
            }))}
          />
        </Card>
      ) : null}

      <Card title="Family" padded={false}>
        {members.map((member, index) => {
          const owned = [
            ...mfHoldings.filter((h) => h.memberId === member.id),
            ...stockHoldings.filter((h) => h.memberId === member.id),
          ];
          const value = owned.reduce((sum, h) => sum + h.currentValue, 0);
          const cost = owned.reduce((sum, h) => sum + h.invested, 0);

          return (
            <ListRow
              key={member.id}
              title={member.name}
              subtitle={
                owned.length === 0
                  ? 'No holdings yet'
                  : `${owned.length} holding${owned.length === 1 ? '' : 's'}`
              }
              icon="person-outline"
              onPress={() => openMember(member.id)}
              last={index === members.length - 1}
              right={
                owned.length > 0 ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Label size="body" weight="medium" tabular>
                      {formatMoney(value, { currency })}
                    </Label>
                    <GainLabel gain={value - cost} size="micro" currency={currency} />
                  </View>
                ) : undefined
              }
            />
          );
        })}
      </Card>
    </>
  );
}
