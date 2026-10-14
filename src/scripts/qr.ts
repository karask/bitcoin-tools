import { decodeAddress, networkWarning, TYPE_LABEL } from '../lib/address';
import { buildBip21, formatBip21Amount } from '../lib/bip21';
import { qrSvg, qrPng } from '../lib/qr';
import { getPrices } from '../lib/api';
import { SATS, fmtSats, fmtFiat, esc } from '../lib/format';
import { $, verdict, tech } from './ui';

const addr = $<HTMLInputElement>('#qr-addr');
const amount = $<HTMLInputElement>('#qr-amount');
const unit = $<HTMLSelectElement>('#qr-unit');
const label = $<HTMLInputElement>('#qr-label');
const message = $<HTMLInputElement>('#qr-message');
const upper = $<HTMLSelectElement>('#qr-upper');
const out = $('#qr-result');
let price: { USD: number; EUR: number } | null = null;

/** Convert the amount box to a BTC decimal string (exact, ≤ 8 decimals) or '' if empty. */
function amountBtc(): { btc: string; sats: number } | null | 'bad' {
  const raw = amount.value.replace(/[,\s_]/g, '');
  if (!raw) return null;
  if (!/^\d*\.?\d*$/.test(raw) || raw === '.') return 'bad';
  const v = Number(raw);
  if (!isFinite(v) || v <= 0) return 'bad';
  let sats: number;
  if (unit.value === 'btc') {
    const [, frac = ''] = raw.split('.');
    if (frac.length > 8) return 'bad';
    sats = Math.round(v * SATS);
  } else if (unit.value === 'sats') {
    if (!Number.isInteger(v)) return 'bad';
    sats = v;
  } else {
    const p = price?.[unit.value.toUpperCase() as 'USD' | 'EUR'];
    if (!p) return 'bad';
    sats = Math.round((v / p) * SATS);
  }
  if (sats < 1 || sats > 21e6 * SATS) return 'bad';
  return { btc: formatBip21Amount(sats / SATS), sats };
}

function render() {
  const a = addr.value.trim();
  if (!a) { out.innerHTML = ''; return; }
  const r = decodeAddress(a);
  if (!r.valid) {
    out.innerHTML = verdict('bad', 'Not a valid Bitcoin address — no QR code made', `<p>${esc(r.error)}</p>${r.hint ? `<p>${esc(r.hint)}</p>` : ''}`);
    return;
  }
  const amt = amountBtc();
  if (amt === 'bad') {
    out.innerHTML = verdict('bad', 'Check the amount', `<p>${unit.value === 'btc' ? 'Use a plain number with at most 8 decimal places, e.g. 0.0015.' : unit.value === 'sats' ? 'Sats must be a whole number.' : price ? 'Use a plain number, e.g. 25.' : 'Live price is unavailable, so fiat amounts cannot be converted right now. Enter BTC or sats instead.'}</p>`);
    return;
  }
  const wantUpper = upper.value === 'on';
  const isBech = r.encoding !== 'base58';
  const uri = buildBip21({ address: r.address, amountBtc: amt?.btc, label: label.value.trim() || undefined, message: message.value.trim() || undefined, uppercase: wantUpper && isBech && !label.value.trim() && !message.value.trim() });
  const nw = networkWarning(r);
  let html = '';
  if (nw) html += verdict('warn', 'This is not a real-bitcoin (mainnet) address', `<p>${esc(nw)}</p>`);
  if (r.type === 'future-segwit' || r.type === 'P2A') html += verdict('warn', 'Unusual address type', `<p>${esc(r.warnings[0] ?? TYPE_LABEL[r.type])}</p>`);
  if (wantUpper && (!isBech || label.value.trim() || message.value.trim())) {
    html += `<p class="small muted">Upper-case mode was skipped: ${!isBech ? 'legacy (1… / 3…) addresses are case-sensitive' : 'a label or message would be changed by upper-casing'}.</p>`;
  }
  const { svg } = qrSvg(uri);
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const fiat = amt ? [fmtFiat(amt.sats, price?.USD, 'USD'), fmtFiat(amt.sats, price?.EUR, 'EUR')].filter(Boolean).join(' · ') : '';
  html += `<div class="row" style="align-items:flex-start">
    <div style="flex:0 0 auto"><img id="qr-img" src="${svgUrl}" width="240" height="240" alt="QR code for the payment request shown beside it" style="border-radius:12px;display:block;max-width:100%;height:auto" /></div>
    <div>
      <p>${amt ? `Scan to pay <strong>${esc(amt.btc)} BTC</strong> (${fmtSats(amt.sats)}${fiat ? ' ≈ ' + fiat : ''})` : 'Scan to pay <strong>any amount</strong> (the sender chooses)'} to <code>${esc(r.address)}</code>${label.value.trim() ? ` — labelled “${esc(label.value.trim())}”` : ''}.</p>
      <p class="mono small" id="qr-uri" style="word-break:break-all">${esc(uri)}</p>
      <div class="row">
        <div style="flex:0 1 auto"><button type="button" id="qr-copy">Copy link</button></div>
        <div style="flex:0 1 auto"><button type="button" class="secondary" id="qr-png">Download PNG</button></div>
        <div style="flex:0 1 auto"><button type="button" class="secondary" id="qr-svg">Download SVG</button></div>
      </div>
      <p class="small muted">Before sharing, scan it with your own wallet to make sure it shows the address and amount you expect.</p>
    </div></div>`;
  html += tech(`<table>
    <tr><td>Address type</td><td>${esc(TYPE_LABEL[r.type])}</td></tr>
    <tr><td>Network</td><td>${esc(r.network)}</td></tr>
    <tr><td>BIP-21 URI</td><td class="mono">${esc(uri)}</td></tr>
    <tr><td>Characters</td><td>${uri.length}</td></tr>
    <tr><td>QR</td><td>Error correction M, 4-module quiet zone, generated in your browser.</td></tr></table>
    <p class="small">Amounts are written in BTC as a plain decimal (max 8 places, no exponent). Label and message are percent-encoded (UTF-8). Upper-case mode upper-cases the scheme and the bech32 address so the QR can use the denser alphanumeric mode.</p>`);
  out.innerHTML = html;
  $('#qr-copy').addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(uri); b.textContent = 'Copied ✓'; }
    catch { b.textContent = 'Copy failed — select the text'; }
    setTimeout(() => (b.textContent = 'Copy link'), 1800);
  });
  const fname = `bitcoin-qr-${r.address.slice(0, 10)}`;
  $('#qr-png').addEventListener('click', () => download(qrPng(uri), `${fname}.png`));
  $('#qr-svg').addEventListener('click', () => download(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), `${fname}.svg`));
}

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

[addr, amount, label, message].forEach((el) => el.addEventListener('input', render));
[unit, upper].forEach((el) => el.addEventListener('change', render));
$<HTMLFormElement>('#qr-form').addEventListener('submit', (e) => { e.preventDefault(); render(); });

const params = new URLSearchParams(location.search);
if (params.get('q')) { addr.value = params.get('q')!; render(); }

// The live price is fetched only if the user picks a fiat unit (the only network call this tool makes).
unit.addEventListener('change', () => {
  if (price || (unit.value !== 'usd' && unit.value !== 'eur')) return;
  getPrices().then((p) => { price = { USD: p.USD, EUR: p.EUR }; render(); }).catch(() => render());
});
