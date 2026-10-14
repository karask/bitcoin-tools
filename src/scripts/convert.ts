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
    const now = price.USD ? ` Today the same amount is worth about <strong>$${(btc * price.USD).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>.` : '';
    hOut.innerHTML = `<p>On <strong>${d}</strong> (UTC), 1 BTC was about <strong>$${p.USD.toLocaleString()}</strong> / <strong>€${p.EUR.toLocaleString()}</strong>. So ${btc} BTC was worth about <strong>$${(btc * p.USD).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> / €${(btc * p.EUR).toLocaleString(undefined, { maximumFractionDigits: 2 })}.${now}</p><p class="small muted">Daily reference price from mempool.space; actual exchange prices varied during the day and between exchanges.</p>`;
  } catch (e) { showError(hOut, e); }
});
