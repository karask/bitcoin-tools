import { getPrices, getHistoricalPrice } from '../lib/api';
import { SATS } from '../lib/format';
import { $, loading, showError, onSubmit } from './ui';

const f = { sats: $<HTMLInputElement>('#c-sats'), btc: $<HTMLInputElement>('#c-btc'), usd: $<HTMLInputElement>('#c-usd'), eur: $<HTMLInputElement>('#c-eur') };
const status = $('#c-status');
let price = { USD: 0, EUR: 0 };
const warn = document.createElement('p');
warn.className = 'small';
warn.setAttribute('role', 'alert');
status.after(warn);

const clean = (v: string) => Number(v.replace(/[,\s_]/g, ''));
function setFrom(src: keyof typeof f) {
  const v = clean(f[src].value);
  if (!isFinite(v) || f[src].value.trim() === '') return;
  let sats = 0;
  if (src === 'sats') sats = v; else if (src === 'btc') sats = v * SATS;
  else if (price[src.toUpperCase() as 'USD']) sats = (v / price[src.toUpperCase() as 'USD']) * SATS;
  warn.textContent = sats > 21e6 * SATS ? 'Note: that is more than 21,000,000 BTC — more bitcoin than will ever exist.' : '';
  if (src !== 'sats') f.sats.value = String(Math.round(sats));
  if (src !== 'btc') f.btc.value = (sats / SATS).toFixed(8).replace(/\.?0+$/, '');
  if (src !== 'usd' && price.USD) f.usd.value = ((sats / SATS) * price.USD).toFixed(2);
  if (src !== 'eur' && price.EUR) f.eur.value = ((sats / SATS) * price.EUR).toFixed(2);
}
(Object.keys(f) as (keyof typeof f)[]).forEach((k) => f[k].addEventListener('input', () => setFrom(k)));

(async () => {
  try {
    const p = await getPrices();
    price = { USD: p.USD, EUR: p.EUR };
    status.textContent = `1 BTC = $${p.USD.toLocaleString()} = €${p.EUR.toLocaleString()} (mempool.space, ${new Date(p.time * 1000).toLocaleTimeString()}). 1 sat = 0.00000001 BTC.`;
    setFrom('btc');
  } catch (e) { status.textContent = 'Live price unavailable — sats/BTC conversion still works.'; }
})();

const hForm = $<HTMLFormElement>('#h-form');
const hDate = $<HTMLInputElement>('#h-date');
const hAmt = $<HTMLInputElement>('#h-amt');
const hOut = $('#h-result');
hDate.max = new Date().toISOString().slice(0, 10);
onSubmit(hForm, async () => {
  if (!hDate.value) return;
  const ts = Math.floor(Date.parse(hDate.value + 'T12:00:00Z') / 1000);
  loading(hOut, 'Looking up the price…');
  try {
    const p = await getHistoricalPrice(ts);
    if (!p || (!p.USD && !p.EUR)) { hOut.innerHTML = '<p>No price data for that date. Bitcoin had no meaningful market price before mid-2010.</p>'; return; }
    const btc = clean(hAmt.value) || 1;
    const d = new Date(p.time * 1000).toISOString().slice(0, 10);
    const money = (v: number, cur: 'USD' | 'EUR') => v ? new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v) : '—';
    const row = (label: string, usd: number, eur: number, strong = false) =>
      `<tr${strong ? ' class="hl"' : ''}><td>${label}</td><td class="num">${money(usd, 'USD')}</td><td class="num">${money(eur, 'EUR')}</td></tr>`;
    const amt = `${btc.toLocaleString('en-US', { maximumFractionDigits: 8 })} BTC`;
    hOut.innerHTML = `<table class="price-table"><thead><tr><th></th><th class="num">USD</th><th class="num">EUR</th></tr></thead><tbody>
      ${row(`1 BTC on ${d}`, p.USD, p.EUR)}
      ${btc !== 1 ? row(`${amt} on ${d}`, btc * p.USD, btc * p.EUR, true) : ''}
      ${price.USD ? row(`${amt} today`, btc * price.USD, btc * price.EUR, true) : ''}
    </tbody></table><p class="small muted">Dates are UTC. Daily reference price from mempool.space; actual exchange prices varied during the day and between exchanges.</p>`;
  } catch (e) { showError(hOut, e); }
});
