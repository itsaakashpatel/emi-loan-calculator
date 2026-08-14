import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { TileGrid, type TileSpec } from '../../src/components/Tile';

const TILES: readonly TileSpec[] = [
  { href: '/tools/gst', icon: 'receipt-outline', label: 'GST\nCalculator' },
  { href: '/tools/currency', icon: 'globe-outline', label: 'Currency\nConverter' },
];

export default function OtherTab() {
  return (
    <Screen floatingTabBar>
      <LargeTitleHeader title="Other" />
      <TileGrid tiles={TILES} />
    </Screen>
  );
}
