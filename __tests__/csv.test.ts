import { csvCell, scheduleCsv, toCsv } from '../src/lib/csv';
import { amortize } from '../src/lib/finance/emi';

describe('csv', () => {
  it('quotes only cells that need it', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(1234.5)).toBe('1234.50');
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a,1.00\r\nb,2.00\r\n');
  });

  it('writes one line per instalment with plain numbers', () => {
    const result = amortize({ principal: 100_000, annualRate: 10, tenureMonths: 12, startDate: '2026-01-15' });
    const lines = scheduleCsv(result).trimEnd().split('\r\n');
    expect(lines).toHaveLength(13);
    expect(lines[0]).toBe(
      'Instalment,Due date,Opening balance (INR),EMI (INR),Principal (INR),Interest (INR),Part payment (INR),Closing balance (INR)',
    );
    expect(lines[1]).toMatch(/^1,2026-02-15,100000\.00,8791\.59,/);
    expect(lines[12]!.endsWith(',0.00')).toBe(true);
  });
});
