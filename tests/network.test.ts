import { describe, it, expect } from 'vitest';
import { parseNet, NETS, addressFitsNet, netMismatch, withNet } from '../src/lib/network';
import { decodeAddress } from '../src/lib/address';
import { buildChildPsbt } from '../src/lib/cpfp';
import { Transaction, p2wpkh, TEST_NETWORK, Address, OutScript } from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1.js';

describe('network selection (B6)', () => {
  it('parses ?network values, defaulting to mainnet', () => {
    expect(parseNet(null)).toBe('mainnet'); expect(parseNet('signet')).toBe('signet'); expect(parseNet('testnet4')).toBe('testnet4'); expect(parseNet('evil')).toBe('mainnet');
  });
  it('API bases are mempool.space only', () => {
    expect(NETS.mainnet.api).toBe('https://mempool.space/api');
    expect(NETS.signet.api).toBe('https://mempool.space/signet/api');
    expect(NETS.testnet4.api).toBe('https://mempool.space/testnet4/api');
    for (const n of Object.values(NETS)) expect(n.api.startsWith('https://mempool.space/')).toBe(true);
  });
  it('validates address network against selection', () => {
    const tb = decodeAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx');
    const bc = decodeAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
    expect(tb.valid && bc.valid).toBe(true);
    if (!tb.valid || !bc.valid) return;
    expect(addressFitsNet(tb.network, 'signet')).toBe(true);
    expect(addressFitsNet(tb.network, 'testnet4')).toBe(true);
    expect(addressFitsNet(tb.network, 'mainnet')).toBe(false);
    expect(addressFitsNet(bc.network, 'signet')).toBe(false);
    expect(netMismatch(bc.network, 'signet')).toMatch(/Switch it to Mainnet/);
    expect(netMismatch(tb.network, 'mainnet')).toMatch(/Testnet4 or Signet/);
    expect(netMismatch(bc.network, 'mainnet')).toBeNull();
  });
  it('keeps the network in links', () => {
    expect(withNet('?cpfp=ab#cpfp', 'signet')).toBe('?cpfp=ab&network=signet#cpfp');
    expect(withNet('?cpfp=ab#cpfp', 'mainnet')).toBe('?cpfp=ab#cpfp');
  });
  it('CPFP builds a test-network PSBT with a tb1 destination', () => {
    const pub = secp256k1.getPublicKey(new Uint8Array(32).fill(7), true);
    const script = p2wpkh(pub, TEST_NETWORK).script;
    const dest = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
    const { base64: b } = buildChildPsbt({ parentTxid: 'cc'.repeat(32), vout: 0, value: 20000, scriptHex: hex.encode(script), kind: 'p2wpkh', destination: dest, sendValue: 18000, mainnet: false });
    const t = Transaction.fromPSBT(base64.decode(b));
    expect(hex.encode(t.getOutput(0).script!)).toBe(hex.encode(OutScript.encode(Address(TEST_NETWORK).decode(dest))));
    expect(() => buildChildPsbt({ parentTxid: 'cc'.repeat(32), vout: 0, value: 20000, scriptHex: hex.encode(script), kind: 'p2wpkh', destination: dest, sendValue: 18000, mainnet: true })).toThrow();
  });
});
