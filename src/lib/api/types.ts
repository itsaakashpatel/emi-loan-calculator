/**
 * Shapes the portfolio API returns.
 *
 * Deliberately duplicated rather than shared with `backend/`: the app builds
 * through Metro and the Worker through esbuild, and pointing one at the
 * other's source needs path aliases that make both bundlers fragile. The
 * surface is small and changes rarely.
 */

export type Relation = 'self' | 'spouse' | 'child' | 'parent' | 'other';
export type Exchange = 'NSE' | 'BSE';

export interface Member {
  id: string;
  name: string;
  relation: Relation | null;
  hasPan: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Every holding carries these, computed server-side against the price cache. */
export interface Valued {
  invested: number;
  currentValue: number;
  gain: number;
  gainPct: number;
}

export interface MfHolding extends Valued {
  id: string;
  memberId: string;
  amfiCode: string;
  schemeName: string;
  folioNumber: string | null;
  units: number;
  avgNav: number | null;
  source: 'manual' | 'cas';
  currentNav: number | null;
  navDate: string | null;
}

export interface StockHolding extends Valued {
  id: string;
  memberId: string;
  symbol: string;
  exchange: Exchange;
  stockName: string;
  quantity: number;
  avgPrice: number | null;
  currentPrice: number | null;
  priceDate: string | null;
}

export interface MemberSummary extends Valued {
  memberId: string;
  name: string;
  holdingCount: number;
}

export interface PortfolioSummary {
  total: Valued;
  byAssetType: { mutualFunds: Valued; stocks: Valued };
  byMember: MemberSummary[];
}

export interface SchemeMatch {
  amfiCode: string;
  schemeName: string;
}

export interface CasHolding {
  isin: string;
  amfiCode: string | null;
  schemeName: string;
  folioNumber: string;
  units: number;
  marketValue: number | null;
  navOnDate: number | null;
}

export interface CasUpload {
  uploadId: string;
  status: 'processing' | 'parsed' | 'failed' | 'imported';
  error?: string | null;
  holdings?: CasHolding[] | null;
}

export interface MemberDraft {
  name: string;
  relation?: Relation | null;
  panHash?: string | null;
  sortOrder?: number;
}

export interface MfHoldingDraft {
  memberId: string;
  amfiCode: string;
  schemeName: string;
  folioNumber?: string | null;
  units: number;
  avgNav?: number | null;
  investedValue?: number | null;
}

export interface StockHoldingDraft {
  memberId: string;
  symbol: string;
  exchange: Exchange;
  stockName: string;
  quantity: number;
  avgPrice?: number | null;
  investedValue?: number | null;
}
