import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { TileGrid, type TileSpec } from '../../src/components/Tile';

const TILES: readonly TileSpec[] = [
  { href: '/tools/gst', icon: 'receipt-outline', label: 'GST\nCalculator' },
  { href: '/tools/currency', icon: 'globe-outline', label: 'Currency\nConverter' },
  { href: '/tools/percentage', icon: 'pie-chart-outline', label: 'Percentage\nCalculator' },
  {
    href: '/tools/discount',
    icon: 'pricetag-outline',
    label: 'Discount\nCalculator',
    hint: 'Sale price and savings',
  },
  {
    href: '/tools/tip',
    icon: 'restaurant-outline',
    label: 'Tip &\nSplit',
    hint: 'Tip and split a bill',
  },
  {
    href: '/tools/fuel',
    icon: 'car-outline',
    label: 'Fuel\nCost',
    hint: 'Fuel cost for a trip',
  },
  {
    href: '/tools/date-diff',
    icon: 'calendar-outline',
    label: 'Date\nDifference',
    hint: 'Days between two dates',
  },
  { href: '/tools/age', icon: 'person-outline', label: 'Age\nCalculator' },
];

export default function OtherTab() {
  return (
    <Screen floatingTabBar>
      <LargeTitleHeader title="Other" />
      <TileGrid tiles={TILES} />
    </Screen>
  );
}
