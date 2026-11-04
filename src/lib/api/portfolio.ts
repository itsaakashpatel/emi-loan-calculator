import { apiFetch } from './client';
import type {
  CasHolding,
  CasUpload,
  Member,
  MemberDraft,
  MfHolding,
  MfHoldingDraft,
  PortfolioSummary,
  SchemeMatch,
  StockHolding,
  StockHoldingDraft,
} from './types';

/** Typed calls onto the portfolio API. Each takes the session token. */

export function listMembers(token: string): Promise<{ members: Member[] }> {
  return apiFetch('/members', { token });
}

export function createMember(token: string, body: MemberDraft): Promise<{ member: Member }> {
  return apiFetch('/members', { token, method: 'POST', body });
}

export function updateMember(
  token: string,
  id: string,
  body: MemberDraft,
): Promise<{ member: Member }> {
  return apiFetch(`/members/${id}`, { token, method: 'PUT', body });
}

export function deleteMember(token: string, id: string): Promise<{ ok: true }> {
  return apiFetch(`/members/${id}`, { token, method: 'DELETE' });
}

export function listHoldings(
  token: string,
  memberId?: string,
): Promise<{ mfHoldings: MfHolding[]; stockHoldings: StockHolding[] }> {
  return apiFetch(memberId ? `/holdings?memberId=${memberId}` : '/holdings', { token });
}

export function getSummary(token: string): Promise<PortfolioSummary> {
  return apiFetch('/holdings/summary', { token });
}

export function createMfHolding(token: string, body: MfHoldingDraft): Promise<{ id: string }> {
  return apiFetch('/holdings/mf', { token, method: 'POST', body });
}

export function updateMfHolding(
  token: string,
  id: string,
  body: MfHoldingDraft,
): Promise<{ ok: true }> {
  return apiFetch(`/holdings/mf/${id}`, { token, method: 'PUT', body });
}

export function deleteMfHolding(token: string, id: string): Promise<{ ok: true }> {
  return apiFetch(`/holdings/mf/${id}`, { token, method: 'DELETE' });
}

export function createStockHolding(
  token: string,
  body: StockHoldingDraft,
): Promise<{ id: string }> {
  return apiFetch('/holdings/stock', { token, method: 'POST', body });
}

export function updateStockHolding(
  token: string,
  id: string,
  body: StockHoldingDraft,
): Promise<{ ok: true }> {
  return apiFetch(`/holdings/stock/${id}`, { token, method: 'PUT', body });
}

export function deleteStockHolding(token: string, id: string): Promise<{ ok: true }> {
  return apiFetch(`/holdings/stock/${id}`, { token, method: 'DELETE' });
}

export function searchSchemes(token: string, query: string): Promise<{ schemes: SchemeMatch[] }> {
  return apiFetch(`/schemes/search?q=${encodeURIComponent(query)}`, { token });
}

/** Uploads the statement and returns whatever could be read out of it. */
export function uploadCas(
  token: string,
  memberId: string,
  file: { uri: string; name: string },
): Promise<CasUpload & { holdings: CasHolding[] }> {
  const form = new FormData();
  // React Native's FormData takes this shape for a file; the cast is needed
  // because the DOM lib types the field as Blob.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: 'application/pdf',
  } as unknown as Blob);
  form.append('memberId', memberId);

  return apiFetch('/cas/upload', { token, method: 'POST', formData: form });
}

export function getCasUpload(token: string, uploadId: string): Promise<CasUpload> {
  return apiFetch(`/cas/upload/${uploadId}`, { token });
}

/** `accept` holds indices into the parsed list the user chose to keep. */
export function confirmCasImport(
  token: string,
  uploadId: string,
  accept: number[],
): Promise<{ imported: number; skipped: number }> {
  return apiFetch(`/cas/upload/${uploadId}/confirm`, {
    token,
    method: 'POST',
    body: { accept },
  });
}
