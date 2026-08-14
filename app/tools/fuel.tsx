import { useMemo, useState } from 'react';

import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl } from '../../src/components/inputs';
import { Card, KeyValueRow, Label } from '../../src/components/primitives';
import { formatMoney, formatNumber } from '../../src/lib/format/money';
import { fuelCost, fuelUnits, type FuelEfficiencyUnit } from '../../src/lib/tools/everyday';
import { useCurrency } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

type Trip = 'one_way' | 'return';

/** Each way of quoting efficiency fixes its own distance and volume units. */
const UNIT_DEFAULTS: Record<FuelEfficiencyUnit, number> = {
  km_per_l: 15,
  l_per_100km: 7,
  mpg: 35,
};

export default function FuelScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();

  const [unit, setUnit] = useState<FuelEfficiencyUnit>('km_per_l');
  const [distance, setDistance] = useState(300);
  const [efficiency, setEfficiency] = useState(UNIT_DEFAULTS.km_per_l);
  const [price, setPrice] = useState(100);
  const [trip, setTrip] = useState<Trip>('one_way');

  const units = fuelUnits(unit);
  const result = useMemo(
    () => fuelCost({ distance, efficiency, unit, pricePerVolume: price, roundTrip: trip === 'return' }),
    [distance, efficiency, unit, price, trip],
  );

  const money = (value: number) => formatMoney(value, { currency, decimals: 2 });
  const amount = (value: number) => formatNumber(value, { decimals: 2, grouping: 'western' });

  /** Switching how efficiency is quoted also switches its units, so the old figure is meaningless. */
  const changeUnit = (next: FuelEfficiencyUnit) => {
    setUnit(next);
    setEfficiency(UNIT_DEFAULTS[next]);
  };

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          Fuel for this trip
        </Label>
        <Label size="hero" weight="bold" tabular>
          {result.invalidEfficiency ? '—' : money(result.totalCost)}
        </Label>
        <Label size="micro" tone="faint">
          {result.invalidEfficiency
            ? 'Enter a fuel efficiency above zero.'
            : `${amount(result.volume)} ${units.volume} over ${amount(result.distance)} ${units.distance}.`}
        </Label>
      </Card>

      <Card title="Inputs">
        <SegmentedControl<FuelEfficiencyUnit>
          label="Efficiency is quoted in"
          segments={[
            { value: 'km_per_l', label: 'km/L' },
            { value: 'l_per_100km', label: 'L/100km' },
            { value: 'mpg', label: 'mpg' },
          ]}
          value={unit}
          onChange={changeUnit}
        />
        <NumberField
          label="One-way distance"
          value={distance}
          onChange={setDistance}
          suffix={units.distance}
          decimals={1}
          min={0}
        />
        <NumberField
          label="Fuel efficiency"
          value={efficiency}
          onChange={setEfficiency}
          suffix={unit === 'km_per_l' ? 'km/L' : unit === 'l_per_100km' ? 'L/100km' : 'mpg'}
          decimals={2}
          min={0}
        />
        <NumberField
          label={`Fuel price per ${units.volume}`}
          value={price}
          onChange={setPrice}
          prefix="currency"
          decimals={2}
          min={0}
        />
        <SegmentedControl<Trip>
          label="Trip"
          segments={[
            { value: 'one_way', label: 'One way' },
            { value: 'return', label: 'Return' },
          ]}
          value={trip}
          onChange={setTrip}
        />
      </Card>

      {result.invalidEfficiency ? null : (
        <Card title="Breakdown">
          <KeyValueRow label="Distance driven" value={`${amount(result.distance)} ${units.distance}`} />
          <KeyValueRow label="Fuel used" value={`${amount(result.volume)} ${units.volume}`} />
          <KeyValueRow
            label={`Cost per ${units.distance}`}
            value={formatMoney(result.costPerDistance, { currency, decimals: 2 })}
          />
          <KeyValueRow label="Total cost" value={money(result.totalCost)} emphasis last />
        </Card>
      )}

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        L/100km is consumption, so a lower figure is better. km/L and mpg are efficiency, where
        higher is better. Miles per gallon here is the US gallon.
      </Label>
    </Screen>
  );
}
