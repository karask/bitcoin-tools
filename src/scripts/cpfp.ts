import { getTx, getOutspends, getCpfp, getFees, getTxHex, getTipHeight, isTxid } from '../lib/api';
import { decodeAddress } from '../lib/address';
import { vsizeFromWeight } from '../lib/tx';
import { cpfpPackage, childVsize, checkSafety, buildChildPsbt, inputKindFromType, outKindFromAddressType, type InputKind } from '../lib/cpfp';
import { qrSvg } from '../lib/qr';
import { fmtSats, fmtRate, esc } from '../lib/format';
import { $, loading, showError, verdict, tech, onSubmit } from './ui';
import type { Tx, RecommendedFees } from '../lib/tx';

const loadForm = $<HTMLFormElement>('#cpfp-load');
const txidIn = $<HTMLInputElement>('#cpfp-txid');
const step2 = $('#cpfp-step2');
const out = $('#cpfp-result');
let parent: Tx | null = null;
let fees: RecommendedFees | null = null;
let ancestors: { fee: number; vsize: number }[] = [];
let tip = 0;

const TYPE_NAME: Record<string, string> = { v0_p2wpkh: 'SegWit (bc1q…)', v1_p2tr: 'Taproot (bc1p…)', p2pkh: 'Legacy (1…)', p2sh: 'P2SH (3…)', v0_p2wsh: 'SegWit script (bc1q…, long)', op_return: 'OP_RETURN data', p2pk: 'P2PK', multisig: 'bare multisig' };

