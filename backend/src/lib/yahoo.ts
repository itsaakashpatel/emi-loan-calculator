/**
 * Indian stock prices. NSE and BSE publish no free API, so this reads Yahoo
 * Finance's chart endpoint — unofficial, but the most dependable free source.
 *
 * Because it is unofficial it can change or rate-limit without notice. Every
 * caller must tolerate a null: a stale cached price beats a blank portfolio.
 */

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export interface StockQuote {
  symbol: string;
  price: number;
  currency: string;
  /** ISO date of the close this price came from. */
  priceDate: string;
}

/** `RELIANCE` on NSE becomes `RELIANCE.NS`; BSE uses `.BO`. */
export function yahooSymbol(symbol: string, exchange: string): string {
  const bare = symbol.trim().toUpperCase();
  if (bare.includes('.')) return bare;
  return `${bare}${exchange === 'BSE' ? '.BO' : '.NS'}`;
}

interface ChartResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; currency?: string; regularMarketTime?: number };
    }>;
  };
}

/** Returns null rather than throwing, so one dead ticker cannot fail a batch. */
export async function fetchQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const response = await fetch(`${CHART_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;

    const meta = ((await response.json()) as ChartResponse).chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;

    const stamp = meta?.regularMarketTime;
    const priceDate = (
      typeof stamp === 'number' ? new Date(stamp * 1000) : new Date()
    ).toISOString().slice(0, 10);

    return { symbol, price, currency: meta?.currency ?? 'INR', priceDate };
  } catch {
    return null;
  }
}

/**
 * Fetches sequentially with a short gap. The endpoint publishes no rate limit;
 * spacing the calls keeps a portfolio-sized batch well inside what it tolerates.
 */
export async function fetchQuotes(symbols: readonly string[]): Promise<StockQuote[]> {
  const quotes: StockQuote[] = [];

  for (const symbol of symbols) {
    const quote = await fetchQuote(symbol);
    if (quote) quotes.push(quote);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return quotes;
}
