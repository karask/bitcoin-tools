/** Which Bitcoin network the mempool.space-backed tools talk to. Chosen via ?network= in the URL. */
export type Net = 'mainnet' | 'testnet4' | 'signet';
export const NETS: Record<Net, { label: string; api: string; web: string }> = {
  mainnet: { label: 'Mainnet (real bitcoin)', api: 'https://mempool.space/api', web: 'https://mempool.space' },
  testnet4: { label: 'Testnet4 (test coins, no value)', api: 'https://mempool.space/testnet4/api', web: 'https://mempool.space/testnet4' },
  signet: { label: 'Signet (test coins, no value)', api: 'https://mempool.space/signet/api', web: 'https://mempool.space/signet' },
};
export const NET_NAME: Record<Net, string> = { mainnet: 'mainnet', testnet4: 'Testnet4', signet: 'Signet' };

export function parseNet(v: string | null | undefined): Net {
  return v === 'testnet4' || v === 'signet' ? v : 'mainnet';
}
export function currentNet(): Net {
  if (typeof location === 'undefined') return 'mainnet';
  return parseNet(new URLSearchParams(location.search).get('network'));
}
export const isTestNet = (n: Net) => n !== 'mainnet';
/** Does an address network from decodeAddress() belong on the selected network? Testnet and signet share address formats (tb1…/m…/n…/2…). */
export function addressFitsNet(addrNet: string, net: Net): boolean {
  return net === 'mainnet' ? addrNet === 'mainnet' : addrNet === 'testnet/signet';
}
/** Plain-English mismatch message, or null if it fits. */
export function netMismatch(addrNet: string, net: Net): string | null {
  if (addressFitsNet(addrNet, net)) return null;
  if (net === 'mainnet') return addrNet === 'testnet/signet'
    ? 'This is a test-network address (testnet or signet). Switch the network selector above to Testnet4 or Signet to look it up.'
    : 'This address is for a local regtest network, which mempool.space cannot see.';
  return addrNet === 'mainnet'
    ? `This is a real-bitcoin (mainnet) address, but the network selector is set to ${NET_NAME[net]}. Switch it to Mainnet to look it up.`
    : `This address is for a local regtest network, which mempool.space cannot see.`;
}
/** Keep the selected network in links to other tool pages. */
export function withNet(href: string, net: Net = currentNet()): string {
  if (net === 'mainnet') return href;
  const [pathq, hash = ''] = href.split('#');
  return `${pathq}${pathq.includes('?') ? '&' : '?'}network=${net}${hash ? '#' + hash : ''}`;
}
