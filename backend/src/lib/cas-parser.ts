import type { Env } from '../env';
import { containsLoosely, isGrounded, isNameGrounded, numbersIn } from './grounding';

/**
 * Reads a Consolidated Account Statement (CAS).
 *
 * A CAS is the statement that CAMS and KFintech email to an investor. It
 * covers every mutual fund folio held against one PAN. MFCentral shut down in
 * September 2025, so a CAS is now the only way to import a full portfolio.
 *
 * There are two registrars, each with more than one layout, and they change
 * them without notice. So this does not match a layout. It converts the PDF
 * to markdown and asks a model to read it into a fixed JSON schema.
 *
 * The model is a witness, not an authority. Every value it gives is checked
 * against the document (see ./grounding.ts), and a value that is not there is
 * dropped. That check makes the approach safe: the model can be wrong,
 * because a wrong answer does not get through.
 */

/**
 * An error whose message is safe to show the user. Any other error may carry
 * internal detail (paths, stack traces, provider text), so the route logs it
 * and sends a generic message instead.
 */
export class CasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CasError';
  }
}

/** Workers AI model. It supports JSON schema output. */
export const CAS_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export interface ParsedCasHolding {
  isin: string;
  schemeName: string;
  folioNumber: string;
  units: number;
  /** Value the statement gives, used as the cost basis when present. */
  marketValue: number | null;
  navOnDate: number | null;
}

/** The model can return only these fields, in this shape. */
const HOLDING_SCHEMA = {
  type: 'object',
  properties: {
    holdings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          isin: { type: 'string', description: 'ISIN, 12 characters, e.g. INF179K01YV8' },
          schemeName: { type: 'string', description: 'Scheme name as printed' },
          folioNumber: { type: 'string', description: 'Folio number the scheme is under' },
          units: { type: 'number', description: 'Closing unit balance' },
          marketValue: { type: ['number', 'null'], description: 'Market value, or null' },
          navOnDate: { type: ['number', 'null'], description: 'Closing NAV, or null' },
        },
        required: ['isin', 'schemeName', 'folioNumber', 'units', 'marketValue', 'navOnDate'],
      },
    },
  },
  required: ['holdings'],
} as const;

const SYSTEM_PROMPT = `You read Indian mutual fund Consolidated Account Statements and return the holdings as JSON.

Rules:
- Copy each value exactly as printed. Do not calculate, correct, round or guess a figure.
- "units" is the CLOSING unit balance. It is never a transaction row.
- Skip a scheme whose closing balance is zero. It was fully redeemed.
- Each scheme belongs to the folio heading printed ABOVE it.
- If a value is not printed, use null.
- Return every scheme that still holds units, and nothing else.`;

/** A statement is much smaller than this. More text would overflow the model context. */
const MAX_CHARS = 240_000;

/**
 * Converts the PDF to markdown with the Workers AI converter.
 *
 * The converter keeps table structure, which plain text extraction loses, and
 * it runs in Cloudflare's service, not against this Worker's CPU budget.
 */
export async function extractPdfText(env: Env, bytes: Uint8Array, name: string): Promise<string> {
  const result = await env.AI.toMarkdown({
    name,
    blob: new Blob([bytes], { type: 'application/pdf' }),
  });

  if (result.format === 'error') {
    console.error('toMarkdown failed', result.error);
    throw new CasError('could not read this PDF');
  }
  if (!result.data.trim()) throw new CasError('the PDF has no readable text');

  return result.data.slice(0, MAX_CHARS);
}

interface ModelHolding {
  isin?: unknown;
  schemeName?: unknown;
  folioNumber?: unknown;
  units?: unknown;
  marketValue?: unknown;
  navOnDate?: unknown;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // A model can return a formatted string, even with a schema.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Reads JSON, also when the model puts it inside prose or a code fence. */
function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export interface CasParseResult {
  holdings: ParsedCasHolding[];
  /** Rows the model returned that the document does not support. */
  rejected: number;
}

/**
 * Keeps only the rows that the document supports.
 *
 * Pure, so the guard is testable without a model. `rejected` is returned, not
 * hidden: if most rows fail, the reading went wrong, and that must be visible.
 */
export function groundHoldings(returned: unknown, markdown: string): CasParseResult {
  if (!Array.isArray(returned)) return { holdings: [], rejected: 0 };

  const numbers = numbersIn(markdown);
  const holdings: ParsedCasHolding[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  for (const item of returned) {
    const row = (item ?? {}) as ModelHolding;
    const isin = asText(row.isin).toUpperCase();
    const schemeName = asText(row.schemeName);
    const folioNumber = asText(row.folioNumber).replace(/\s+/g, '');
    const units = asNumber(row.units);
    const marketValue = asNumber(row.marketValue);
    const navOnDate = asNumber(row.navOnDate);

    // Shape first. A zero balance is a redeemed scheme, not an error.
    if (units === 0) continue;
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) || units === null || units < 0) {
      rejected += 1;
      continue;
    }

    // Then grounding. Each check asks one question: does the document say this?
    const supported =
      containsLoosely(markdown, isin) &&
      containsLoosely(markdown, folioNumber) &&
      isGrounded(units, numbers) &&
      (marketValue === null || isGrounded(marketValue, numbers)) &&
      (navOnDate === null || isGrounded(navOnDate, numbers)) &&
      isNameGrounded(schemeName, markdown);

    if (!supported) {
      rejected += 1;
      continue;
    }

    // A statement can list one scheme twice when it splits the period.
    const key = `${folioNumber}:${isin}`;
    if (seen.has(key)) continue;
    seen.add(key);

    holdings.push({ isin, schemeName, folioNumber, units, marketValue, navOnDate });
  }

  return { holdings, rejected };
}

/** Asks the model for the holdings, then keeps only what the document supports. */
export async function parseCasMarkdown(env: Env, markdown: string): Promise<CasParseResult> {
  const response = await env.AI.run(CAS_MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: markdown },
    ],
    // The schema controls the decoder, so the reply has the correct shape.
    response_format: { type: 'json_schema', json_schema: HOLDING_SCHEMA },
    // This is extraction, so always take the most likely token.
    temperature: 0,
    max_tokens: 8192,
  });

  const raw = (response as { response?: unknown }).response;
  const payload = typeof raw === 'string' ? readJson(raw) : raw;
  const returned = (payload as { holdings?: unknown } | null)?.holdings;

  return groundHoldings(returned, markdown);
}

export interface ResolvedCasHolding extends ParsedCasHolding {
  /** Null when the ISIN is not in AMFI's file. The row is still shown. */
  amfiCode: string | null;
}

/**
 * Adds AMFI scheme codes. The statement's own scheme name is kept, because
 * the user knows that name and AMFI's text is often different.
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
