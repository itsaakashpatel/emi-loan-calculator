/**
 * AMFI publishes every scheme's NAV once a day as one plain-text file. It is
 * the only free, no-auth source for Indian mutual fund NAVs.
 *
 * The file is semicolon-delimited under section headers, roughly:
 *
 *   Scheme Code;ISIN Div Payout/Growth;ISIN Div Reinvestment;Scheme Name;NAV;Date
 *   120503;INF209K01YM2;INF209K01YN0;Aditya Birla ...;123.45;03-Sep-2026
 *
 * Blank lines, fund-house names and the header row all appear between data
 * rows, so anything without the full six fields is skipped.
 */

const NAV_ALL_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';

export interface AmfiNav {
  amfiCode: string;
  schemeName: string;
  nav: number;
  /** ISO date, converted from AMFI's `03-Sep-2026`. */
  navDate: string;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** `03-Sep-2026` to `2026-09-03`. Returns null on anything else. */
export function parseAmfiDate(value: string): string | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, day, monthName, year] = match as unknown as [string, string, string, string];
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;

  return `${year}-${month}-${day.padStart(2, '0')}`;
}

/**
 * Parses the NAV file. When `wanted` is given, only those scheme codes are
 * returned — the full file carries 40,000+ schemes and the caller normally
 * holds a few dozen.
 */
export function parseNavAll(text: string, wanted?: ReadonlySet<string>): AmfiNav[] {
  const out: AmfiNav[] = [];

  for (const line of text.split('\n')) {
    if (!line.includes(';')) continue;

    const fields = line.split(';');
    if (fields.length < 6) continue;

    const amfiCode = fields[0]!.trim();
    const schemeName = fields[3]!.trim();
    const nav = Number(fields[4]!.trim());
    const navDate = parseAmfiDate(fields[5]!);

    if (!/^\d+$/.test(amfiCode)) continue; // header row and section titles
    if (!schemeName || !navDate) continue;
    if (!Number.isFinite(nav) || nav <= 0) continue; // 'N.A.' for suspended schemes
    if (wanted && !wanted.has(amfiCode)) continue;

    out.push({ amfiCode, schemeName, nav, navDate });
  }

  return out;
}

export async function fetchNavAll(wanted?: ReadonlySet<string>): Promise<AmfiNav[]> {
  const response = await fetch(NAV_ALL_URL);
  if (!response.ok) throw new Error(`amfi fetch failed: ${response.status}`);

  return parseNavAll(await response.text(), wanted);
}

/**
 * ISIN to scheme code, built from the same file.
 *
 * A CAS identifies each holding by ISIN; everything else here works in AMFI
 * scheme codes. This is the only bridge between the two, and the file is the
 * only free source that carries both. Growth and reinvestment plans have
 * separate ISINs pointing at one scheme, so both columns are indexed.
 */
export function parseIsinIndex(text: string): Map<string, { amfiCode: string; schemeName: string }> {
  const index = new Map<string, { amfiCode: string; schemeName: string }>();

  for (const line of text.split('\n')) {
    const fields = line.split(';');
    if (fields.length < 6) continue;

    const amfiCode = fields[0]!.trim();
    if (!/^\d+$/.test(amfiCode)) continue;

    const schemeName = fields[3]!.trim();
    if (!schemeName) continue;

    for (const column of [fields[1]!, fields[2]!]) {
      const isin = column.trim().toUpperCase();
      // Absent ISINs are written '-'; real ones are 12 alphanumerics.
      if (/^[A-Z0-9]{12}$/.test(isin)) index.set(isin, { amfiCode, schemeName });
    }
  }

  return index;
}

export async function fetchIsinIndex(): Promise<Map<string, { amfiCode: string; schemeName: string }>> {
  const response = await fetch(NAV_ALL_URL);
  if (!response.ok) throw new Error(`amfi fetch failed: ${response.status}`);

  return parseIsinIndex(await response.text());
}
