/**
 * Reads a Consolidated Account Statement.
 *
 * A CAS is the statement CAMS and KFintech email an investor covering every
 * mutual fund folio held against one PAN. With MFCentral shut down in
 * September 2025 it is the only way left to import a whole portfolio at once.
 *
 * A statement is a run of folio blocks, each holding one or more schemes:
 *
 *   Folio No: 12345678 / 90    PAN: ABCDE1234F
 *   HDFC Flexi Cap Fund - Growth (Advisor: DIRECT)
 *   ISIN: INF179K01YV8
 *   ... transaction rows ...
 *   Closing Unit Balance: 250.500
 *   NAV on 31-Aug-2026: INR 1,789.4560
 *   Market Value on 31-Aug-2026: INR 448,254.42
 *
 * That layout is how the page *looks*, not what comes out of it. Extracting
 * text from a PDF frequently returns the whole statement as a single line,
 * because line breaks on the page are drawing instructions rather than
 * characters. So this works on character offsets into one normalised string
 * and never on lines: it locates each ISIN, bounds a block by the next ISIN or
 * folio heading, and reads the figures inside.
 *
 * Anything it cannot read confidently is dropped. A holding missing from the
 * import is a visible gap the user can fill in by hand; a misread one quietly
 * corrupts their portfolio.
 */

export interface ParsedCasHolding {
  isin: string;
  schemeName: string;
  folioNumber: string;
  units: number;
  /** Value the statement reports, used as the cost basis when present. */
  marketValue: number | null;
  navOnDate: number | null;
}

/** Strips the thousands separators Indian statements use, then parses. */
function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, '').trim());
  return Number.isFinite(value) ? value : null;
}

const FOLIO_G = /Folio\s*No\.?\s*:?\s*([0-9]+\s*\/?\s*[0-9]*)/gi;
const ISIN_G = /\bISIN\s*:?\s*([A-Z]{2}[A-Z0-9]{9}[0-9])\b/gi;

const CLOSING_UNITS = /Closing\s*Unit\s*Balance\s*:?\s*([\d,]+\.?\d*)/i;
const NAV_ON = /NAV\s*on\s*\d{1,2}-[A-Za-z]{3}-\d{4}\s*:?\s*(?:INR|Rs\.?)?\s*([\d,]+\.?\d*)/i;
const MARKET_VALUE =
  /Market\s*Value\s*on\s*\d{1,2}-[A-Za-z]{3}-\d{4}\s*:?\s*(?:INR|Rs\.?)?\s*([\d,]+\.?\d*)/i;

/**
 * Fields that end a scheme's data. The scheme name is whatever follows the
 * last of these before the next ISIN, which is how a name is found without
 * relying on line breaks.
 */
const FIELD_END =
  /(?:Market\s*Value\s*on\s*\d{1,2}-[A-Za-z]{3}-\d{4}\s*:?\s*(?:INR|Rs\.?)?\s*[\d,]+\.?\d*|NAV\s*on\s*\d{1,2}-[A-Za-z]{3}-\d{4}\s*:?\s*(?:INR|Rs\.?)?\s*[\d,]+\.?\d*|(?:Opening|Closing)\s*Unit\s*Balance\s*:?\s*[\d,]+\.?\d*|PAN\s*:?\s*[A-Z]{5}\d{4}[A-Z]|KYC\s*:?\s*\w+|Folio\s*No\.?\s*:?\s*[0-9]+\s*\/?\s*[0-9]*|Registrar\s*:?\s*\w+|Nominee\s*:?[^;]{0,40}?(?=\s[A-Z]))/gi;

/** A scheme name carries a fund-house or plan marker; noise usually does not. */
const SCHEME_HINT = /(fund|scheme|plan|etf|yojana)/i;

/** Collapses every whitespace run to one space so offsets are predictable. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Reads the scheme name out of the run of text before an ISIN. The name is
 * what follows the last completed field, trimmed of the advisor and registrar
 * tags the registrars append.
 */
