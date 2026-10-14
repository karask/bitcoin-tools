import { getTxOrNull, getFees, getTipHeight, getAddressTxs, isTxid } from '../lib/api';
import { decodeAddress } from '../lib/address';
import { trackTx, incomingFromTxs } from '../lib/tracker';
import { fmtSats, fmtBtc, fmtRate, fmtDate, esc, ago } from '../lib/format';
import { $, loading, showError, verdict, stat, tech, onSubmit } from './ui';

const form = $<HTMLFormElement>('#pt-form');
const input = $<HTMLInputElement>('#pt-input');
const auto = $<HTMLSelectElement>('#pt-auto');
const out = $('#pt-result');
const status = $('#pt-status');
const REFRESH_MS = 30_000;
let timer: number | undefined;
let current = '';
let busy = false;

async function check(q: string, quiet = false) {
  if (busy) return;
  busy = true;
  if (!quiet) loading(out, 'Asking mempool.space…');
  try {
    if (isTxid(q)) await showTx(q.toLowerCase());
    else {
      const a = decodeAddress(q);
      if (!a.valid) { out.innerHTML = verdict('bad', 'That is neither a transaction ID nor a valid address', `<p>A transaction ID is 64 characters of 0–9 and a–f. ${esc(a.error)}</p>`); stop(); return; }
      if (a.network !== 'mainnet') { out.innerHTML = verdict('warn', 'Test-network address', '<p>This tracker follows Bitcoin mainnet only.</p>'); stop(); return; }
      await showAddress(a.address);
    }
    status.textContent = `Last checked ${new Date().toLocaleTimeString()}${timer ? ' · refreshing every 30 seconds while this page is open' : ''}.`;
  } catch (e) {
    if (!quiet) showError(out, e);
    else status.textContent = `Refresh failed at ${new Date().toLocaleTimeString()} — will try again.`;
  } finally { busy = false; }
}

async function showTx(txid: string) {
  const [tx, tip, fees] = await Promise.all([getTxOrNull(txid), getTipHeight(), getFees()]);
  const s = trackTx(tx, tip, fees);
  let html = '';
  if (s.kind === 'not-found') {
    html = verdict('warn', 'Not found on mainnet (right now)', `<p>${esc(s.notFoundNote)}</p><p>If it was just sent, wait a minute and check again — new transactions take a moment to spread. If the sender used “Bump fee”, ask them for the new transaction ID.</p>`);
    stop();
  } else if (s.kind === 'confirmed') {
    const c = s.confirmations!;
    html = verdict('ok', `Confirmed — ${c.toLocaleString()} confirmation${c === 1 ? '' : 's'}`, `<p>Included in block ${s.blockHeight!.toLocaleString()}${s.blockTime ? `, ${esc(fmtDate(s.blockTime))} (${ago(s.blockTime)})` : ''}. ${c < 3 ? 'One confirmation already makes reversal very unlikely for everyday amounts; many services wait for 3–6 for larger payments.' : 'This payment is well settled.'}</p>`);
    if (c >= 6) stop();
  } else {
    html = verdict('warn', 'Waiting in the mempool (not yet confirmed)', `<p>It pays <strong>${fmtRate(s.feeRate!)}</strong>. Right now about ${fmtRate(fees.fastestFee)} gets into the next block and ${fmtRate(fees.hourFee)} within about an hour. ${esc(s.eta!)}</p>
      <p>${s.rbf ? 'It signals Replace-by-Fee, so the sender can still replace it — for example to raise the fee. If that happens, this ID will disappear and a new one will confirm instead.' : 'It does not signal Replace-by-Fee, but most nodes now accept replacements anyway (full-RBF), so treat an unconfirmed payment as not final.'}</p>
      <p class="small"><a href="../stuck-bitcoin-transaction/?q=${txid}">Taking too long? Open the stuck transaction helper.</a></p>`);
  }
  if (tx) html += `<div class="stats">${stat('Status', s.kind === 'confirmed' ? 'Confirmed' : 'In mempool')}${stat('Fee rate', fmtRate(s.feeRate!), fmtSats(tx.fee))}${stat('Amount moved', fmtBtc(tx.vout.reduce((a, o) => a + o.value, 0)), `${tx.vout.length} outputs`)}</div>`;
  html += tech(`<table><tr><td>txid</td><td class="mono">${esc(txid)}</td></tr><tr><td>Chain tip</td><td>${tip.toLocaleString()}</td></tr><tr><td>Recommended fees</td><td class="mono">${esc(JSON.stringify(fees))}</td></tr></table>`);
  out.innerHTML = html;
}

async function showAddress(address: string) {
  const [txs, tip] = await Promise.all([getAddressTxs(address), getTipHeight()]);
  const inc = incomingFromTxs(txs, address, tip);
  const pending = inc.filter((p) => p.status === 'mempool');
  let html = inc.length === 0
    ? verdict('warn', 'No incoming payments found yet', '<p>Nothing has been received at this address on mainnet (in its most recent history). If you are expecting a payment, keep this page open with auto-refresh on.</p>')
    : verdict(pending.length ? 'warn' : 'ok', pending.length ? `${pending.length} incoming payment${pending.length > 1 ? 's' : ''} waiting to confirm` : 'All recent incoming payments are confirmed',
      `<p>Showing the ${inc.length} most recent payment${inc.length > 1 ? 's' : ''} into this address (newest first). Unconfirmed payments are not final until they are in a block.</p>`);
  if (inc.length) {
    html += `<div style="overflow-x:auto"><table><tr><th>Received</th><th>Status</th><th>When</th><th>Transaction</th></tr>${inc.slice(0, 25).map((p) => `<tr>
      <td>${fmtBtc(p.value)}<br><span class="small muted">${fmtSats(p.value)}</span></td>
      <td>${p.status === 'confirmed' ? `Confirmed (${p.confirmations!.toLocaleString()})` : `Waiting · ${fmtRate(p.feeRate)}`}</td>
      <td>${p.blockTime ? esc(ago(p.blockTime)) : '—'}</td>
      <td class="mono small"><a href="?q=${p.txid}">${p.txid.slice(0, 12)}…</a></td></tr>`).join('')}</table></div>`;
  }
  html += `<p class="small muted">mempool.space returns up to 50 recent mempool and 25 confirmed transactions per request; older history is not shown here.</p>`;
  out.innerHTML = html;
}

function stop() { if (timer) { clearInterval(timer); timer = undefined; } }
function start() {
  stop();
  if (auto.value === 'on' && current) timer = window.setInterval(() => { if (document.visibilityState === 'visible') check(current, true); }, REFRESH_MS);
}

onSubmit(form, async () => {
  current = input.value.trim();
  if (!current) return;
  start();
  await check(current);
});
auto.addEventListener('change', () => { start(); if (!timer) status.textContent = current ? 'Auto-refresh is off.' : ''; else status.textContent = 'Auto-refresh on: checking every 30 seconds while this tab is visible.'; });
const q = new URLSearchParams(location.search).get('q');
if (q) { input.value = q; form.requestSubmit(); }
