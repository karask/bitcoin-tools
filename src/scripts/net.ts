import { currentNet, NET_NAME, parseNet } from '../lib/network';
const sel = document.getElementById('net-select') as HTMLSelectElement | null;
const banner = document.getElementById('net-banner');
const net = currentNet();
if (sel) {
  sel.value = net;
  sel.addEventListener('change', () => {
    const u = new URL(location.href);
    const n = parseNet(sel.value);
    if (n === 'mainnet') u.searchParams.delete('network'); else u.searchParams.set('network', n);
    u.searchParams.delete('cpfp');
    location.href = u.toString();
  });
}
if (banner && net !== 'mainnet') {
  banner.hidden = false;
  banner.innerHTML = `<strong>${NET_NAME[net]} — test coins, no value.</strong> Results come from mempool.space’s ${NET_NAME[net]} explorer. Prices are hidden on test networks.`;
}
