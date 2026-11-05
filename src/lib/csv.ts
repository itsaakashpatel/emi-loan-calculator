/**
 * CSV export of a loan schedule, for Excel, Numbers or Google Sheets.
 *
 * Numbers are written plain, with 2 decimals and no digit grouping or currency symbol, so a
 * spreadsheet reads them as numbers. Dates are ISO, which every spreadsheet parses. Lines end in
 * CRLF, as RFC 4180 asks. Pure TypeScript, no React Native imports.
 */

import type { LoanResult } from './finance/types';

/** Quotes a cell when it holds a comma, a quote or a line break. */
export function csvCell(value: string | number): string {
  const text = typeof value === 'number' ? value.toFixed(2) : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function scheduleCsv(result: LoanResult): string {
  const header = [
    'Instalment',
    'Due date',
    'Opening balance (INR)',
    'EMI (INR)',
    'Principal (INR)',
    'Interest (INR)',
    'Part payment (INR)',
    'Closing balance (INR)',
  ];
  const body = result.schedule.map((row) => [
    String(row.no),
    row.date,
    row.opening,
    row.emi,
    row.principal,
    row.interest,
    row.prepayment,
    row.closing,
  ]);
  return toCsv([header, ...body]);
}
