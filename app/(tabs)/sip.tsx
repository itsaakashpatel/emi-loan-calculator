import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { TileGrid, type TileSpec } from '../../src/components/Tile';

const TILES: readonly TileSpec[] = [
  { href: '/invest/sip', icon: 'trending-up-outline', label: 'SIP\nCalculator' },
  { href: '/invest/swp', icon: 'cash-outline', label: 'SWP\nCalculator', hint: 'Systematic withdrawal plan' },
  { href: '/invest/stp', icon: 'swap-horizontal-outline', label: 'STP\nCalculator', hint: 'Systematic transfer plan' },
  { href: '/invest/lumpsum', icon: 'pie-chart-outline', label: 'Lumpsum\nCalculator' },
  { href: '/invest/sip_inflation', icon: 'pulse-outline', label: 'SIP With\nInflation' },
];

export default function SipTab() {
  return (
    <Screen floatingTabBar>
      <LargeTitleHeader
        title="SIP Calculator"
        action={{ icon: 'time-outline', label: 'SIP history', href: '/history?kind=invest' }}
      />
      <TileGrid tiles={TILES} />
    </Screen>
  );
}
