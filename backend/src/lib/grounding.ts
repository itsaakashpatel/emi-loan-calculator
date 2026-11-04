/**
 * Checks that what a model says it read is really in the document it read.
 *
 * A language model can return a figure that looks right but is not in the
 * document. For units and values this is the worst failure: nothing looks
 * wrong, so the bad number goes into the portfolio and stays there.
 *
 * So every value is checked against the source text. A value that is not
 * there is dropped. This does not make the model accurate. It makes a wrong
 * answer easy to find, and that is the property that matters.
 */

/** Numbers as a statement prints them: 1,789.4560 · 250.500 · 51476.16 */
const NUMERIC = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Every number in the text, with the comma separators removed.
 *
 * The set holds parsed numbers, not strings. The document says 250.500 and
 * the model says 250.5: they are the same value, and a text match would
 * reject a correct answer.
 */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>();

  for (const match of text.matchAll(NUMERIC)) {
    const value = Number(match[0].replace(/,/g, ''));
    if (Number.isFinite(value)) found.add(value);
  }

  return found;
}

/**
 * Whether a number is in the document.
 *
 * The tolerance only absorbs float noise from a JSON round trip. It is much
 * too small to let a different figure through.
 */
export function isGrounded(value: number, corpus: ReadonlySet<number>): boolean {
  if (!Number.isFinite(value)) return false;
  if (corpus.has(value)) return true;

  for (const candidate of corpus) {
    if (Math.abs(candidate - value) < 1e-6) return true;
  }

  return false;
}

/** Text with case, spaces and punctuation removed, for loose comparison. */
function loosely(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Whether `needle` is in `haystack` when case, spaces and punctuation are ignored. */
export function containsLoosely(haystack: string, needle: string): boolean {
  const target = loosely(needle);
  if (target.length === 0) return false;
  return loosely(haystack).includes(target);
}

/**
 * Whether a scheme name comes from the document and is not invented.
 *
 * Names cannot match exactly. A model can change "HDFC FLEXI CAP FUND-GROWTH"
 * to "HDFC Flexi Cap Fund - Growth", and to reject that would lose good rows.
 * So most of its longer words must be in the document. Short words such as
 * "of" prove nothing, so they are ignored.
 *
 * This check is weaker than the number check, on purpose. A badly spelt name
 * next to a checked ISIN and checked units is a small fault. A wrong number
 * is not.
 */
export function isNameGrounded(name: string, sourceText: string): boolean {
  const words = name.split(/[^A-Za-z]+/).filter((word) => word.length >= 4);
  if (words.length === 0) return false;

  const source = loosely(sourceText);
  const present = words.filter((word) => source.includes(loosely(word))).length;

  // Two thirds, so one changed word does not reject a good name.
  return present / words.length >= 2 / 3;
}
