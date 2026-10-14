import { getFees, getPrices, type Prices } from '../lib/api';
import { estimateVsize, totalFee, type ScriptKind, type RecommendedFees } from '../lib/tx';
import { fmtSats, fmtFiat, fmtRate, esc } from '../lib/format';
import { $, loading, showError, stat, tech } from './ui';

const out = $('#fee-result');
const kind = $<HTMLSelectElement>('#fee-kind');
const ins = $<HTMLInputElement>('#fee-in');
const outs = $<HTMLInputElement>('#fee-out');
let fees: RecommendedFees | null = null;
let prices: Prices | null = null;

function render() {
  if (!fees) return;
  const n = Math.max(1, Math.min(500, Number(ins.value) || 1));
  const m = Math.max(1, Math.min(500, Number(outs.value) || 1));
  const vsize = estimateVsize(kind.value as ScriptKind, n, m);
  const rows: [string, string, number][] = [
    ['Fast', 'next block, ~10 minutes', fees.fastestFee],
    ['Normal', 'within ~1 hour', fees.hourFee],
    ['Patient', 'within ~1 day (usually)', fees.economyFee],
  ];
  const cards = rows.map(([k, when, r]) => {
    const f = totalFee(r, vsize);
    const fiat = [fmtFiat(f, prices?.USD, 'USD'), fmtFiat(f, prices?.EUR, 'EUR')].filter(Boolean).join(' · ');
    return stat(`${k} — ${when}`, fmtRate(r), `${fmtSats(f)}${fiat ? ' ≈ ' + fiat : ''}`);
  }).join('');
  const busy = fees.fastestFee <= 2 ? 'The network is quiet right now — even the cheapest option should confirm quickly.'
    : fees.fastestFee >= 50 ? 'The network is busy right now. If you are not in a hurry, choosing a lower fee can save a lot.'
    : 'The network is moderately busy.';
  out.innerHTML = `<p>${esc(busy)} For a transaction of about <strong>${vsize} vbytes</strong> (${n} input${n > 1 ? 's' : ''}, ${m} output${m > 1 ? 's' : ''}), you would pay:</p>
    <div class="stats">${cards}</div>
    <p class="small muted">Estimates, not guarantees: fees can change quickly as new transactions arrive. Your wallet calculates the exact size of your transaction, so its total may differ slightly.</p>
    ${tech(`<table><tr><th>mempool.space field</th><th>sat/vB</th></tr>
      ${Object.entries(fees).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td>${v}</td></tr>`).join('')}</table>
      <p class="small">Fast = <code>fastestFee</code>, Normal = <code>hourFee</code>, Patient = <code>economyFee</code>. Size estimate uses typical per-input/output vbytes for ${esc(kind.value)} (${prices ? `BTC price: $${prices.USD.toLocaleString()} / €${prices.EUR.toLocaleString()}` : 'price unavailable'}).</p>`)}`;
}

async function load() {
  loading(out, 'Fetching current fees from mempool.space…');
  try {
    [fees, prices] = await Promise.all([getFees(), getPrices().catch(() => null)]);
    render();
  } catch (e) { showError(out, e); }
}
[kind, ins, outs].forEach((el) => el.addEventListener('input', render));
$('#fee-refresh').addEventListener('click', load);
load();
