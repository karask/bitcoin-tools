import { currentNet, NETS } from '../lib/network';
import { getTx, getPrices, getHistoricalPrice, getTipHeight, isTxid } from '../lib/api';
import { signalsRbf, locktimeEnforced, describeLocktime, vsizeFromWeight, isSegwit, usesTaproot, guessChange, opReturnData, type Vout } from '../lib/tx';
import { fmtSats, fmtBtc, fmtFiat, fmtRate, fmtDate, esc, plural, ago } from '../lib/format';
import { $, loading, showError, verdict, stat, tech, onSubmit, fromQuery } from './ui';

const form = $<HTMLFormElement>('#tx-form');
const input = $<HTMLInputElement>('#tx-input');
const out = $('#tx-result');

const TYPE: Record<string, string> = { p2pkh: 'legacy', p2sh: 'P2SH', v0_p2wpkh: 'SegWit', v0_p2wsh: 'SegWit script', v1_p2tr: 'Taproot', p2pk: 'pay-to-pubkey', op_return: 'data (OP_RETURN)', multisig: 'bare multisig', anchor: 'anchor', unknown: 'non-standard' };
const short = (a?: string) => a ? `${a.slice(0, 10)}…${a.slice(-6)}` : 'a script';

onSubmit(form, async () => {
  const txid = input.value.trim().toLowerCase();
  if (!isTxid(txid)) { showError(out, new Error('A transaction ID is 64 characters long and uses only 0–9 and a–f. Please check what you pasted.')); return; }
  loading(out, 'Fetching the transaction from mempool.space…');
  try {
    const tx = await getTx(txid);
    const [price, tip] = await Promise.all([
      (tx.status.block_time ? getHistoricalPrice(tx.status.block_time) : getPrices()).catch(() => null),
      getTipHeight().catch(() => undefined),
    ]);
    const usd = (s: number) => fmtFiat(s, price?.USD, 'USD');
    const coinbase = tx.vin.some((v) => v.is_coinbase);
    const inSum = tx.vin.reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
    const outSum = tx.vout.reduce((s, o) => s + o.value, 0);
    const vsize = vsizeFromWeight(tx.weight);
    const change = guessChange(tx);
    const payOuts = tx.vout.filter((o) => o.scriptpubkey_type !== 'op_return');
    const dataOuts = tx.vout.filter((o) => o.scriptpubkey_type === 'op_return');
    const conf = tx.status.confirmed && tip ? tip - tx.status.block_height! + 1 : undefined;

    const p: string[] = [];
    if (coinbase) {
      p.push(`This is a <strong>coinbase transaction</strong>: the special first transaction in a block, where the miner collects the block reward and fees. It created <strong>${fmtBtc(outSum)}</strong> ${usd(outSum) ? `(≈ ${usd(outSum)} at the time)` : ''} out of nothing, as the rules allow.`);
    } else {
      const senders = new Set(tx.vin.map((v) => v.prevout?.scriptpubkey_address ?? v.prevout?.scriptpubkey).filter(Boolean)).size;
      p.push(`This transaction spent <strong>${fmtBtc(inSum)}</strong> from ${plural(tx.vin.length, 'input')} (${plural(senders, 'distinct address')}${tx.vin.some((v) => v.prevout && !v.prevout.scriptpubkey_address) ? ' or script' : ''}) and sent <strong>${fmtBtc(outSum)}</strong> to ${plural(payOuts.length, 'output')}${usd(outSum) ? `, worth about ${usd(outSum)} ${tx.status.block_time ? 'at the time' : 'today'}` : ''}. The difference, <strong>${fmtSats(tx.fee)}</strong>${usd(tx.fee) ? ` (≈ ${usd(tx.fee)})` : ''}, went to the miner as a fee — ${fmtRate(tx.fee / (tx.weight / 4))}.`);
      if (change) {
        const c = tx.vout[change.index];
        const pay = payOuts.find((o) => o !== c)!;
        p.push(`It <em>looks like</em> a payment of <strong>${fmtBtc(pay.value)}</strong> to ${esc(short(pay.scriptpubkey_address))}, with ${fmtBtc(c.value)} probably returned to the sender as change, because ${esc(change.reason)}. This is an educated guess, not a certainty — wallets can and do break these patterns.`);
      } else if (payOuts.length > 2) {
        p.push(`With ${payOuts.length} outputs, this may be a batch payment (for example an exchange paying many customers at once), a CoinJoin, or something else. It is not possible to tell reliably which output, if any, is change.`);
      } else if (payOuts.length === 1) {
        p.push(`There is a single output and no change, which often means someone sent their whole balance (a “sweep”) or moved funds between their own wallets.`);
      }
    }
    if (tx.status.confirmed) p.push(`It is <strong>confirmed</strong> in block ${tx.status.block_height!.toLocaleString()}, mined ${tx.status.block_time ? `${esc(fmtDate(tx.status.block_time))} (${ago(tx.status.block_time)})` : ''}${conf ? ` — ${conf.toLocaleString()} confirmations so far` : ''}.`);
    else p.push(`It is <strong>not yet confirmed</strong>: it is waiting in the mempool. ${signalsRbf(tx) ? 'It signals RBF, so the sender can still replace it with a higher fee.' : ''} <a href="../stuck-bitcoin-transaction/?q=${tx.txid}">Is it stuck?</a>`);
    const tech1: string[] = [];
    if (usesTaproot(tx)) tech1.push('It involves Taproot.');
    else if (isSegwit(tx)) tech1.push('It uses SegWit, which makes fees cheaper.');
    else if (!coinbase) tech1.push('It uses only legacy (pre-SegWit) inputs.');
    if (!coinbase && signalsRbf(tx)) tech1.push('It opts in to Replace-by-Fee (RBF).');
    const lt = describeLocktime(tx.locktime);
    if (lt.kind !== 'none' && locktimeEnforced(tx)) tech1.push(lt.kind === 'height'
      ? `It could not be mined before block ${lt.value.toLocaleString()}${tx.status.block_height && tx.status.block_height - lt.value <= 10 ? ' — wallets commonly set this to the current height to discourage “fee sniping”' : ''}.`
      : `It could not be mined before ${esc(fmtDate(lt.value))}.`);
    if (tech1.length) p.push(tech1.join(' '));
    dataOuts.forEach((o) => { const d = opReturnData(o); if (d) p.push(`It also carries a small piece of embedded data (OP_RETURN)${d.text ? `: “${esc(d.text.slice(0, 200))}”` : ` of ${d.hex.length / 2} bytes`}.`); });

    const row = (o: Vout, i: number) => `<tr><td>#${i}</td><td class="mono">${esc(o.scriptpubkey_address ?? (o.scriptpubkey_type === 'op_return' ? 'OP_RETURN' : o.scriptpubkey))}</td><td>${TYPE[o.scriptpubkey_type] ?? esc(o.scriptpubkey_type)}</td><td>${fmtBtc(o.value)}</td><td>${change?.index === i ? 'maybe change' : ''}</td></tr>`;
    out.innerHTML = verdict(tx.status.confirmed ? 'ok' : 'warn', 'In plain English', p.map((x) => `<p>${x}</p>`).join(''))
      + `<div class="stats">${stat('Fee', fmtSats(tx.fee), fmtRate(tx.fee / (tx.weight / 4)))}${stat('Virtual size', `${vsize} vB`, `${tx.size} bytes · ${tx.weight} WU`)}${stat('Inputs → outputs', `${tx.vin.length} → ${tx.vout.length}`)}${stat('Status', tx.status.confirmed ? 'Confirmed' : 'Unconfirmed')}</div>`
      + `<h3>Outputs</h3><div style="overflow-x:auto"><table><tr><th></th><th>To</th><th>Type</th><th>Amount</th><th></th></tr>${tx.vout.map(row).join('')}</table></div>`
      + tech(`<table>
        <tr><td>txid</td><td class="mono">${esc(tx.txid)}</td></tr><tr><td>Version</td><td>${tx.version}</td></tr>
        <tr><td>Locktime</td><td>${tx.locktime} (${lt.kind}${lt.kind !== 'none' ? locktimeEnforced(tx) ? ', enforced' : ', not enforced: all sequences final' : ''})</td></tr>
        <tr><td>Inputs</td><td class="mono">${tx.vin.map((v) => v.is_coinbase ? 'coinbase' : `${esc(v.txid)}:${v.vout} — ${v.prevout ? fmtBtc(v.prevout.value) + ' ' + (TYPE[v.prevout.scriptpubkey_type] ?? v.prevout.scriptpubkey_type) : ''} seq 0x${v.sequence.toString(16)}`).join('<br>')}</td></tr>
        </table><p class="small"><a href="${NETS[currentNet()].web}/tx/${esc(tx.txid)}">View on mempool.space</a></p>`);
  } catch (e) { showError(out, e); }
});
fromQuery(input, form);
