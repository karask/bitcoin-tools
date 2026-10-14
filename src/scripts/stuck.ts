import { currentNet, netMismatch, withNet, NET_NAME } from '../lib/network';
import { getTxOrNull, getFees, getOutspends, getCpfp, getTipHeight, getAddressTxs, isTxid, getMempoolBlocks } from '../lib/api';
import { decodeAddress } from '../lib/address';
import { confirmations, etaWording, incomingFromTxs, NOT_FOUND_NOTE } from '../lib/tracker';
import { analyzeStuck, vsizeFromWeight, signalsRbf, CPFP_CHILD_VSIZE } from '../lib/tx';
import { fmtBtc, fmtSats, fmtRate, fmtDate, esc, ago } from '../lib/format';
import { $, loading, showError, verdict, stat, tech, onSubmit, fromQuery } from './ui';

const form = $<HTMLFormElement>('#stuck-form');
const input = $<HTMLInputElement>('#stuck-txid');
const out = $('#stuck-result');

const auto = $<HTMLSelectElement>('#stuck-auto');
const status = $('#stuck-status');
let timer: number | undefined;
let current = '';
let busy = false;
const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
function start() {
  stop();
  if (auto.value === 'on' && current) timer = window.setInterval(() => { if (document.visibilityState === 'visible') check(current, true); }, 30_000);
}
auto.addEventListener('change', () => { start(); status.textContent = timer ? 'Auto-refresh on: checking every 30 seconds while this tab is visible.' : ''; });

async function check(q: string, quiet = false) {
  if (busy) return;
  busy = true;
  try {
    if (isTxid(q)) await showTx(q.toLowerCase(), quiet);
    else {
      const a = decodeAddress(q);
      if (!a.valid) { out.innerHTML = verdict('bad', 'That is neither a transaction ID nor a valid address', `<p>A transaction ID is 64 characters of 0–9 and a–f. ${esc(a.error)}</p>`); stop(); return; }
      { const mm = netMismatch(a.network, currentNet()); if (mm) { out.innerHTML = verdict('warn', 'Address is for a different network', `<p>${esc(mm)}</p>`); stop(); return; } }
      if (!quiet) loading(out, 'Looking up recent payments on mempool.space…');
      await showAddress(a.address);
    }
    status.textContent = `Last checked ${new Date().toLocaleTimeString()}${timer ? ' · refreshing every 30 seconds while this page is open' : ''}.`;
  } catch (e) {
    if (!quiet) showError(out, e); else status.textContent = `Refresh failed at ${new Date().toLocaleTimeString()} — will try again.`;
  } finally { busy = false; }
}

async function showAddress(address: string) {
  const [txs, tip] = await Promise.all([getAddressTxs(address), getTipHeight()]);
  const inc = incomingFromTxs(txs, address, tip);
  const pending = inc.filter((p) => p.status === 'mempool');
  let html = inc.length === 0
    ? verdict('warn', 'No incoming payments found yet', `<p>Nothing has been received at this address on ${NET_NAME[currentNet()]} in its recent history. If you are expecting a payment, turn on auto-refresh and keep this page open.</p>`)
    : verdict(pending.length ? 'warn' : 'ok', pending.length ? `${pending.length} incoming payment${pending.length > 1 ? 's' : ''} still waiting to confirm` : 'All recent incoming payments have landed (confirmed)',
      `<p>The ${inc.length} most recent payment${inc.length > 1 ? 's' : ''} into this address, newest first.${pending.length ? ' Click a waiting one to see why and how to speed it up.' : ''}</p>`);
  if (inc.length) html += `<div style="overflow-x:auto"><table><tr><th>Received</th><th>Status</th><th>When</th><th>Transaction</th></tr>${inc.slice(0, 25).map((p) => `<tr>
    <td>${fmtBtc(p.value)}<br><span class="small muted">${fmtSats(p.value)}</span></td>
    <td>${p.status === 'confirmed' ? `Confirmed (${p.confirmations!.toLocaleString()})` : `Waiting · ${fmtRate(p.feeRate)}`}</td>
    <td>${p.blockTime ? esc(ago(p.blockTime)) : '—'}</td>
    <td class="mono small"><a href="?q=${p.txid}">${p.txid.slice(0, 12)}…</a></td></tr>`).join('')}</table></div>
    <p class="small muted">Only recent history is shown (mempool.space returns a limited number of transactions per request).</p>`;
  out.innerHTML = html;
}

onSubmit(form, async () => {
  current = input.value.trim();
  if (!current) return;
  start();
  await check(current);
});

