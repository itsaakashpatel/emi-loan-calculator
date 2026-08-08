/**
 * STP (systematic transfer plan) simulation and general inflation maths: future cost / purchasing
 * power of a sum of money, and restating a nominal future value (eg. a SIP corpus) in today's
 * money. Pure functions, no RN imports, so they unit test directly.
 */

export interface StpInput {
  /** Lump sum sitting in the source fund at the start. */
  totalInvestment: number;
  /** Fixed amount swept from the source fund into the target fund every month. */
  monthlyTransfer: number;
  /** Expected annual return of the source fund (typically debt/liquid), percent. */
  sourceRate: number;
  /** Expected annual return of the target fund (typically equity), percent. */
  targetRate: number;
  years: number;
  months?: number;
}

export interface StpYearRow {
  year: number;
  /** Cumulative amount transferred out of the source by the end of this year. */
  transferred: number;
  sourceValue: number;
  targetValue: number;
  totalValue: number;
}

export interface StpResult {
  corpus: number;
  totalTransferred: number;
  sourceValue: number;
  targetValue: number;
  totalValue: number;
  /** `totalValue - corpus`. */
  gain: number;
  /** How many months transfers actually ran for — below the requested term if the source ran dry. */
  monthsLasted: number;
  /** True when the source fund hit zero before the plan's requested duration finished. */
  exhausted: boolean;
  rows: StpYearRow[];
}

const STP_MAX_MONTHS = 1200;

/**
 * Month-by-month STP: each month the source fund grows for the month, then a fixed amount is
 * swept out (capped at whatever remains, so the source never goes negative); the target fund
 * grows for the month, then receives that transfer. Stops early if the source is exhausted.
 */
export function calculateStp(input: StpInput): StpResult {
  const corpus = Math.max(0, input.totalInvestment);
  const transferAmount = Math.max(0, input.monthlyTransfer);
  const months = Math.max(1, Math.min(Math.round(input.years * 12 + (input.months ?? 0)), STP_MAX_MONTHS));
  const iSource = input.sourceRate / 1200;
  const iTarget = input.targetRate / 1200;

  let source = corpus;
  let target = 0;
  let totalTransferred = 0;
  const rows: StpYearRow[] = [];
  let month = 0;

  while (month < months && source > 0) {
    month += 1;
    source *= 1 + iSource;
    const transfer = Math.min(transferAmount, source);
    source -= transfer;
    target = target * (1 + iTarget) + transfer;
    totalTransferred += transfer;

    if (month % 12 === 0 || month === months || source <= 0) {
      rows.push({
        year: Math.ceil(month / 12),
        transferred: totalTransferred,
        sourceValue: source,
        targetValue: target,
        totalValue: source + target,
      });
    }
  }

  const monthsLasted = month;
  const totalValue = source + target;
  return {
    corpus,
    totalTransferred,
    sourceValue: source,
    targetValue: target,
    totalValue,
    gain: totalValue - corpus,
    monthsLasted,
    exhausted: source <= 0 && monthsLasted < months,
    rows,
  };
}

export interface InflationInput {
  amount: number;
  /** Annual inflation rate, percent. */
  inflationRate: number;
  years: number;
}

export interface InflationYearRow {
  year: number;
  futureCost: number;
  purchasingPower: number;
}

export interface InflationResult {
  amount: number;
  years: number;
  /** What today's `amount` worth of expenses will cost after `years`: `amount·(1+i)^years`. */
  futureCost: number;
  /** What `amount` held in cash will be worth after `years`, in today's money: `amount/(1+i)^years`. */
  purchasingPower: number;
  /** Percentage of today's value eroded from cash held for `years`. */
  valueLostPct: number;
  /** Percentage increase in the cost of the same basket of expenses. */
  costIncreasePct: number;
  rows: InflationYearRow[];
}

/** Both directions of inflation: the rising cost of things, and the shrinking power of cash. */
export function calculateInflationImpact(input: InflationInput): InflationResult {
  const amount = Math.max(0, input.amount);
  const years = Math.max(1, Math.round(input.years));
  const i = input.inflationRate / 100;
  const factorAt = (y: number) => Math.pow(1 + i, y);
  const costAt = (y: number) => amount * factorAt(y);
  const powerAt = (y: number) => amount / factorAt(y);

  const rows: InflationYearRow[] = [];
  for (let year = 1; year <= years; year += 1) {
    rows.push({ year, futureCost: costAt(year), purchasingPower: powerAt(year) });
  }

  const futureCost = costAt(years);
  const purchasingPower = powerAt(years);
  return {
    amount,
    years,
    futureCost,
    purchasingPower,
    valueLostPct: amount > 0 ? ((amount - purchasingPower) / amount) * 100 : 0,
    costIncreasePct: amount > 0 ? ((futureCost - amount) / amount) * 100 : 0,
    rows,
  };
}

export interface RealValueInput {
  /** A nominal future value, eg. the maturity/future value from a SIP or lumpsum calculation. */
  nominalValue: number;
  /** Annual inflation rate, percent. */
  inflationRate: number;
  years: number;
}

export interface RealValueResult {
  nominal: number;
  /** `nominal / (1 + inflationRate/100)^years` — the nominal value restated in today's money. */
  real: number;
  /** `nominal - real`, the purchasing power given up to inflation, in absolute terms. */
  purchasingPowerLost: number;
  /** The same, as a percentage of the nominal value. */
  purchasingPowerLostPct: number;
}

/** Discounts a nominal future value back to today's purchasing power. */
export function calculateRealValue(input: RealValueInput): RealValueResult {
  const nominal = Math.max(0, input.nominalValue);
  const years = Math.max(0, input.years);
  const i = input.inflationRate / 100;
  const real = nominal / Math.pow(1 + i, years);
  const purchasingPowerLost = nominal - real;
  return {
    nominal,
    real,
    purchasingPowerLost,
    purchasingPowerLostPct: nominal > 0 ? (purchasingPowerLost / nominal) * 100 : 0,
  };
}

/**
 * Fisher-style real rate of return: `((1 + nominal)/(1 + inflation)) - 1`, both given and returned
 * as percentages. This is the annualised rate at which purchasing power actually grows — below the
 * nominal rate whenever inflation is positive, and equal to it when inflation is 0.
 */
export function realRateOfReturn(nominalRatePct: number, inflationRatePct: number): number {
  const r = nominalRatePct / 100;
  const i = inflationRatePct / 100;
  return ((1 + r) / (1 + i) - 1) * 100;
}
