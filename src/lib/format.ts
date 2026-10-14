export const SATS = 100_000_000;
export const fmtSats = (s: number) => `${Math.round(s).toLocaleString('en-US')} sats`;
export const fmtBtc = (s: number) => `${(s / SATS).toFixed(8).replace(/\.?0+$/, '') || '0'} BTC`;
export function fmtFiat(sats: number, price: number | undefined, cur: 'USD' | 'EUR') {
  if (!price || !isFinite(price)) return '';
  const v = (sats / SATS) * price;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: v < 1 ? 4 : 2 }).format(v);
}
export const fmtRate = (r: number) => `${r < 10 ? r.toFixed(2).replace(/\.?0+$/, '') : Math.round(r * 10) / 10} sat/vB`;
export const fmtDate = (unix: number) => new Date(unix * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export function plural(n: number, w: string) { return `${n} ${n === 1 ? w : /(s|x|sh|ch)$/.test(w) ? w + 'es' : w + 's'}`; }
export function ago(unix: number) {
  const s = Math.max(0, Date.now() / 1000 - unix);
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}
