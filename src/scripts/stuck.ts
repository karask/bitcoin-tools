import { getTx, getFees, getOutspends, getCpfp, isTxid } from '../lib/api';
import { analyzeStuck, vsizeFromWeight, signalsRbf, CPFP_CHILD_VSIZE } from '../lib/tx';
import { fmtSats, fmtRate, fmtDate, esc, ago } from '../lib/format';
import { $, loading, showError, verdict, stat, tech, onSubmit, fromQuery } from './ui';

const form = $<HTMLFormElement>('#stuck-form');
const input = $<HTMLInputElement>('#stuck-txid');
const out = $('#stuck-result');

onSubmit(form, async () => {
  const txid = input.value.trim().toLowerCase();
  if (!isTxid(txid)) { showError(out, new Error('A transaction ID is 64 characters long and uses only 0–9 and a–f. Please check what you pasted.')); return; }
  loading(out, 'Looking up the transaction on mempool.space…');
  try {
    const [tx, fees] = await Promise.all([getTx(txid), getFees()]);
    const [outspends, cpfp] = await Promise.all([
      getOutspends(txid).catch(() => undefined),
      tx.status.confirmed ? Promise.resolve(undefined) : getCpfp(txid).catch(() => undefined),
    ]);
    const ownRate = tx.fee / (tx.weight / 4);
    const eff = cpfp?.effectiveFeePerVsize;
    const a = analyzeStuck(tx, fees, { effectiveRate: eff, outspends });
    const vsize = vsizeFromWeight(tx.weight);
    let html = '';
    if (a.advice === 'confirmed') {
      html += verdict('ok', 'Good news: this transaction is confirmed.', `<p>It was included in block ${tx.status.block_height?.toLocaleString()}${tx.status.block_time ? ` on ${esc(fmtDate(tx.status.block_time))} (${ago(tx.status.block_time)})` : ''}. It is not stuck — if the recipient does not see it yet, their wallet may need to refresh or wait for more confirmations.</p>`);
    } else {
      const cmp = `It pays <strong>${fmtRate(a.rate)}</strong>${eff && Math.abs(eff - ownRate) > 0.01 ? ` (effective rate, including related unconfirmed transactions; on its own it pays ${fmtRate(ownRate)})` : ''}. Right now about ${fmtRate(fees.fastestFee)} gets into the next block, ${fmtRate(fees.hourFee)} within about an hour, and ${fmtRate(fees.economyFee)} is the low end.`;
      const opts: string[] = [];
      if (a.advice === 'wait') {
        html += verdict('ok', 'Just wait — the fee looks high enough.', `<p>${cmp} This transaction should confirm soon, probably within the hour. No action needed.</p>`);
      } else {
        const title = a.position === 'below-minimum' ? 'This fee is below what most nodes currently accept.' : 'This transaction is paying less than the current market rate.';
        html += verdict('warn', title, `<p>${cmp} Transactions are picked by fee rate, so it may wait until the network gets quieter. That can take hours or days — but the bitcoin is not lost: it either confirms eventually or is dropped and the funds return to the sender’s wallet.</p>`);
        if (a.advice === 'rbf' || a.advice === 'rbf-or-cpfp') {
          opts.push(`<h3>Option 1: Replace-by-fee (RBF) — for the sender</h3><p>The transaction <strong>signals RBF</strong>, so the sender can use their wallet’s “Bump fee” or “Speed up” button to replace it with a higher-fee version. To target about 30 minutes, the replacement should pay roughly <strong>${fmtRate(a.targetRate)}</strong>, i.e. a total fee of at least about <strong>${fmtSats(a.rbfFee!)}</strong> (it currently pays ${fmtSats(tx.fee)}).</p>`);
        }
        if (a.advice === 'cpfp' || a.advice === 'rbf-or-cpfp') {
          opts.push(`<h3>${a.advice === 'cpfp' ? 'Option' : 'Option 2'}: Child-pays-for-parent (CPFP) — for whoever owns an output</h3><p>If one of the unspent outputs belongs to you (the recipient’s payment, or the sender’s change), you can spend it in a new “child” transaction with a high fee. Miners include both together. For a simple one-input, one-output child (~${CPFP_CHILD_VSIZE} vB) to lift the pair to about ${fmtRate(a.targetRate)}, the child needs a fee of roughly <strong>${fmtSats(a.cpfpChildFee!)}</strong> (≈ ${fmtRate(a.cpfpChildFee! / CPFP_CHILD_VSIZE)}). Many wallets offer this as “Bump fee” on an incoming payment.</p>`);
        }
        if (a.advice === 'cpfp') opts.push(`<p class="small muted">It does not signal RBF. Most nodes now run with “full-RBF” (Bitcoin Core 28+ default), so a sender’s replacement would often still propagate — but many wallets will not offer to bump a non-signalling transaction.</p>`);
        if (a.advice === 'wait-or-accelerate') opts.push(`<h3>Your options</h3><p>It does not signal RBF and has no unspent outputs to use for CPFP, so the usual choices are to <strong>wait</strong>, or use a paid transaction accelerator offered by some mining pools. Under full-RBF, the sender may still be able to replace it with wallet software that supports it.</p>`);
        html += opts.join('');
      }
      html += `<p class="small muted">Fee estimates move quickly and no one can promise when a transaction confirms. Never send bitcoin to anyone promising to “unstick” your transaction for you.</p>`;
    }
    html += `<div class="stats">${stat('Status', tx.status.confirmed ? 'Confirmed' : 'Unconfirmed')}${stat('Fee paid', fmtSats(tx.fee), fmtRate(ownRate))}${stat('Size', `${vsize} vB`, `${tx.weight} WU`)}${stat('Signals RBF', signalsRbf(tx) ? 'Yes' : 'No')}</div>`;
    html += tech(`<table>
      <tr><td>txid</td><td class="mono">${esc(tx.txid)}</td></tr>
      <tr><td>Input sequences</td><td class="mono">${tx.vin.map((v) => '0x' + v.sequence.toString(16).padStart(8, '0')).join(', ')}</td></tr>
      <tr><td>BIP-125 signal</td><td>${signalsRbf(tx) ? 'yes (an nSequence &lt; 0xfffffffe)' : 'no'}</td></tr>
      <tr><td>Effective fee rate (mempool.space)</td><td>${eff ? fmtRate(eff) : 'n/a'}</td></tr>
      <tr><td>Unspent outputs (≥ 546 sats)</td><td>${a.spendableOutputs.length ? a.spendableOutputs.map((i) => '#' + i).join(', ') : 'none'}</td></tr>
      <tr><td>RBF minimum</td><td>max(target × vsize, old fee + 1 sat/vB × vsize). 1 sat/vB is a conservative incremental relay fee; newer nodes default to 0.1.</td></tr>
      <tr><td>Recommended fees</td><td class="mono">${esc(JSON.stringify(fees))}</td></tr>
    </table>`);
    out.innerHTML = html;
  } catch (e) { showError(out, e); }
});
fromQuery(input, form);
