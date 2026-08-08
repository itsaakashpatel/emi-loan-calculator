/** GST calculator: add GST to a base amount, or strip it out of an inclusive amount. */

export type GstMode = 'add' | 'remove';
export type GstSplit = 'cgst_sgst' | 'igst';

export const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28] as const;

export interface GstInput {
  amount: number;
  ratePct: number;
  mode: GstMode;
  split?: GstSplit;
}

export interface GstResult {
  /** Pre-tax amount. */
  base: number;
  gst: number;
  /** Tax-inclusive amount. */
  total: number;
  ratePct: number;
  /** Half the GST for an intra-state supply, `0` for IGST. */
  cgst: number;
  sgst: number;
  /** Full GST for an inter-state supply, `0` for CGST/SGST. */
  igst: number;
}

export function calculateGst({ amount, ratePct, mode, split = 'cgst_sgst' }: GstInput): GstResult {
  const value = Math.max(0, amount);
  const rate = Math.max(0, ratePct) / 100;

  const base = mode === 'add' ? value : value / (1 + rate);
  const gst = mode === 'add' ? value * rate : value - base;
  const total = base + gst;

  return {
    base,
    gst,
    total,
    ratePct,
    cgst: split === 'cgst_sgst' ? gst / 2 : 0,
    sgst: split === 'cgst_sgst' ? gst / 2 : 0,
    igst: split === 'igst' ? gst : 0,
  };
}
