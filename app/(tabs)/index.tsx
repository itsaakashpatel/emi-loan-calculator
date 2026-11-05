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
    icon: 'play-skip-forward-outline',
    label: 'Advance EMI\nCalculator',
  },
  { href: '/loans', icon: 'wallet-outline', label: 'Loan\nProfile', hint: 'Your saved loans' },
  { href: '/compare', icon: 'git-compare-outline', label: 'Compare\nLoans' },
  {
    href: '/loan/revise',
    icon: 'cash-outline',
    label: 'Pre Payment\n/ ROI Change',
    hint: 'Revised EMI and tenure after a lump sum or a rate change',
  },
  {
    href: '/emi/advanced?tab=moratorium',
    icon: 'pause-circle-outline',
    label: 'Moratorium\nCalculator',
  },
  { href: '/tools/eligibility', icon: 'clipboard-outline', label: 'Loan Eligible\nCalculator' },
  { href: '/loan/affordability', icon: 'speedometer-outline', label: 'Loan\nAffordability' },
  { href: '/loan/refinance', icon: 'sync-outline', label: 'Loan\nRefinance' },
  { href: '/emi/schedule', icon: 'list-outline', label: 'Amortisation\nSchedule' },
  {
    href: '/loan/tax',
    icon: 'receipt-outline',
    label: 'Home Loan\nTax Benefit',
    hint: 'Tax saved under Section 80C and 24(b)',
  },
  {
    href: '/loan/step-up',
    icon: 'trending-up-outline',
    label: 'Step-up\nEMI',
    hint: 'Raise the EMI each year and close the loan early',
  },
  {
    href: '/loan/card-emi',
    icon: 'card-outline',
    label: 'Credit Card\n/ No-cost EMI',
    hint: 'True cost of a card EMI or a no-cost EMI',
  },
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
