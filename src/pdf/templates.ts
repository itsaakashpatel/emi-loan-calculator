/**
 * HTML templates for PDF export. Print styling only — light background, black text, no theming,
 * because these are documents rather than screens.
 */

import type { ComparisonResult } from '../lib/finance/compare';
import type { LoanResult, ScheduleRow } from '../lib/finance/types';
import { formatDate, formatMonthYear, monthShort, parseISO, todayISO } from '../lib/format/date';
import { formatMoney, formatPercent, formatTenure } from '../lib/format/money';

const STYLES = `
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Helvetica Neue", sans-serif; color: #16161c; margin: 0; padding: 32px 28px; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    h2 { font-size: 13px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6b78; }
    .meta { color: #8a8a96; font-size: 11px; margin-bottom: 20px; }
    .hero { background: #f4f4f8; border-radius: 10px; padding: 16px 18px; margin-bottom: 8px; }
    .hero .amount { font-size: 26px; font-weight: 700; }
    .hero .caption { color: #6b6b78; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: right; padding: 6px 8px; border-bottom: 1px solid #e6e6ee; font-variant-numeric: tabular-nums; }
    th { color: #6b6b78; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    th:first-child, td:first-child { text-align: left; }
    tr.year td { background: #f4f4f8; font-weight: 600; }
    tr.total td { font-weight: 700; border-top: 2px solid #16161c; border-bottom: none; }
    .kv { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e6e6ee; }
    .kv .k { color: #6b6b78; }
    .kv .v { font-weight: 600; font-variant-numeric: tabular-nums; }
    .note { color: #8a8a96; font-size: 10px; margin-top: 18px; line-height: 1.5; }
    .tag { display: inline-block; background: #eeeffe; color: #4f46e5; border-radius: 99px; padding: 1px 7px; font-size: 9px; font-weight: 600; margin-left: 5px; }
    .best { background: #e7f6ec !important; }
  </style>
`;

