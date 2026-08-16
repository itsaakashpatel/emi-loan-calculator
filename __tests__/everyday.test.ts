import {
  applyDiscount,
  calculateAge,
  calculatePercent,
  calendarSpan,
  dateSpan,
  discountFromPrices,
  fuelCost,
  fuelUnits,
  splitBill,
} from '../src/lib/tools/everyday';

describe('calendarSpan', () => {
  it('counts whole years, months and days', () => {
    expect(calendarSpan('2020-01-15', '2023-04-20')).toEqual({ years: 3, months: 3, days: 5 });
  });

  it('borrows days from the month before the later date', () => {
    // 31 Jan to 1 Mar reads as "1 month 1 day" — the borrow takes February's length.
    expect(calendarSpan('2021-01-31', '2021-03-01')).toEqual({ years: 0, months: 1, days: 1 });
  });

  it('borrows across a leap February', () => {
    expect(calendarSpan('2020-01-31', '2020-03-01')).toEqual({ years: 0, months: 1, days: 1 });
  });

  it('borrows a month across a year boundary', () => {
    expect(calendarSpan('2020-12-31', '2021-01-01')).toEqual({ years: 0, months: 0, days: 1 });
  });

  it('is symmetric in its arguments', () => {
    expect(calendarSpan('2023-04-20', '2020-01-15')).toEqual(calendarSpan('2020-01-15', '2023-04-20'));
  });

  it('returns zero for the same date', () => {
    expect(calendarSpan('2024-06-01', '2024-06-01')).toEqual({ years: 0, months: 0, days: 0 });
  });
});

describe('dateSpan', () => {
  it('reports total days, weeks and direction for a future date', () => {
    const result = dateSpan('2024-01-01', '2024-01-31');
    expect(result.totalDays).toBe(30);
    expect(result.totalWeeks).toBe(4);
    expect(result.remainderDays).toBe(2);
    expect(result.direction).toBe('future');
  });

  it('reports a past direction but keeps totalDays positive', () => {
    const result = dateSpan('2024-01-31', '2024-01-01');
    expect(result.totalDays).toBe(30);
    expect(result.direction).toBe('past');
  });

  it('marks an identical pair as the same day', () => {
    expect(dateSpan('2024-03-03', '2024-03-03').direction).toBe('same');
  });

  it('counts the leap day in a leap year', () => {
    expect(dateSpan('2024-02-28', '2024-03-01').totalDays).toBe(2);
    expect(dateSpan('2023-02-28', '2023-03-01').totalDays).toBe(1);
  });

  it('reports whole calendar months', () => {
    expect(dateSpan('2020-01-15', '2023-04-20').totalMonths).toBe(39);
  });
});

describe('calculateAge', () => {
  it('gives the age and the countdown to the next birthday', () => {
    const result = calculateAge('1990-06-15', '2024-08-13');
    expect(result.years).toBe(34);
    expect(result.months).toBe(1);
    expect(result.days).toBe(29);
    expect(result.nextBirthday).toBe('2025-06-15');
    expect(result.unborn).toBe(false);
  });

  it('uses this year when the birthday is still ahead', () => {
    const result = calculateAge('1990-11-02', '2024-08-13');
    expect(result.nextBirthday).toBe('2024-11-02');
    expect(result.daysToNextBirthday).toBe(81);
  });

  it('treats today as the birthday, not a year away', () => {
    const result = calculateAge('1990-08-13', '2024-08-13');
    expect(result.years).toBe(34);
    expect(result.daysToNextBirthday).toBe(0);
    expect(result.nextBirthday).toBe('2024-08-13');
  });

  it('observes a 29 February birthday on the 28th in a common year', () => {
    expect(calculateAge('2000-02-29', '2025-01-01').nextBirthday).toBe('2025-02-28');
    expect(calculateAge('2000-02-29', '2024-01-01').nextBirthday).toBe('2024-02-29');
  });

  it('flags a birth date in the future', () => {
    const result = calculateAge('2030-01-01', '2024-08-13');
    expect(result.unborn).toBe(true);
    expect(result.years).toBe(0);
  });
});

describe('applyDiscount', () => {
  it('takes a single discount off the list price', () => {
    const result = applyDiscount(2000, 25);
    expect(result.savings).toBeCloseTo(500, 6);
    expect(result.finalPrice).toBeCloseTo(1500, 6);
    expect(result.effectivePct).toBeCloseTo(25, 6);
  });

  it('compounds a second discount on the reduced price, not the list price', () => {
    // 50% then a further 10% is 55% off in total, not 60%.
    const result = applyDiscount(1000, 50, 10);
    expect(result.finalPrice).toBeCloseTo(450, 6);
    expect(result.effectivePct).toBeCloseTo(55, 6);
  });

  it('clamps percentages into 0-100', () => {
    expect(applyDiscount(100, 140).finalPrice).toBeCloseTo(0, 6);
    expect(applyDiscount(100, -20).finalPrice).toBeCloseTo(100, 6);
  });

  it('handles a zero list price without dividing by zero', () => {
    expect(applyDiscount(0, 30).effectivePct).toBe(0);
  });
});

describe('discountFromPrices', () => {
  it('derives the percentage actually taken off', () => {
    expect(discountFromPrices(2500, 1875)).toBeCloseTo(25, 6);
  });

  it('returns zero when there is no list price to compare against', () => {
    expect(discountFromPrices(0, 100)).toBe(0);
  });
});

describe('calculatePercent', () => {
  it('answers "what is A% of B"', () => {
    expect(calculatePercent('of', 15, 200).value).toBeCloseTo(30, 6);
  });

  it('answers "A is what percent of B"', () => {
    expect(calculatePercent('is_what', 30, 200).value).toBeCloseTo(15, 6);
  });

  it('answers "percentage change from A to B"', () => {
    expect(calculatePercent('change', 200, 250).value).toBeCloseTo(25, 6);
    expect(calculatePercent('change', 200, 150).value).toBeCloseTo(-25, 6);
  });

  it('measures change against the magnitude of the starting value', () => {
    expect(calculatePercent('change', -200, -100).value).toBeCloseTo(50, 6);
  });

  it('flags the answers that are not defined', () => {
    expect(calculatePercent('is_what', 5, 0).undefinedResult).toBe(true);
    expect(calculatePercent('change', 0, 5).undefinedResult).toBe(true);
    expect(calculatePercent('of', 5, 0).undefinedResult).toBe(false);
  });
});

describe('splitBill', () => {
  it('splits a bill and its tip evenly', () => {
    const result = splitBill(1000, 10, 4);
    expect(result.tip).toBeCloseTo(100, 6);
    expect(result.total).toBeCloseTo(1100, 6);
    expect(result.perPerson).toBeCloseTo(275, 6);
    expect(result.roundingAdded).toBeCloseTo(0, 6);
  });

  it('rounds each share up and puts the extra into the tip', () => {
    const result = splitBill(1000, 10, 3);
    const rounded = splitBill(1000, 10, 3, true);
    expect(result.perPerson).toBeCloseTo(366.666, 2);
    expect(rounded.perPerson).toBe(367);
    expect(rounded.total).toBe(1101);
    expect(rounded.roundingAdded).toBeCloseTo(1, 6);
    expect(rounded.tip).toBeCloseTo(101, 6);
  });

  it('treats fewer than one diner as one', () => {
    expect(splitBill(500, 0, 0).perPerson).toBeCloseTo(500, 6);
  });

  it('ignores a negative bill or tip', () => {
    expect(splitBill(-100, -10, 2).total).toBe(0);
  });
});

describe('fuelUnits', () => {
  it('pairs miles per gallon with miles and gallons', () => {
    expect(fuelUnits('mpg')).toEqual({ distance: 'mi', volume: 'gal' });
    expect(fuelUnits('km_per_l')).toEqual({ distance: 'km', volume: 'L' });
    expect(fuelUnits('l_per_100km')).toEqual({ distance: 'km', volume: 'L' });
  });
});

describe('fuelCost', () => {
  it('computes cost from kilometres per litre', () => {
    const result = fuelCost({ distance: 300, efficiency: 15, unit: 'km_per_l', pricePerVolume: 100 });
    expect(result.volume).toBeCloseTo(20, 6);
    expect(result.totalCost).toBeCloseTo(2000, 6);
    expect(result.costPerDistance).toBeCloseTo(6.6667, 3);
  });

  it('treats litres per 100 km as consumption, so it multiplies', () => {
    const result = fuelCost({ distance: 300, efficiency: 8, unit: 'l_per_100km', pricePerVolume: 100 });
    expect(result.volume).toBeCloseTo(24, 6);
    expect(result.totalCost).toBeCloseTo(2400, 6);
  });

  it('computes cost from miles per gallon', () => {
    const result = fuelCost({ distance: 240, efficiency: 30, unit: 'mpg', pricePerVolume: 4 });
    expect(result.volume).toBeCloseTo(8, 6);
    expect(result.totalCost).toBeCloseTo(32, 6);
    expect(result.units).toEqual({ distance: 'mi', volume: 'gal' });
  });

  it('doubles the distance for a return trip', () => {
    const one = fuelCost({ distance: 100, efficiency: 10, unit: 'km_per_l', pricePerVolume: 50 });
    const both = fuelCost({ distance: 100, efficiency: 10, unit: 'km_per_l', pricePerVolume: 50, roundTrip: true });
    expect(both.distance).toBe(200);
    expect(both.totalCost).toBeCloseTo(one.totalCost * 2, 6);
    // Cost per kilometre is a rate, so a return trip does not change it.
    expect(both.costPerDistance).toBeCloseTo(one.costPerDistance, 6);
  });

  it('flags a zero efficiency instead of dividing by it', () => {
    const result = fuelCost({ distance: 100, efficiency: 0, unit: 'km_per_l', pricePerVolume: 50 });
    expect(result.invalidEfficiency).toBe(true);
    expect(result.totalCost).toBe(0);
  });

  it('reports no cost for a zero distance', () => {
    const result = fuelCost({ distance: 0, efficiency: 15, unit: 'km_per_l', pricePerVolume: 100 });
    expect(result.totalCost).toBeCloseTo(0, 6);
    expect(result.costPerDistance).toBe(0);
  });
});
