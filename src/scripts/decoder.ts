import { parseBip21 } from '../lib/bip21';
import { decodeBolt11, looksLikeBolt11, type Bolt11Invoice } from '../lib/bolt11';
import { decodeAddress, networkWarning, TYPE_LABEL } from '../lib/address';
import { getPrices } from '../lib/api';
import { SATS, fmtSats, fmtFiat, fmtDate, esc } from '../lib/format';
import { $, verdict, stat, tech, onSubmit } from './ui';

const form = $<HTMLFormElement>('#pr-form');
const input = $<HTMLInputElement>('#pr-input');
const out = $('#pr-result');
let price: { USD: number; EUR: number } | null = null;

const fiat = (sats: number) => price ? ` ≈ ${[fmtFiat(sats, price.USD, 'USD'), fmtFiat(sats, price.EUR, 'EUR')].join(' · ')}` : '';
function duration(s: number) {
  const a = Math.abs(s);
  if (a < 90) return `${Math.round(a)} seconds`;
  if (a < 5400) return `${Math.round(a / 60)} minutes`;
  if (a < 172800) return `${Math.round(a / 3600)} hours`;
  return `${Math.round(a / 86400)} days`;
}

function lnHtml(inv: Bolt11Invoice, now: number): string {
  const sats = inv.amountMsat === null ? null : Number(inv.amountMsat) / 1000;
  const left = inv.expiresAt - now;
  const forWhat = inv.description ? ` for “<strong>${esc(inv.description)}</strong>”` : inv.descriptionHash ? ' (the description is only given as a hash — the recipient’s website or app should show what it is for)' : '';
  const amtPhrase = sats === null ? '<strong>any amount you choose</strong>' : `<strong>${fmtSats(Math.floor(sats))}</strong>${sats % 1 ? ` (${sats.toFixed(3)} sats — includes millisatoshis)` : ''}${fiat(sats)}`;
  let html = '';
  if (!inv.signatureValid) html += verdict('bad', 'Signature check FAILED', '<p>The invoice’s signature does not match its contents. It may have been altered or corrupted. Do not pay it; ask the recipient for a new one.</p>');
  html += inv.expired
    ? verdict('bad', 'EXPIRED — do not pay this invoice', `<p>It asked for ${amtPhrase}${forWhat}. It expired ${esc(fmtDate(inv.expiresAt))} (${duration(left)} ago). Most wallets will refuse it. Ask the recipient for a fresh invoice.</p>${inv.network !== 'mainnet' ? `<p><strong>Also: this is a ${inv.network} invoice.</strong></p>` : ''}`)
    : verdict(inv.network === 'mainnet' && inv.signatureValid ? 'ok' : 'warn', 'Lightning invoice', `<p>A request to pay ${amtPhrase}${forWhat}.</p>
      <p>It expires in <strong>${duration(left)}</strong> (${esc(fmtDate(inv.expiresAt))}).${inv.network !== 'mainnet' ? ` <strong>This is a ${inv.network} invoice — test coins only, never pay it with real bitcoin.</strong>` : ''}</p>
      ${inv.signatureValid ? '<p class="small">The signature is valid: this invoice was created by the node shown below and has not been changed since. That does not tell you who runs that node.</p>' : ''}`);
  html += `<div class="stats">${stat('Amount', sats === null ? 'Any' : fmtSats(Math.floor(sats)), sats === null ? 'payer chooses' : `${inv.amountMsat} msat`)}${stat('Network', inv.network)}${stat('Expires', inv.expired ? 'Expired' : `in ${duration(left)}`, `created ${fmtDate(inv.timestamp)}`)}${stat('Signature', inv.signatureValid ? 'Valid' : 'Invalid')}</div>`;
  html += tech(`<table>
    <tr><td>Payee node (pubkey)</td><td class="mono">${esc(inv.payee ?? 'unknown')}</td></tr>
    <tr><td>Payment hash</td><td class="mono">${esc(inv.paymentHash ?? '—')}</td></tr>
    ${inv.descriptionHash ? `<tr><td>Description hash</td><td class="mono">${esc(inv.descriptionHash)}</td></tr>` : ''}
    <tr><td>Payment secret</td><td class="mono">${esc(inv.paymentSecret ?? '—')}</td></tr>
    <tr><td>Timestamp</td><td>${inv.timestamp} (${esc(fmtDate(inv.timestamp))})</td></tr>
    <tr><td>Expiry</td><td>${inv.expiry} s</td></tr>
    <tr><td>min_final_cltv_expiry</td><td>${inv.minFinalCltvExpiry} blocks</td></tr>
    <tr><td>Fallback on-chain address</td><td class="mono">${esc(inv.fallbackAddress ?? '—')}</td></tr>
    <tr><td>Route hints</td><td>${inv.routeHints.length}${inv.routeHints.length ? ` (${inv.routeHints.map((r) => r.length + ' hop' + (r.length > 1 ? 's' : '')).join(', ')})` : ''}</td></tr>
    <tr><td>Features</td><td class="mono">${esc(inv.featuresHex ?? '—')}</td></tr>
    ${inv.unknownTags.length ? `<tr><td>Unknown fields</td><td>${inv.unknownTags.join(', ')}</td></tr>` : ''}
  </table><p class="small">Decoded and signature-checked in your browser (secp256k1 public-key recovery). No Lightning node was contacted, so this cannot tell whether the invoice has already been paid.</p>`);
  return html;
}

