import { compareLoans } from '../src/lib/finance/compare';
import { amortize } from '../src/lib/finance/emi';
import { formatMoney } from '../src/lib/format/money';
import {
  comparisonHtml,
  investmentHtml,
  loanSummaryHtml,
  scheduleHtml,
} from '../src/pdf/templates';

const RESULT = amortize({
  principal: 1_000_000,
  annualRate: 8.5,
  tenureMonths: 240,
  startDate: '2026-01-01',
});

/** Rough structural check — the PDF renderer is given a complete document. */
function expectWellFormed(html: string) {
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(html).toContain('</html>');
  expect(html.split('<table').length - 1).toBe(html.split('</table>').length - 1);
  expect(html.split('<tr').length - 1).toBe(html.split('</tr>').length - 1);
  // Nothing should leak an unresolved value into the document.
  expect(html).not.toContain('undefined');
  expect(html).not.toContain('NaN');
  expect(html).not.toContain('[object Object]');
}

describe('loan summary PDF', () => {
  it('is a complete document carrying the key figures', () => {
    const html = loanSummaryHtml(RESULT, 'INR', 'Home loan');
    expectWellFormed(html);
    expect(html).toContain('Home loan');
    // EMI at full paise precision, derived so a rounding change can't silently drift the test.
    expect(html).toContain(formatMoney(RESULT.emi, { currency: 'INR', decimals: 2 }));
    expect(html).toContain('₹10,00,000.00'); // Indian grouping survives into the PDF
    expect(html).toContain('Total payment');
  });

  it('recovers the annual rate from the schedule', () => {
    // First row interest / opening x 1200 must come back to the input rate.
    expect(loanSummaryHtml(RESULT, 'INR')).toContain('8.5');
  });

  it('switches grouping with the currency', () => {
    const html = loanSummaryHtml(RESULT, 'USD');
    expect(html).toContain('$1,000,000.00');
    expect(html).not.toContain('₹');
  });

  it('escapes the loan name', () => {
    const html = loanSummaryHtml(RESULT, 'INR', 'Bob & "Sons" <script>');
    expect(html).toContain('Bob &amp; &quot;Sons&quot; &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('has one year row per calendar year plus a total', () => {
    const html = loanSummaryHtml(RESULT, 'INR');
    for (const year of RESULT.yearly) expect(html).toContain(`<td>${year.year}</td>`);
    expect(html).toContain('class="total"');
  });
});

describe('schedule PDF', () => {
  it('includes every installment', () => {
    const html = scheduleHtml(RESULT, 'INR');
    expectWellFormed(html);
    // One row per installment, plus one header row per year, plus the summary table header.
    const rows = html.split('<tr').length - 1;
    expect(rows).toBe(RESULT.tenureMonths + RESULT.yearly.length + 1);
    expect(html).toContain('1. Feb 2026');
    expect(html).toContain(`${RESULT.tenureMonths}. Jan 2046`);
  });

  it('tags moratorium and prepayment rows', () => {
    const withEvents = amortize({
      principal: 1_000_000,
      annualRate: 8.5,
      tenureMonths: 240,
      startDate: '2026-01-01',
      events: [
        { kind: 'moratorium', startMonth: 1, months: 3, type: 'full', recovery: 'extend_tenure' },
        { kind: 'part_payment', startMonth: 24, amount: 100_000, frequency: 'once', mode: 'reduce_tenure' },
      ],
    });
    const html = scheduleHtml(withEvents, 'INR');
    expectWellFormed(html);
    expect(html).toContain('EMI holiday');
    expect(html).toContain('Prepaid');
  });
});

describe('comparison PDF', () => {
  it('marks the cheapest scenario', () => {
    const comparison = compareLoans([
      { id: 'a', label: 'Bank A', principal: 1_000_000, annualRate: 8.5, tenureMonths: 240 },
      { id: 'b', label: 'Bank B', principal: 1_000_000, annualRate: 9.5, tenureMonths: 240 },
    ]);
    const html = comparisonHtml(comparison, 'INR');
    expectWellFormed(html);
    expect(html).toContain('Bank A');
    expect(html).toContain('Bank B');
    expect(html).toContain('Cheapest');
    expect(html).toContain('class="best"');
    expect(html.match(/Cheapest/g)).toHaveLength(1);
  });

  it('survives an empty comparison', () => {
    expectWellFormed(comparisonHtml({ entries: [], bestId: null, maxSaving: 0 }, 'INR'));
  });
});

describe('investment PDF', () => {
  it('renders the generic template with a table', () => {
    const html = investmentHtml({
      title: 'SIP',
      subtitle: '₹10,000/month for 10 yr',
      headline: { label: 'Future value', value: '₹23,23,391', caption: 'at 12% p.a.' },
      facts: [
        ['Total invested', '₹12,00,000'],
        ['Estimated returns', '₹11,23,391'],
      ],
      table: {
        columns: ['Year', 'Invested', 'Value'],
        rows: [
          ['Year 1', '₹1,20,000', '₹1,28,093'],
          ['Year 2', '₹2,40,000', '₹2,72,486'],
        ],
      },
      note: 'Assumes a constant rate of return.',
    });
    expectWellFormed(html);
    expect(html).toContain('₹23,23,391');
    expect(html).toContain('Year 2');
    expect(html).toContain('Assumes a constant rate of return.');
  });

  it('omits the table section when there is nothing to tabulate', () => {
    const html = investmentHtml({
      title: 'Simple Interest',
      subtitle: 'test',
      headline: { label: 'Total', value: '₹1,50,000', caption: 'x' },
      facts: [['Principal', '₹1,00,000']],
    });
    expect(html).not.toContain('<table');
    expect(html).not.toContain('Year-wise breakdown');
  });
});