function page(title: string, subtitle: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${STYLES}</head><body>
    <h1>${escape(title)}</h1>
    <div class="meta">${escape(subtitle)} &middot; Generated ${escape(formatDate(todayISO()))}</div>
    ${body}
  </body></html>`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kv(label: string, value: string): string {
  return `<div class="kv"><span class="k">${escape(label)}</span><span class="v">${escape(value)}</span></div>`;
}

/** Summary block shared by the loan summary and schedule exports. */
function loanFacts(result: LoanResult, currency: string): string {
  const money = (v: number) => formatMoney(v, { currency, decimals: 2 });
  const rows = [
    kv('Loan amount', money(result.principal)),
    kv('Monthly EMI', money(result.emi)),
    kv('Tenure', `${result.tenureMonths} months (${formatTenure(result.tenureMonths)})`),
    kv('Total interest', money(result.totalInterest)),
  ];
  if (result.advanceAmount > 0) {
    rows.push(kv(`Advance EMIs (${result.advanceEmis})`, money(result.advanceAmount)));
  }
  if (result.totalPrepayment > 0) rows.push(kv('Part payments', money(result.totalPrepayment)));
  if (result.capitalisedInterest > 0) {
    rows.push(kv('Interest capitalised', money(result.capitalisedInterest)));
  }
  if (result.fees > 0) rows.push(kv('Fees & charges', money(result.fees)));
  rows.push(kv('Total payment', money(result.totalPayment)));
  rows.push(kv('Disbursed on', formatDate(result.startDate)));
  rows.push(kv('First EMI', formatDate(result.firstPaymentDate)));
  rows.push(kv('Last EMI', formatDate(result.lastPaymentDate)));
  return rows.join('');
}

export function loanSummaryHtml(result: LoanResult, currency: string, name = 'Loan Summary'): string {
  const money = (v: number) => formatMoney(v, { currency, decimals: 2 });
  const interestShare = result.totalPayment > 0 ? (result.totalInterest / result.totalPayment) * 100 : 0;

  return page(
    name,
    `${money(result.principal)} loan`,
    `
      <div class="hero">
        <div class="caption">Monthly EMI</div>
        <div class="amount">${escape(money(result.emi))}</div>
        <div class="caption">${escape(formatTenure(result.tenureMonths))} &middot; interest is ${escape(
          formatPercent(interestShare, 1),
        )} of what you pay</div>
      </div>
      <h2>Details</h2>
      ${loanFacts(result, currency)}
      <h2>Year-wise summary</h2>
      ${yearTable(result, currency)}
      <div class="note">
        Interest is calculated on the reducing balance at ${escape(
          formatPercent(monthlyToAnnual(result), 2),
        )} per annum. Figures are indicative; your lender's schedule may differ by a small rounding
        amount or by the exact day count used.
      </div>
    `,
  );
}

function monthlyToAnnual(result: LoanResult): number {
  // Recovered from the first row so the PDF reports the rate actually used.
  const first = result.schedule[0];
  if (!first || first.opening <= 0) return 0;
  return (first.interest / first.opening) * 1200;
}

function yearTable(result: LoanResult, currency: string): string {
  const money = (v: number) => formatMoney(v, { currency });
  const rows = result.yearly
    .map(
      (group) => `<tr>
        <td>${group.year}</td>
        <td>${escape(money(group.principal))}</td>
        <td>${escape(money(group.interest))}</td>
        <td>${escape(money(group.total))}</td>
        <td>${escape(money(group.closing))}</td>
      </tr>`,
    )
    .join('');
  return `<table>
    <thead><tr><th>Year</th><th>Principal</th><th>Interest</th><th>Total paid</th><th>Balance</th></tr></thead>
    <tbody>${rows}
      <tr class="total">
        <td>Total</td>
        <td>${escape(money(result.principal + result.capitalisedInterest))}</td>
        <td>${escape(money(result.totalInterest))}</td>
        <td>${escape(money(result.totalPayment - result.fees))}</td>
        <td>${escape(money(0))}</td>
      </tr>
    </tbody>
  </table>`;
}

/** Full month-by-month schedule, grouped under year header rows. */
export function scheduleHtml(result: LoanResult, currency: string, name = 'Amortisation Schedule'): string {
  const money = (v: number) => formatMoney(v, { currency, decimals: 2 });
  const rowHtml = (row: ScheduleRow) => {
    const tags = [
      row.moratorium ? `<span class="tag">${row.moratorium === 'full' ? 'EMI holiday' : 'Interest only'}</span>` : '',
      row.prepayment > 0 ? `<span class="tag">Prepaid ${escape(money(row.prepayment))}</span>` : '',
    ].join('');
    return `<tr>
      <td>${row.no}. ${escape(monthShort(parseISO(row.date).month))} ${parseISO(row.date).year}${tags}</td>
      <td>${escape(money(row.emi + row.prepayment))}</td>
      <td>${escape(money(row.principal + row.prepayment))}</td>
      <td>${escape(money(row.interest))}</td>
      <td>${escape(money(row.closing))}</td>
    </tr>`;
  };

  const body = result.yearly
    .map(
      (group) => `
        <tr class="year">
          <td>${group.year}</td>
          <td>${escape(money(group.total))}</td>
          <td>${escape(money(group.principal))}</td>
          <td>${escape(money(group.interest))}</td>
          <td>${escape(money(group.closing))}</td>
        </tr>
        ${group.rows.map(rowHtml).join('')}`,
    )
    .join('');

  return page(
    name,
    `${result.tenureMonths} installments from ${formatMonthYear(result.firstPaymentDate)}`,
    `
      <h2>Summary</h2>
      ${loanFacts(result, currency)}
      <h2>Schedule</h2>
      <table>
        <thead><tr><th>Period</th><th>Payment</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    `,
  );
}

export function comparisonHtml(comparison: ComparisonResult, currency: string): string {
  const money = (v: number) => formatMoney(v, { currency });
  const rows = comparison.entries
    .map(
      (entry) => `<tr class="${entry.isBest ? 'best' : ''}">
        <td>${escape(entry.label)}${entry.isBest ? '<span class="tag">Cheapest</span>' : ''}</td>
        <td>${escape(formatPercent(entry.input.annualRate))}</td>
        <td>${escape(formatTenure(entry.result.tenureMonths))}</td>
        <td>${escape(money(entry.result.emi))}</td>
        <td>${escape(money(entry.result.totalInterest))}</td>
        <td>${escape(money(entry.result.totalPayment))}</td>
        <td>${entry.extraCost > 0 ? `+${escape(money(entry.extraCost))}` : '—'}</td>
      </tr>`,
    )
    .join('');

  return page(
    'Loan Comparison',
    `${comparison.entries.length} scenarios`,
    `
      <table>
        <thead><tr><th>Scenario</th><th>Rate</th><th>Tenure</th><th>EMI</th><th>Interest</th><th>Total</th><th>Extra cost</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="note">
        Ranked by total outflow including fees, not by the lowest EMI — a smaller instalment over a
        longer term usually costs more overall. Spread between the cheapest and priciest option:
        ${escape(money(comparison.maxSaving))}.
      </div>
    `,
  );
}

export interface InvestmentExport {
  title: string;
  subtitle: string;
  headline: { label: string; value: string; caption: string };
  facts: Array<[string, string]>;
  table?: {
    columns: string[];
    rows: string[][];
  };
  note?: string;
}

/** Generic template used by every investment calculator. */
export function investmentHtml(data: InvestmentExport): string {
  const facts = data.facts.map(([label, value]) => kv(label, value)).join('');
  const table = data.table
    ? `<h2>Year-wise breakdown</h2>
       <table>
         <thead><tr>${data.table.columns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr></thead>
         <tbody>${data.table.rows
           .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`)
           .join('')}</tbody>
       </table>`
    : '';

  return page(
    data.title,
    data.subtitle,
    `
      <div class="hero">
        <div class="caption">${escape(data.headline.label)}</div>
        <div class="amount">${escape(data.headline.value)}</div>
        <div class="caption">${escape(data.headline.caption)}</div>
      </div>
      <h2>Details</h2>
      ${facts}
      ${table}
      ${data.note ? `<div class="note">${escape(data.note)}</div>` : ''}
    `,
  );
}
