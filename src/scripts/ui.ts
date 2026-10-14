import { esc } from '../lib/format';
export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
export function loading(el: HTMLElement, msg = 'Loading…') { el.innerHTML = `<p class="muted" role="status"><span class="spinner" aria-hidden="true"></span> ${esc(msg)}</p>`; }
export function showError(el: HTMLElement, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  el.innerHTML = `<div class="verdict bad" role="alert"><strong>Something went wrong</strong>${esc(msg)}</div>`;
}
export function verdict(kind: 'ok' | 'warn' | 'bad', title: string, bodyHtml: string) {
  return `<div class="verdict ${kind}"><strong>${esc(title)}</strong>${bodyHtml}</div>`;
}
export function stat(k: string, v: string, s = '') {
  return `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
}
export function tech(html: string) { return `<details class="tech"><summary>Technical details</summary>${html}</details>`; }
export function onSubmit(form: HTMLFormElement, fn: () => Promise<void> | void) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try { await fn(); } finally { if (btn) btn.disabled = false; }
  });
}
/** Prefill input from ?q= and submit. */
export function fromQuery(input: HTMLInputElement, form: HTMLFormElement) {
  const q = new URLSearchParams(location.search).get('q');
  if (q) { input.value = q; form.requestSubmit(); }
}
