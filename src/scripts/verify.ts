import { verifyMessage } from '../lib/message';
import { TYPE_LABEL } from '../lib/address';
import { esc } from '../lib/format';
import { $, verdict, tech, onSubmit } from './ui';

const form = $<HTMLFormElement>('#v-form');
const addr = $<HTMLInputElement>('#v-addr');
const msg = $<HTMLTextAreaElement>('#v-msg');
const sig = $<HTMLTextAreaElement>('#v-sig');
const out = $('#v-result');

function run() {
  const r = verifyMessage(addr.value, msg.value, sig.value);
  const kind = r.verdict === 'yes' ? 'ok' : r.verdict === 'no' ? 'bad' : 'warn';
  let body = `<p>${esc(r.reason)}</p>`;
  if (r.verdict === 'yes') {
    body += `<p class="small muted">This check is local cryptography only — no coins moved, nothing was broadcast, and nothing left your browser.</p>`;
  }
  const rows: [string, string][] = [];
  if (r.addressType) rows.push(['Address type', TYPE_LABEL[r.addressType] ?? r.addressType]);
  if (r.network) rows.push(['Network', r.network]);
  if (r.signatureType) rows.push(['Signature format', r.signatureType]);
  if (r.recoveredAddress) rows.push(['Address recovered from signature', r.recoveredAddress]);
  rows.push(['Scheme', 'BIP-137 / Electrum message signature']);
  body += tech(`<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${esc(v)}</td></tr>`).join('')}</table>`);
  out.innerHTML = verdict(kind, r.title, body);
}

onSubmit(form, run);

// Prefill from query for shareable demos: ?addr=&msg=&sig=
const q = new URLSearchParams(location.search);
if (q.has('addr') || q.has('msg') || q.has('sig')) {
  if (q.get('addr')) addr.value = q.get('addr')!;
  if (q.get('msg')) msg.value = q.get('msg')!;
  if (q.get('sig')) sig.value = q.get('sig')!;
  if (addr.value && sig.value) run();
}
