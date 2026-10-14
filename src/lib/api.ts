// All network calls go to the public mempool.space API only.
export const API = 'https://mempool.space/api';

export class ApiError extends Error {}

async function get<T>(path: string, text = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path);
  } catch {
    throw new ApiError('Could not reach mempool.space. Check your internet connection, or try again in a moment (an ad-blocker or privacy extension may also block it).');
  }
  if (res.status === 404 || res.status === 400) throw new ApiError('Not found. Double-check what you entered — it may contain a typo, or belong to a different network (this site uses Bitcoin mainnet).');
  if (res.status === 429) throw new ApiError('mempool.space is rate-limiting requests right now. Please wait a minute and try again.');
  if (!res.ok) throw new ApiError(`mempool.space returned an error (${res.status}). Please try again later.`);
  return (text ? res.text() : res.json()) as Promise<T>;
}

export interface Prices { time: number; USD: number; EUR: number; }
export const getFees = () => get<import('./tx').RecommendedFees>('/v1/fees/recommended');
export const getTx = (txid: string) => get<import('./tx').Tx>(`/tx/${txid}`);
export const getOutspends = (txid: string) => get<{ spent: boolean }[]>(`/tx/${txid}/outspends`);
export const getCpfp = (txid: string) => get<{ effectiveFeePerVsize?: number; ancestors?: unknown[] }>(`/v1/cpfp/${txid}`);
export const getAddress = (addr: string) => get<import('./quantum').AddressStats & { address: string }>(`/address/${addr}`);
export const getPrices = () => get<Prices>('/v1/prices');
export async function getHistoricalPrice(unix: number): Promise<{ USD: number; EUR: number; time: number } | null> {
  const r = await get<{ prices: { time: number; USD: number; EUR: number }[] }>(`/v1/historical-price?currency=EUR&timestamp=${unix}`);
  return r.prices?.[0] ?? null;
}
export const getTipHeight = () => get<string>('/blocks/tip/height', true).then(Number);

export const isTxid = (s: string) => /^[0-9a-fA-F]{64}$/.test(s.trim());
