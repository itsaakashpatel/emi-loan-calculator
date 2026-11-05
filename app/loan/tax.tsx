import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DataTable } from '../../src/components/DataTable';
import { useHeaderAction } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { DateField, RowField, SegmentedControl, TenureField } from '../../src/components/inputs';
import { Card, KeyValueRow, Label, SelectChipRow } from '../../src/components/primitives';
import { amortize } from '../../src/lib/finance/emi';
import {
  NEW_REGIME_SLABS,
  OLD_REGIME_SLABS,
  SECTION_24B_SELF_CAP,
  SECTION_80C_CAP,
  calculateTaxBenefit,
  currentTaxYear,
  financialYearLabel,
  financialYearOf,
  type Occupancy,
  type TaxRegime,
} from '../../src/lib/finance/tax';
import { todayISO } from '../../src/lib/format/date';
import { currencyTag, formatMoney, formatNumber } from '../../src/lib/format/money';
import { sharePdf } from '../../src/pdf/share';
import { taxBenefitHtml } from '../../src/pdf/templates';
import { useLoansStore } from '../../src/store/loans';
import { useCurrency, useSettingsStore } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

type HomeStatus = 'ready' | 'under_construction';

/**
 * Home loan tax benefit, by financial year. Opened from a saved loan it uses that loan's real
 * schedule, part payments included; opened from Home it takes its own loan inputs.
 */