function onchainHtml(address: string, amountBtc: string | undefined, label?: string, message?: string): string {
  const a = decodeAddress(address);
  if (!a.valid) return verdict('bad', 'The on-chain address in this request is invalid', `<p>${esc(a.error)}</p>${a.hint ? `<p>${esc(a.hint)}</p>` : ''}<p>Do not pay this request.</p>`);
  const nw = networkWarning(a);
  const sats = amountBtc ? Math.round(Number(amountBtc) * SATS) : null;
  let html = verdict(nw ? 'warn' : 'ok', 'On-chain bitcoin payment request', `<p>A request to send ${sats === null ? '<strong>any amount you choose</strong>' : `<strong>${esc(amountBtc!)} BTC</strong> (${fmtSats(sats)}${fiat(sats)})`} to <code>${esc(a.address)}</code>${label ? `, labelled “<strong>${esc(label)}</strong>”` : ''}.</p>
    ${message ? `<p>Message: “${esc(message)}”</p>` : ''}${nw ? `<p><strong>${esc(nw)}</strong></p>` : ''}<p class="small">The address format is valid (${esc(TYPE_LABEL[a.type].split(' — ')[0])}). A valid format cannot tell you who owns it — confirm with the recipient.</p>`);
  return html;
}

function decode() {
  const raw = input.value.trim();
  const now = Math.floor(Date.now() / 1000);
  if (!raw) { out.innerHTML = ''; return; }
  try {
    let html = '';
    if (/^bitcoin:/i.test(raw)) {
      const p = parseBip21(raw);
      const reqUnknown = Object.keys(p.params).filter((k) => k.startsWith('req-'));
      if (reqUnknown.length) html += verdict('bad', 'Unsupported required parameter', `<p>This request contains ${reqUnknown.map((k) => `<code>${esc(k)}</code>`).join(', ')}. BIP-21 says wallets that do not understand a “req-” parameter must treat the whole request as invalid.</p>`);
      if (p.address) html += onchainHtml(p.address, p.amountBtc, p.label, p.message);
      if (p.lightning) {
        html += `<h3>Lightning option</h3><p class="small muted">This request also includes a Lightning invoice. Lightning-capable wallets will usually pay this instead of the on-chain address — pay only one of them.</p>`;
        html += lnHtml(decodeBolt11(p.lightning, now), now);
      }
      const other = Object.keys(p.params).filter((k) => !['amount', 'label', 'message', 'lightning'].includes(k) && !k.startsWith('req-'));
      html += tech(`<table><tr><td>Address</td><td class="mono">${esc(p.address || '(none)')}</td></tr><tr><td>amount</td><td>${esc(p.amountBtc ?? '—')}</td></tr><tr><td>label</td><td>${esc(p.label ?? '—')}</td></tr><tr><td>message</td><td>${esc(p.message ?? '—')}</td></tr>${other.map((k) => `<tr><td>${esc(k)}</td><td class="mono">${esc(p.params[k])}</td></tr>`).join('')}</table>`);
    } else if (looksLikeBolt11(raw)) {
      html = lnHtml(decodeBolt11(raw, now), now);
    } else if (decodeAddress(raw).valid) {
      html = onchainHtml(raw, undefined) + '<p class="small muted">That is a plain address, not a full payment request — there is no amount or label to decode.</p>';
    } else if (/^ln(url|o)/i.test(raw) || /@/.test(raw)) {
      html = verdict('warn', 'Not supported yet', '<p>This looks like an LNURL, BOLT12 offer or Lightning address. Those need contacting a server or node to resolve, which this tool deliberately never does. Only BOLT11 invoices (lnbc…) and bitcoin: links are decoded.</p>');
    } else {
      html = verdict('bad', 'Not a recognised payment request', '<p>Paste a link starting with <code>bitcoin:</code>, a Lightning invoice starting with <code>lnbc</code> (or <code>lightning:</code>), or a Bitcoin address.</p>');
    }
    if (!price) html += `<p><button type="button" class="secondary" id="pr-fiat">Show amounts in USD / EUR</button> <span class="small muted">Optional — fetches the current price from mempool.space. Nothing you pasted is sent.</span></p>`;
    out.innerHTML = html;
    document.getElementById('pr-fiat')?.addEventListener('click', async () => {
      try { const p = await getPrices(); price = { USD: p.USD, EUR: p.EUR }; decode(); } catch { /* keep sats only */ }
    });
  } catch (e) {
    out.innerHTML = verdict('bad', 'Could not decode this payment request', `<p>${esc(e instanceof Error ? e.message : String(e))}</p><p>It may be incomplete (copy it again in full), corrupted, or a format this tool does not support.</p>`);
  }
}
onSubmit(form, decode);
const q = new URLSearchParams(location.search).get('q');
if (q) { input.value = q; decode(); }