async function showTx(txid: string, quiet: boolean) {
  if (!quiet) loading(out, 'Looking up the transaction on mempool.space…');
  {
    const [tx, fees, tip, blocks] = await Promise.all([getTxOrNull(txid), getFees(), getTipHeight().catch(() => undefined), getMempoolBlocks().catch(() => null)]);
    if (!tx) {
      out.innerHTML = verdict('warn', `Not found on ${NET_NAME[currentNet()]} (right now)`, `<p>${esc(NOT_FOUND_NOTE)}</p><p>If it was just sent, wait a minute and check again. If the sender used “Bump fee”, the transaction ID changes — ask them for the new one, or check the receiving address instead.</p>`);
      stop(); return;
    }
    const [outspends, cpfp] = await Promise.all([
      getOutspends(txid).catch(() => undefined),
      tx.status.confirmed ? Promise.resolve(undefined) : getCpfp(txid).catch(() => undefined),
    ]);
    const ownRate = tx.fee / (tx.weight / 4);
    const effRaw = (cpfp as { effectiveFeePerVsize?: unknown } | undefined)?.effectiveFeePerVsize;
    const eff = typeof effRaw === 'number' && isFinite(effRaw) ? effRaw : undefined;
    const a = analyzeStuck(tx, fees, { effectiveRate: eff, outspends, blocks });
    const vsize = vsizeFromWeight(tx.weight);
    let html = '';
    if (a.advice === 'confirmed') {
      html += verdict('ok', 'Good news: this transaction is confirmed.', `<p>${tip && tx.status.block_height ? `${confirmations(tx.status.block_height, tip).toLocaleString()} confirmation(s). ` : ''}It was included in block ${tx.status.block_height?.toLocaleString()}${tx.status.block_time ? ` on ${esc(fmtDate(tx.status.block_time))} (${ago(tx.status.block_time)})` : ''}. It is not stuck — if the recipient does not see it yet, their wallet may need to refresh or wait for more confirmations.</p>`);
    } else {
      const cmp = `It pays <strong>${fmtRate(a.rate)}</strong>${eff && Math.abs(eff - ownRate) > 0.01 ? ` (effective rate, including related unconfirmed transactions; on its own it pays ${fmtRate(ownRate)})` : ''}. Right now about ${fmtRate(fees.fastestFee)} gets into the next block, ${fmtRate(fees.hourFee)} within about an hour, and ${fmtRate(fees.economyFee)} is the low end. ${esc(etaWording(a.rate, fees))}`;
      const opts: string[] = [];
      if (a.advice === 'wait') {
        html += verdict('ok', 'Just wait — the fee looks high enough.', `<p>${cmp} This transaction should confirm soon, probably within the hour. No action needed.</p>`);
      } else {
        const title = a.position === 'below-minimum' ? 'This fee is below what most nodes currently accept.' : 'This transaction is paying less than the current market rate.';
        html += verdict('warn', title, `<p>${cmp} Transactions are picked by fee rate, so it may wait until the network gets quieter. That can take hours or days — but the bitcoin is not lost: it either confirms eventually or is dropped and the funds return to the sender’s wallet.</p>`);
        if (a.advice === 'rbf' || a.advice === 'rbf-or-cpfp') {
          opts.push(`<p><strong>If you sent it</strong> from a wallet with a “Bump fee” / “Speed up” button, use that (RBF): aim for about ${fmtRate(a.targetRate)} (${a.targetSource === 'projected' ? 'just above the fees in mempool.space’s next projected block' : 'the ~30-minute estimate plus a small margin'}), a total fee of at least ~${fmtSats(a.rbfFee!)}.</p>`);
        }
        if (a.advice === 'cpfp' || a.advice === 'rbf-or-cpfp') {
          opts.push(`<p><strong>If you are the receiver</strong> (or own the change), you can speed it up yourself with CPFP: roughly <strong>${fmtSats(a.cpfpChildFee!)}</strong> for a simple ~${CPFP_CHILD_VSIZE} vB child. <a href="${withNet(`?cpfp=${tx.txid}#cpfp`)}">Build the CPFP transaction below →</a></p>`);
        }
        if (a.position === 'below-minimum') opts.push(`<p class="small muted">Transactions paying less than the network minimum (${fmtRate(fees.minimumFee || 1)}) often never reach miners, even when mempool.space shows room in the next block — so waiting is not a safe plan here.</p>`);
        if (a.advice === 'cpfp') opts.push(`<p class="small muted">It does not signal RBF. Most nodes now run with “full-RBF” (Bitcoin Core 28+ default), so a sender’s replacement would often still propagate — but many wallets will not offer to bump a non-signalling transaction.</p>`);
        if (a.advice === 'wait-or-accelerate') opts.push(`<h3>Your options</h3><p>It does not signal RBF and has no unspent outputs to use for CPFP, so the usual choices are to <strong>wait</strong>, or, as a last resort, a paid accelerator such as <a href="https://mempool.space/accelerator">mempool.space Accelerator</a> (paid, not guaranteed; Binance’s accelerator closes with Binance Pool on 10 Nov 2026). Under full-RBF, the sender may still be able to replace it with wallet software that supports it.</p>`);
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
    if (tx.status.confirmed && tip && tx.status.block_height && confirmations(tx.status.block_height, tip) >= 6) stop();
  }
}
fromQuery(input, form);
