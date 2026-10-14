import { decodeAddress, TYPE_LABEL } from '../lib/address';
import { getAddress } from '../lib/api';
import { classifyExposure } from '../lib/quantum';
import { fmtBtc, esc } from '../lib/format';
import { $, loading, showError, verdict, stat, tech, onSubmit, fromQuery } from './ui';

const form = $<HTMLFormElement>('#q-form');
const input = $<HTMLInputElement>('#q-input');
const out = $('#q-result');

onSubmit(form, async () => {
  const raw = input.value.trim();
  let html = '';
  if (/^(02|03)[0-9a-f]{64}$|^04[0-9a-f]{128}$/i.test(raw)) {
    const r = classifyExposure('P2PK');
    out.innerHTML = verdict('warn', 'This is a public key — it is exposed by definition', `<p>You entered a public key, not an address. Coins locked directly to a public key (P2PK, used mostly in Bitcoin’s early years) always show it on-chain. ${esc(r.reason)}</p>`);
    return;
  }
  const a = decodeAddress(raw);
  if (!a.valid) { out.innerHTML = verdict('bad', 'Not a valid Bitcoin address', `<p>${esc(a.error)}</p>${a.hint ? `<p>${esc(a.hint)}</p>` : ''}`); return; }
  if (a.network !== 'mainnet') { out.innerHTML = verdict('warn', 'Test-network address', '<p>This tool checks mainnet addresses only.</p>'); return; }
  const needsChain = ['P2PKH', 'P2WPKH', 'P2SH', 'P2WSH', 'P2TR'].includes(a.type);
  loading(out, 'Checking the address history on mempool.space…');
  try {
    const s = needsChain ? await getAddress(a.address) : undefined;
    const r = classifyExposure(a.type, s);
    const doList = `<h3>What to do</h3><ul>
      <li><strong>There is no immediate danger.</strong> No quantum computer today can derive a private key from a Bitcoin public key. This is about long-term preparedness, not an emergency.</li>
      <li><strong>Don’t reuse addresses.</strong> Use a fresh receive address for every payment (most wallets do this automatically).</li>
      ${r.reusedWithBalance || (a.type === 'P2TR' && r.balance > 0) ? '<li><strong>Consider moving these funds</strong> to a fresh, never-used address from your wallet when convenient — ideally a hash-based type (bc1q…) that you will spend from in one go. Do not rush or pay a high fee for this.</li>' : ''}
      <li><strong>Follow quantum-resistance proposals</strong> such as <a href="https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki">BIP-360</a>. If Bitcoin adopts new quantum-safe address types, moving funds to them will be the long-term fix.</li></ul>`;
    const kind = r.exposure === 'exposed' ? 'warn' : r.exposure === 'not-exposed' ? 'ok' : 'warn';
    const title = { exposed: 'Public key is exposed', 'not-exposed': 'Public key not revealed on-chain', depends: 'Script revealed — keys probably exposed', 'not-applicable': 'No public key involved', unknown: 'Cannot be determined' }[r.exposure];
    html = verdict(kind, title, `<p>${esc(r.reason)}</p>${r.reusedWithBalance ? `<p><strong>This address was spent from and still holds ${fmtBtc(r.balance)}.</strong> Those remaining coins sit behind a public key that is already visible.</p>` : ''}${r.exposure === 'not-exposed' ? '<p class="small">Note: a public key can also be revealed off-chain — for example if you shared an extended public key (xpub) with a service, or signed a message with this address — or on-chain in another form, if the same key was also used in a different output type (for example an early pay-to-public-key output, as with the famous genesis-block address). This tool only checks this address’s own history.</p>' : ''}${a.type === 'P2SH' || a.type === 'P2WSH' ? '<p class="small">For script addresses (P2SH/P2WSH), what is exposed depends on which script and keys were revealed when it was spent; Taproot script paths similarly only reveal the branch that was used.</p>' : ''}`);
    if (s) html += `<div class="stats">${stat('Type', TYPE_LABEL[a.type].split(' — ')[0])}${stat('Current balance', fmtBtc(r.balance))}${stat('Times spent from', String(s.chain_stats.spent_txo_count + s.mempool_stats.spent_txo_count))}</div>`;
    html += doList;
    html += tech(`<p>Classification: <code>${r.exposure}</code>. Hash-based types (P2PKH, P2WPKH, P2SH, P2WSH) reveal the public key or script in the spending input; the address is treated as exposed if <code>chain_stats.spent_txo_count + mempool_stats.spent_txo_count &gt; 0</code>. P2TR outputs contain the x-only output key directly. A quantum attacker with a key exposed only at spend time would have to act within the confirmation window (“short-range”), whereas keys exposed at rest allow “long-range” attacks.</p>${s ? `<pre>${esc(JSON.stringify(s, null, 2))}</pre>` : ''}`);
    out.innerHTML = html;
  } catch (e) { showError(out, e); }
});
fromQuery(input, form);
