import { amountToWords } from '../src/lib/format/money';

/**
 * The original app captions its result with the amount spelled out ("Twenty Five Lakh"), which is
 * only readable if the Indian crore/lakh scale is used for rupee-style currencies.
 */
describe('amountToWords — Indian scale', () => {
  it('handles zero and small numbers', () => {
    expect(amountToWords(0)).toBe('Zero');
    expect(amountToWords(1)).toBe('One');
    expect(amountToWords(9)).toBe('Nine');
    expect(amountToWords(10)).toBe('Ten');
    expect(amountToWords(19)).toBe('Nineteen');
  });

  it('handles the tens and hundreds', () => {
    expect(amountToWords(20)).toBe('Twenty');
    expect(amountToWords(21)).toBe('Twenty One');
    expect(amountToWords(99)).toBe('Ninety Nine');
    expect(amountToWords(100)).toBe('One Hundred');
    expect(amountToWords(101)).toBe('One Hundred One');
    expect(amountToWords(999)).toBe('Nine Hundred Ninety Nine');
  });

  it('uses thousand, lakh and crore', () => {
    expect(amountToWords(1_000)).toBe('One Thousand');
    expect(amountToWords(23_303)).toBe('Twenty Three Thousand Three Hundred Three');
    expect(amountToWords(100_000)).toBe('One Lakh');
    expect(amountToWords(2_500_000)).toBe('Twenty Five Lakh');
    expect(amountToWords(1_000_000)).toBe('Ten Lakh');
    expect(amountToWords(10_000_000)).toBe('One Crore');
    expect(amountToWords(12_345_678)).toBe(
      'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight',
    );
  });

  it('recurses for counts above 999 crore', () => {
    // 1,00,00,00,00,000 = one lakh crore
    expect(amountToWords(1_000_000_000_000)).toBe('One Lakh Crore');
  });

  it('drops the fractional part', () => {
    expect(amountToWords(8_678.24)).toBe('Eight Thousand Six Hundred Seventy Eight');
  });

  it('marks negatives', () => {
    expect(amountToWords(-2_500_000)).toBe('Minus Twenty Five Lakh');
  });

  it('never leaves double spaces', () => {
    for (const value of [1_000_000, 10_000_000, 100_000, 1_00_00_001, 5_000_007]) {
      expect(amountToWords(value)).not.toMatch(/\s{2}/);
      expect(amountToWords(value).trim()).toBe(amountToWords(value));
    }
  });
});

describe('amountToWords — Western scale', () => {
  it('uses million and billion', () => {
    expect(amountToWords(1_000_000, 'western')).toBe('One Million');
    expect(amountToWords(12_345_678, 'western')).toBe(
      'Twelve Million Three Hundred Forty Five Thousand Six Hundred Seventy Eight',
    );
    expect(amountToWords(2_500_000_000, 'western')).toBe('Two Billion Five Hundred Million');
  });

  it('never says lakh or crore', () => {
    const words = amountToWords(12_345_678, 'western');
    expect(words).not.toContain('Lakh');
    expect(words).not.toContain('Crore');
  });
});

describe('amountToWords — robustness', () => {
  it('returns empty for non-finite input', () => {
    expect(amountToWords(NaN)).toBe('');
    expect(amountToWords(Infinity)).toBe('');
  });
});
