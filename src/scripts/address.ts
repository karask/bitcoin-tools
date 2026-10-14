import { decodeAddress, TYPE_LABEL, networkWarning, toHex } from '../lib/address';
import { getAddress } from '../lib/api';
import { balanceOf } from '../lib/quantum';
import { fmtSats, fmtBtc, esc } from '../lib/format';
import { $, verdict, stat, tech, onSubmit, loading, showError } from './ui';

const form = $<HTMLFormElement>('#addr-form');
const input = $<HTMLInputElement>('#addr-input');
const out = $('#addr-result');

const ABOUT: Record<string, string> = {
  P2PKH: 'The original Bitcoin address format (starts with 1). Works everywhere, but transactions from it cost more in fees.',
  P2SH: 'Starts with 3. Used for wrapped SegWit wallets and for multisig or other scripts. You cannot tell which from the address alone.',
  P2WPKH: 'Native SegWit (starts with bc1q, 42 characters). Cheaper fees than legacy addresses and supported by almost all wallets.',
  P2WSH: 'Native SegWit script address (bc1q, 62 characters), usually multisig or another smart-contract setup.',
  P2TR: 'Taproot (starts with bc1p). The newest common format: cheaper for complex spending and better privacy. A few old services cannot send to it yet.',
  P2A: 'A special “anchor” output used by Lightning and other protocols for fee bumping. It is not a normal wallet address — anyone can spend from it.',
  'future-segwit': 'A future SegWit version that Bitcoin does not define rules for yet.',
};

function check() {
  const r = decodeAddress(input.value);
  let html = '';
  if (!r.valid) {
    html = verdict('bad', 'Not a valid Bitcoin address', `<p>${esc(r.error)}</p>${r.hint ? `<p>${esc(r.hint)}</p>` : ''}`);
  } else {
    const nw = networkWarning(r);
    html = verdict(nw ? 'warn' : r.warnings.length ? 'warn' : 'ok', nw ? 'Valid, but not a real-bitcoin (mainnet) address' : 'Valid Bitcoin address',
      `<p>${esc(ABOUT[r.type])}</p>${nw ? `<p><strong>${esc(nw)}</strong></p>` : ''}${r.warnings.map((w) => `<p>${esc(w)}</p>`).join('')}
       <p class="small">A valid format only means there is no typo. It cannot tell you who owns the address — always confirm it with the recipient.</p>`);
    html += `<div class="stats">${stat('Network', r.network)}${stat('Type', TYPE_LABEL[r.type].split(' — ')[0])}${stat('Encoding', r.encoding)}</div>`;
    html += tech(`<table>
      <tr><td>Type</td><td>${esc(TYPE_LABEL[r.type])}</td></tr>
      ${r.witnessVersion !== undefined ? `<tr><td>Witness version</td><td>${r.witnessVersion}</td></tr>` : ''}
      <tr><td>${r.encoding === 'base58' ? 'Hash (payload)' : 'Witness program'}</td><td class="mono">${toHex(r.program!)}</td></tr>
      <tr><td>Length</td><td>${r.program!.length} bytes</td></tr></table>`);
    if (r.network === 'mainnet') html += `<p><button type="button" class="secondary" id="addr-lookup">Look up balance on mempool.space</button></p>
      <p class="small muted">Optional. This sends the address to mempool.space. Everything above was checked in your browser only.</p><div id="addr-chain"></div>`;
  }
  out.innerHTML = html;
  const btn = document.getElementById('addr-lookup');
  if (btn && r.valid) btn.addEventListener('click', async () => {
    const el = $('#addr-chain'); loading(el, 'Asking mempool.space…');
    try {
      const s = await getAddress(r.address);
      const bal = balanceOf(s);
      el.innerHTML = `<div class="stats">${stat('Balance', fmtBtc(bal), fmtSats(bal) + (s.mempool_stats.tx_count ? ' (incl. unconfirmed)' : ''))}${stat('Transactions', String(s.chain_stats.tx_count + s.mempool_stats.tx_count))}${stat('Times received', String(s.chain_stats.funded_txo_count))}</div>
      ${s.chain_stats.tx_count > 2 ? '<p class="small">This address has been used several times. Reusing addresses reduces privacy; most wallets give you a fresh address for each payment.</p>' : ''}`;
    } catch (e) { showError(el, e); }
  });
}
onSubmit(form, check);
const q = new URLSearchParams(location.search).get('q'); if (q) { input.value = q; check(); }