export default function TaxBenefitScreen() {
  const { spacing } = useTheme();
  const currency = useCurrency();
  const defaultRate = useSettingsStore((s) => s.defaultRate);
  const { loanId } = useLocalSearchParams<{ loanId?: string }>();
  const saved = useLoansStore((s) => (loanId ? s.byId(Number(loanId)) : undefined));

  const [principal, setPrincipal] = useState(5_000_000);
  const [rate, setRate] = useState(defaultRate || 8.5);
  const [months, setMonths] = useState(240);
  const [startDate, setStartDate] = useState(todayISO());

  const [regime, setRegime] = useState<TaxRegime>('old');
  const [occupancy, setOccupancy] = useState<Occupancy>('self');
  const [slab, setSlab] = useState(30);
  const [sharePct, setSharePct] = useState(100);
  const [other80C, setOther80C] = useState(0);
  const [annualRent, setAnnualRent] = useState(0);
  const [status, setStatus] = useState<HomeStatus>('ready');
  const [possessionDate, setPossessionDate] = useState(todayISO());

  const slabs = regime === 'old' ? OLD_REGIME_SLABS : NEW_REGIME_SLABS;
  // A slab that the other regime does not have falls back to the top one.
  const slabPct = slabs.includes(slab) ? slab : slabs[slabs.length - 1]!;

  const schedule = useMemo(() => {
    if (saved) return saved.result.schedule;
    return amortize({ principal, annualRate: rate, tenureMonths: Math.max(1, months), startDate }).schedule;
  }, [saved, principal, rate, months, startDate]);

  const result = useMemo(
    () =>
      calculateTaxBenefit({
        schedule,
        regime,
        occupancy,
        slabPct,
        sharePct,
        other80C,
        annualRent,
        possessionDate: status === 'under_construction' ? possessionDate : undefined,
      }),
    [schedule, regime, occupancy, slabPct, sharePct, other80C, annualRent, status, possessionDate],
  );

  const today = todayISO();
  const thisYear = currentTaxYear(result, today);
  const thisYearLabel = financialYearLabel(financialYearOf(today));
  const money = (value: number) => formatMoney(value, { currency });
  const num = (value: number) => formatNumber(value, { grouping: 'indian' });

  const basis = [
    regime === 'old' ? 'Old regime' : 'New regime',
    occupancy === 'self' ? 'Self-occupied' : 'Let out',
    `${slabPct}% slab`,
    sharePct < 100 ? `${sharePct}% share` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  useHeaderAction({
    icon: 'share-outline',
    label: 'Export as PDF',
    onPress: () =>
      void sharePdf(
        taxBenefitHtml({ name: saved?.loan.name ?? 'Home loan', basis, result }),
        'home-loan-tax-benefit',
      ),
  });

  const nothingToClaim = result.totalTaxSaved === 0;

  return (
    <Screen>
      <Card>
        <Label size="caption" tone="muted">
          {thisYear ? `Tax you save in ${thisYearLabel}` : 'Tax you save over the loan'}
        </Label>
        <Label size="hero" weight="bold" tabular tone={nothingToClaim ? 'muted' : 'positive'}>
          {money(thisYear ? thisYear.taxSaved : result.totalTaxSaved)}
        </Label>
        <Label size="micro" tone="faint">
          {thisYear ? `${money(result.totalTaxSaved)} over the whole loan. ${basis}.` : `${basis}.`}
        </Label>
      </Card>

      {saved ? (
        <Card title="Loan">
          <KeyValueRow label={saved.loan.name} value={money(saved.loan.principal)} />
          <Label size="micro" tone="faint" style={{ marginTop: spacing.sm }}>
            Uses the schedule of this saved loan, with its part payments and rate changes.
          </Label>
        </Card>
      ) : (
        <Card title="Loan">
          <RowField label="Loan Amount" value={principal} onChange={setPrincipal} prefix="currency" min={0} />
          <RowField
            label="Interest Rate"
            value={rate}
            onChange={setRate}
            suffix="% p.a."
            decimals={2}
            min={0}
            max={60}
          />
          <TenureField label="Loan Period" months={months} onChange={setMonths} compact />
          <DateField
            label="Loan start date"
            value={startDate}
            onChange={setStartDate}
            hint="The first EMI falls one month after this date."
          />
        </Card>
      )}

      <Card title="Your tax">
        <SegmentedControl<TaxRegime>
          label="Tax regime"
          segments={[
            { value: 'old', label: 'Old regime' },
            { value: 'new', label: 'New regime' },
          ]}
          value={regime}
          onChange={setRegime}
        />
        <SegmentedControl<Occupancy>
          label="The home is"
          segments={[
            { value: 'self', label: 'Self-occupied' },
            { value: 'let_out', label: 'Let out' },
          ]}
          value={occupancy}
          onChange={setOccupancy}
        />
        <Label size="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
          Your income-tax slab
        </Label>
        <SelectChipRow
          options={slabs.map((value) => ({ value: String(value), label: `${value}%`, hint: `${value} percent slab` }))}
          value={String(slabPct)}
          onChange={(next) => setSlab(Number(next))}
          wrap
        />
        <View style={{ height: spacing.md }} />
        <RowField
          label="Your share of the loan"
          value={sharePct}
          onChange={setSharePct}
          suffix="%"
          min={1}
          max={100}
          caption="Each co-owner claims their own share"
        />
        {regime === 'old' ? (
          <RowField
            label="Other 80C items this year"
            value={other80C}
            onChange={setOther80C}
            prefix="currency"
            min={0}
            caption="EPF, PPF, ELSS, life cover"
          />
        ) : null}
        {occupancy === 'let_out' ? (
          <RowField
            label="Rent for the year"
            value={annualRent}
            onChange={setAnnualRent}
            prefix="currency"
            min={0}
            caption="After municipal taxes"
          />
        ) : null}
        <SegmentedControl<HomeStatus>
          label="Construction"
          segments={[
            { value: 'ready', label: 'Ready to move in' },
            { value: 'under_construction', label: 'Under construction' },
          ]}
          value={status}
          onChange={setStatus}
        />
        {status === 'under_construction' ? (
          <DateField
            label="Possession date"
            value={possessionDate}
            onChange={setPossessionDate}
            hint="Interest paid before this year is claimed in 5 equal parts from this year."
          />
        ) : null}
      </Card>

      {thisYear ? (
        <Card title={thisYearLabel}>
          <KeyValueRow label="Interest paid" value={money(thisYear.interest)} />
          {thisYear.preConstruction > 0 ? (
            <KeyValueRow label="Pre-construction part" value={money(thisYear.preConstruction)} />
          ) : null}
          <KeyValueRow
            label="Interest deduction, 24(b)"
            value={money(thisYear.interestDeduction)}
            hint={
              occupancy === 'self'
                ? regime === 'old'
                  ? `Up to ${money(SECTION_24B_SELF_CAP)}`
                  : 'Not allowed in the new regime'
                : regime === 'old'
                  ? `Up to 70% of rent + ${money(SECTION_24B_SELF_CAP)}`
                  : 'Up to 70% of rent'
            }
          />
          <KeyValueRow label="Principal repaid" value={money(thisYear.principal)} />
          <KeyValueRow
            label="Principal deduction, 80C"
            value={money(thisYear.principalDeduction)}
            hint={regime === 'old' ? `Up to ${money(SECTION_80C_CAP)} with other 80C items` : 'Not allowed in the new regime'}
          />
          <KeyValueRow label="Tax saved, 4% cess included" value={money(thisYear.taxSaved)} tone="positive" emphasis last />
        </Card>
      ) : null}

      <Card title="By financial year">
        <DataTable
          columns={[
            { key: 'fy', label: 'Year', flex: 1.2 },
            { key: 'interest', label: 'Interest' },
            { key: 'principal', label: 'Principal' },
            { key: 'saved', label: 'Tax saved' },
          ]}
          rows={result.years.map((y) => [
            y.underConstruction ? `${y.label.replace('FY ', '')} *` : y.label.replace('FY ', ''),
            num(y.interest),
            num(y.principal),
            num(y.taxSaved),
          ])}
          caption={`Amounts in ${currencyTag(currency)}. Years run from April to March.${
            result.preConstructionInterest > 0 ? ' * Before possession: nothing is claimed that year.' : ''
          }`}
        />
        <View style={{ marginTop: spacing.md }}>
          <KeyValueRow label="Total deduction, 24(b)" value={money(result.totalInterestDeduction)} />
          <KeyValueRow label="Total deduction, 80C" value={money(result.totalPrincipalDeduction)} />
          {result.unclaimedInterest > 0 ? (
            <KeyValueRow
              label="Interest above the cap"
              value={money(result.unclaimedInterest)}
              hint="Paid, but the cap stops you from claiming it"
              tone="warning"
            />
          ) : null}
          <KeyValueRow label="Total tax saved" value={money(result.totalTaxSaved)} tone="positive" emphasis last />
        </View>
      </Card>

      <Label size="micro" tone="faint" style={{ marginHorizontal: spacing.xs }}>
        A guide only, based on the Income Tax Act for FY 2025-26. The new regime gives no deduction for a
        self-occupied home. If you sell the home within 5 years of possession, the 80C deductions are
        added back to your income. Surcharge is not included. Check with a tax adviser before you file.
      </Label>
    </Screen>
  );
}