export function loadParent(txid: string) { txidIn.value = txid; loadForm.requestSubmit(); txidIn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

onSubmit(loadForm, async () => {
  const txid = txidIn.value.trim().toLowerCase();
  step2.innerHTML = ''; out.innerHTML = '';
  if (!isTxid(txid)) { showError(step2, new Error('Paste the stuck transaction’s ID: 64 characters of 0–9 and a–f.')); return; }
  loading(step2, 'Loading the stuck transaction from mempool.space…');
  try {
    const [tx, spends, f, cp, h] = await Promise.all([getTx(txid), getOutspends(txid), getFees(), getCpfp(txid).catch(() => undefined), getTipHeight().catch(() => 0)]);
    if (tx.status.confirmed) { step2.innerHTML = verdict('ok', 'This transaction is already confirmed', '<p>Nothing to fix — no CPFP needed.</p>'); return; }
    parent = tx; fees = f; tip = h;
    ancestors = (cp?.ancestors ?? []).map((a) => ({ fee: a.fee, vsize: Math.ceil(a.weight / 4) }));
    const opts = tx.vout.map((o, i) => ({ o, i })).filter(({ o, i }) => o.scriptpubkey_type !== 'op_return' && !spends[i]?.spent);
    if (!opts.length) { step2.innerHTML = verdict('warn', 'No unspent outputs to build on', '<p>Every output of this transaction is already spent (or is data). CPFP is not possible from here — if a child already exists, check it with the status tool above.</p>'); return; }
    step2.innerHTML = `<form id="cpfp-build">
      <label for="cpfp-out">2. Which output is yours?</label>
      <select id="cpfp-out">${opts.map(({ o, i }) => `<option value="${i}">#${i} · ${fmtSats(o.value)} → ${esc(o.scriptpubkey_address ?? o.scriptpubkey_type)} (${esc(TYPE_NAME[o.scriptpubkey_type] ?? o.scriptpubkey_type)})</option>`).join('')}</select>
      <div id="cpfp-p2sh" hidden style="margin-top:10px"><label for="cpfp-p2sh-sel">This is a 3… address. Is it a normal single-signature SegWit wallet (wrapped SegWit)?</label>
        <select id="cpfp-p2sh-sel"><option value="no">No / not sure (multisig or other)</option><option value="yes">Yes — single-sig wrapped SegWit</option></select></div>
      <label for="cpfp-dest" style="margin-top:14px">3. Send it to (a fresh address from your own wallet)</label>
      <input id="cpfp-dest" class="mono" placeholder="bc1q… / bc1p… / 1… / 3…" autocomplete="off" spellcheck="false" required />
      <div class="row" style="margin-top:14px">
        <div><label for="cpfp-speed">4. Target speed</label>
          <select id="cpfp-speed"><option value="fastestFee">Next block (~10 min) · ${fmtRate(f.fastestFee)}</option><option value="halfHourFee" selected>~30 minutes · ${fmtRate(f.halfHourFee)}</option><option value="hourFee">~1 hour · ${fmtRate(f.hourFee)}</option><option value="economyFee">Within a day · ${fmtRate(f.economyFee)}</option><option value="custom">Custom sat/vB</option></select></div>
        <div id="cpfp-custom-wrap" hidden style="flex:0 1 160px"><label for="cpfp-custom">sat/vB</label><input id="cpfp-custom" inputmode="decimal" placeholder="e.g. 12" /></div>
        <div style="flex:0 1 auto"><button type="submit">Build PSBT</button></div>
      </div></form>
      <p class="small muted">${ancestors.length ? `This transaction has ${ancestors.length} unconfirmed parent transaction(s) of its own; they must be mined too, so their fees and sizes are included in the calculation.` : 'No unconfirmed ancestors: the package is just the stuck transaction plus your child.'}</p>`;
    const outSel = $<HTMLSelectElement>('#cpfp-out');
    const sync = () => { $('#cpfp-p2sh').hidden = tx.vout[+outSel.value].scriptpubkey_type !== 'p2sh'; $('#cpfp-custom-wrap').hidden = $<HTMLSelectElement>('#cpfp-speed').value !== 'custom'; };
    outSel.addEventListener('change', sync); $('#cpfp-speed').addEventListener('change', sync); sync();
    onSubmit($<HTMLFormElement>('#cpfp-build'), build);
  } catch (e) { showError(step2, e); }
});

async function build() {
  if (!parent || !fees) return;
  const vout = +$<HTMLSelectElement>('#cpfp-out').value;
  const o = parent.vout[vout];
  const kind: InputKind | null = inputKindFromType(o.scriptpubkey_type, $<HTMLSelectElement>('#cpfp-p2sh-sel').value === 'yes');
  if (!kind) {
    out.innerHTML = verdict('bad', 'This output type is not supported by the builder', `<p>${o.scriptpubkey_type === 'p2sh' ? 'For 3… addresses we can only size a single-signature wrapped-SegWit spend.' : 'This output uses a script (for example multisig) whose spending size we cannot know.'} A wrong size estimate would make the fee wrong. Use a wallet that controls this output (such as Sparrow or Electrum) and its own CPFP / “Child pays for parent” feature.</p>`);
    return;
  }
  const dest = decodeAddress($<HTMLInputElement>('#cpfp-dest').value);
  if (!dest.valid) { out.innerHTML = verdict('bad', 'Destination address is not valid', `<p>${esc(dest.error)}</p>`); return; }
  if (dest.network !== 'mainnet') { out.innerHTML = verdict('bad', 'Wrong network', '<p>The stuck transaction is on Bitcoin mainnet; the destination must be a mainnet address too.</p>'); return; }
  const outKind = outKindFromAddressType(dest.type);
  if (!outKind) { out.innerHTML = verdict('bad', 'Unsupported destination type', '<p>Use a normal address from your wallet (bc1q…, bc1p…, 1… or 3…).</p>'); return; }
  const sp = $<HTMLSelectElement>('#cpfp-speed').value;
  const rate = sp === 'custom' ? Number($<HTMLInputElement>('#cpfp-custom').value) : fees[sp as keyof RecommendedFees];
  if (!isFinite(rate) || rate <= 0 || rate > 2000) { out.innerHTML = verdict('bad', 'Check the fee rate', '<p>Enter a positive number of sat/vB (for example 12).</p>'); return; }
  const cv = childVsize(kind, outKind);
  const parentV = vsizeFromWeight(parent.weight);
  const pkg = cpfpPackage({ parentFee: parent.fee, parentVsize: parentV, ancestors, childVsize: cv, targetRate: rate, minRelay: Math.min(1, fees.minimumFee || 1) });
  if (pkg.currentRate >= rate) { out.innerHTML = verdict('warn', 'No CPFP needed for this target', `<p>The stuck transaction${ancestors.length ? ' (with its unconfirmed ancestors)' : ''} already pays ${fmtRate(pkg.currentRate)}, which meets your target of ${fmtRate(rate)}. A child would only add its own fee. Pick a faster target, or just wait.</p>`); return; }
  const safe = checkSafety(o.value, pkg.childFee, outKind);
  if (!safe.ok) { out.innerHTML = verdict('bad', 'Cannot build a safe CPFP here', `<p>${esc(safe.error)}</p>`); return; }
  loading(out, 'Building the unsigned PSBT…');
  try {
    const parentHex = kind === 'p2pkh' ? await getTxHex(parent.txid) : undefined;
    const psbt = buildChildPsbt({ parentTxid: parent.txid, vout, value: o.value, scriptHex: o.scriptpubkey, kind, parentHex, destination: dest.address, sendValue: safe.sendValue, mainnet: true, locktime: tip || 0 });
    let qr = '';
    if (psbt.base64.length <= 1800) { try { qr = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(psbt.base64, 4).svg)}" width="260" height="260" alt="QR code of the PSBT" style="border-radius:12px;display:block;max-width:100%;height:auto" />`; } catch { qr = ''; } }
    out.innerHTML = (safe.warn ? verdict('warn', 'Expensive', `<p>${esc(safe.warn)}</p>`) : '')
      + verdict('ok', 'Your unsigned CPFP transaction is ready', `<p>Spending <strong>${fmtSats(o.value)}</strong> from output #${vout}, sending <strong>${fmtSats(safe.sendValue)}</strong> to <code>${esc(dest.address)}</code>. Fee <strong>${fmtSats(pkg.childFee)}</strong> at ${fmtRate(pkg.childRate)} (~${cv} vB). New package rate ≈ <strong>${fmtRate(pkg.packageRate)}</strong> (was ${fmtRate(pkg.currentRate)}).</p>`)
      + `<h3>What to do now</h3><ol>
        <li>Open the wallet that holds output #${vout} — e.g. <strong>Sparrow</strong>, <strong>Electrum</strong>, or the companion app of your hardware wallet — and choose “Load / import PSBT”. Paste the text, open the .psbt file, or scan the QR.</li>
        <li><strong>Check the amounts</strong> your wallet shows: one input (${fmtSats(o.value)}), one output to your address (${fmtSats(safe.sendValue)}), fee ${fmtSats(pkg.childFee)}.</li>
        <li>Sign it, then broadcast it from your wallet. This site never broadcasts.</li></ol>
        <p class="small muted">Hardware wallets sometimes need key-derivation (BIP-32) details in the PSBT, which this site cannot know because it never asks for your keys or xpub. Wallets like Sparrow and Electrum usually recognise their own output and add these details before sending it to the device. If your wallet says it cannot sign, use its own CPFP / “Child pays for parent” feature instead.</p>`
      + `<label for="cpfp-psbt">PSBT (base64)</label><input id="cpfp-psbt" class="mono" readonly value="${psbt.base64}" />
        <div class="row" style="margin-top:10px"><div style="flex:0 1 auto"><button type="button" id="cpfp-copy">Copy PSBT</button></div><div style="flex:0 1 auto"><button type="button" class="secondary" id="cpfp-dl">Download .psbt</button></div></div>
        ${qr ? `<div style="margin-top:14px">${qr}</div>` : '<p class="small muted">Too large for a single QR code — use copy or download.</p>'}`
      + tech(`<table><tr><td>Child size estimate</td><td>${cv} vB (${kind} input → ${outKind} output)</td></tr>
        <tr><td>Package</td><td>${ancestors.length} ancestor(s) + parent (${parentV} vB, ${fmtSats(parent.fee)}) + child = ${pkg.packageVsize} vB, ${fmtSats(pkg.packageFee)}</td></tr>
        <tr><td>Fee rule</td><td>max(target × package − existing fees, target × child, min relay × child) → ${esc(pkg.reason)}</td></tr>
        <tr><td>Version / sequence / locktime</td><td>2 / 0xfffffffd (RBF) / ${tip || 0}</td></tr>
        <tr><td>UTXO info</td><td>${kind === 'p2pkh' ? 'nonWitnessUtxo (full parent tx)' : 'witnessUtxo'}</td></tr></table>`);
    $('#cpfp-copy').addEventListener('click', async (e) => { const b = e.currentTarget as HTMLButtonElement; try { await navigator.clipboard.writeText(psbt.base64); b.textContent = 'Copied ✓'; } catch { b.textContent = 'Select the text to copy'; } });
    $('#cpfp-dl').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([new Uint8Array(psbt.bytes)], { type: 'application/octet-stream' })); a.download = `cpfp-${parent!.txid.slice(0, 8)}.psbt`; a.click(); });
  } catch (e) { showError(out, e); }
}

const q = new URLSearchParams(location.search).get('cpfp');
if (q) loadParent(q);
