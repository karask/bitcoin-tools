// Site chrome: ⌘K tool search, theme toggle, card spotlight.
const root = document.documentElement;

// ---- theme
// Dark by default; light only when chosen.
document.querySelector('.theme-btn')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
});

// ---- palette
const dlg = document.getElementById('palette') as HTMLDialogElement;
const q = document.getElementById('pal-q') as HTMLInputElement;
const items = [...dlg.querySelectorAll<HTMLAnchorElement>('.pal-item')];
const groups = [...dlg.querySelectorAll<HTMLElement>('.pal-group')];
const empty = dlg.querySelector('.pal-empty') as HTMLElement;
let active = 0;

const list = document.getElementById('pal-list') as HTMLElement;
const names = items.map((i) => i.querySelector('b')!.textContent!.toLowerCase());
const rank = new Map<HTMLElement, number>();
const visible = () => items.filter((i) => !i.hidden).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
function highlight(n: number) {
  const v = visible();
  if (!v.length) { q.removeAttribute('aria-activedescendant'); return; }
  active = (n + v.length) % v.length;
  items.forEach((i) => i.setAttribute('aria-selected', 'false'));
  v[active].setAttribute('aria-selected', 'true');
  v[active].scrollIntoView({ block: 'nearest' });
  q.setAttribute('aria-activedescendant', v[active].id);
}
function filter() {
  const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
  // While searching, show one flat list with name matches first; otherwise the grouped toolbox order.
  list.classList.toggle('flat', terms.length > 0);
  items.forEach((i, n) => {
    i.hidden = !terms.every((t) => i.dataset.search!.includes(t));
    const score = terms.reduce((s, t) => s + (names[n].startsWith(t) ? 3 : names[n].includes(t) ? 2 : 0), 0);
    rank.set(i, terms.length ? -score * 100 + n : n);
    i.style.order = String(rank.get(i));
  });
  groups.forEach((g) => { g.hidden = ![...g.querySelectorAll<HTMLElement>('.pal-item')].some((i) => !i.hidden); });
  empty.hidden = visible().length > 0;
  highlight(0);
}
const box = dlg.querySelector('.pal-box') as HTMLElement;
function open() {
  if (dlg.open) return;
  q.value = '';
  filter();
  // On touch screens this doubles as the tool menu: don't pop the keyboard up unasked.
  const touch = matchMedia('(hover: none)').matches;
  box.toggleAttribute('autofocus', touch);
  q.toggleAttribute('autofocus', !touch);
  dlg.showModal();
}
document.querySelectorAll('[data-palette]').forEach((b) => b.addEventListener('click', open));
dlg.querySelector('[data-close]')?.addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
q.addEventListener('input', filter);
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
  else if (e.key === 'Enter') { const v = visible()[active]; if (v) { e.preventDefault(); v.click(); } }
});
items.forEach((i) => i.addEventListener('pointermove', () => { const n = visible().indexOf(i); if (n !== active) highlight(n); }));
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); dlg.open ? dlg.close() : open(); }
});
if (!/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelectorAll('.kbd-mod').forEach((k) => { k.textContent = 'Ctrl K'; });

// ---- spotlight that follows the pointer on cards
document.addEventListener('pointermove', (e) => {
  const el = (e.target as Element).closest?.('.spot') as HTMLElement | null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });
