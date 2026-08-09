import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { TileGrid, type TileSpec } from '../../src/components/Tile';

/**
 * Home: the loan calculators, as a grid of tiles. History lives in the top-right circular button
 * rather than taking a tile.
 */
const TILES: readonly TileSpec[] = [
  { href: '/loan/emi', icon: 'calculator-outline', label: 'EMI\nCalculator' },
  { href: '/loan/quick', icon: 'flash-outline', label: 'Quick\nCalculator', hint: 'Quick EMI calculator' },
  {
    href: '/emi/advanced?tab=advance_emi',
    icon: 'add-circle-outline',
    label: 'Advance EMI\nCalculator',
  },
  { href: '/loans', icon: 'wallet-outline', label: 'Loan\nProfile', hint: 'Your saved loans' },
  { href: '/compare', icon: 'git-compare-outline', label: 'Compare\nLoans' },
  {
    href: '/emi/advanced?tab=part_payment',
    icon: 'cash-outline',
    label: 'Pre Payment\n/ ROI Change',
  },
  {
    href: '/emi/advanced?tab=moratorium',
    icon: 'pause-circle-outline',
    label: 'Moratorium\nCalculator',
  },
  { href: '/tools/eligibility', icon: 'document-text-outline', label: 'Loan Eligible\nCalculator' },
  { href: '/loan/affordability', icon: 'home-outline', label: 'Loan\nAffordability' },
  { href: '/loan/refinance', icon: 'sync-outline', label: 'Loan\nRefinance' },
  { href: '/emi/schedule', icon: 'list-outline', label: 'Amortisation\nSchedule' },
];

export default function HomeTab() {
  return (
    <Screen floatingTabBar>
      <LargeTitleHeader
        title="EMI Calculator"
        action={{ icon: 'time-outline', label: 'Calculation history', href: '/history' }}
      />
      <TileGrid tiles={TILES} />
    </Screen>
  );
}