function schemeNameBefore(segment: string): string | null {
  FIELD_END.lastIndex = 0;
  let cut = 0;
  for (let match = FIELD_END.exec(segment); match; match = FIELD_END.exec(segment)) {
    cut = match.index + match[0].length;
  }

  const name = segment
    .slice(cut)
    .replace(/\(\s*(advisor|registrar)[^)]*\)?/gi, '')
    .replace(/\b(registrar|advisor)\s*:?\s*[A-Za-z]*$/i, '')
    .replace(/\bISIN\s*:?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length < 8 || name.length > 200) return null;
  if (!SCHEME_HINT.test(name)) return null;

  return name;
}

interface Anchor {
  index: number;
  value: string;
}

function findAll(text: string, pattern: RegExp): Anchor[] {
  const anchors: Anchor[] = [];
  pattern.lastIndex = 0;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    anchors.push({ index: match.index, value: match[1] ?? '' });
  }

  return anchors;
}

/**
 * Pulls the holdings out of a statement's extracted text.
 *
 * Units come from the closing balance, so a folio redeemed to zero drops out
 * rather than importing as an empty position.
 */
export function parseCasText(rawText: string): ParsedCasHolding[] {
  const text = normalise(rawText);
  const isins = findAll(text, ISIN_G);
  const folios = findAll(text, FOLIO_G);

  const holdings: ParsedCasHolding[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < isins.length; i += 1) {
    const anchor = isins[i]!;

    // A block ends at the next scheme or the next folio heading, whichever
    // comes first. Running past a folio boundary would read the following
    // folio's figures into this scheme.
    const nextIsin = isins[i + 1]?.index ?? text.length;
    const nextFolio = folios.find((folio) => folio.index > anchor.index)?.index ?? text.length;
    const body = text.slice(anchor.index, Math.min(nextIsin, nextFolio));

    const units = toNumber(CLOSING_UNITS.exec(body)?.[1]);
    if (units === null || units <= 0) continue; // fully redeemed, or unreadable

    // The owning folio is the nearest heading above this scheme. Searching
    // forward would pick up the next folio for the last scheme in each block.
    const folio = folios.filter((candidate) => candidate.index <= anchor.index).pop();
    if (!folio) continue;

    // The name sits between the previous anchor and this ISIN.
    const previous = Math.max(isins[i - 1]?.index ?? 0, folio.index);
    const schemeName = schemeNameBefore(text.slice(previous, anchor.index));
    if (!schemeName) continue;

    const folioNumber = folio.value.replace(/\s+/g, '');
    const isin = anchor.value.toUpperCase();

    // A statement may list one scheme twice in a folio when it splits the
    // period. The closing balance is the same figure in both, so keep one.
    const key = `${folioNumber}:${isin}`;
    if (seen.has(key)) continue;
    seen.add(key);

    holdings.push({
      isin,
      schemeName,
      folioNumber,
      units,
      marketValue: toNumber(MARKET_VALUE.exec(body)?.[1]),
      navOnDate: toNumber(NAV_ON.exec(body)?.[1]),
    });
  }

  return holdings;
}

export interface ResolvedCasHolding extends ParsedCasHolding {
  /** Null when the ISIN is absent from AMFI's file; the row is still shown. */
  amfiCode: string | null;
}

/**
 * Attaches AMFI scheme codes. The statement's own scheme name is kept: it is
 * what the user will recognise, and AMFI's wording often differs.
 */
export function resolveCasHoldings(
  holdings: readonly ParsedCasHolding[],
  isinIndex: ReadonlyMap<string, { amfiCode: string; schemeName: string }>,
): ResolvedCasHolding[] {
  return holdings.map((holding) => ({
    ...holding,
    amfiCode: isinIndex.get(holding.isin)?.amfiCode ?? null,
  }));
}

/** Extracts text from the PDF bytes. Kept separate so parsing stays testable. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const document = await getDocumentProxy(bytes);
  const { text } = await extractText(document, { mergePages: true });

  return Array.isArray(text) ? text.join('\n') : text;
}
