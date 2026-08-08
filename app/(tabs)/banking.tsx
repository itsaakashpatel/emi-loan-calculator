import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { TileGrid, type TileSpec } from '../../src/components/Tile';

const TILES: readonly TileSpec[] = [
  { href: '/invest/fd', icon: 'lock-closed-outline', label: 'FD\nCalculator', hint: 'Fixed deposit calculator' },
  { href: '/invest/rd', icon: 'repeat-outline', label: 'RD\nCalculator', hint: 'Recurring deposit calculator' },
  { href: '/invest/ppf', icon: 'shield-checkmark-outline', label: 'PPF\nCalculator' },
  { href: '/invest/simple', icon: 'remove-circle-outline', label: 'Simple\nInterest' },
  { href: '/invest/compound', icon: 'infinite-outline', label: 'Compound\nInterest' },
  { href: '/invest/inflation', icon: 'trending-up-outline', label: 'Inflation\nImpact' },
];

export default function BankingTab() {
  return (
    <Screen floatingTabBar>
      <LargeTitleHeader title="Banking" />
      <TileGrid tiles={TILES} />
    </Screen>
  );
}
