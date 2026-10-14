import { describe, it, expect } from 'vitest';
import { Transaction, OutScript, Address, NETWORK, p2wpkh, p2tr, p2pkh } from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { cpfpPackage, childVsize, checkSafety, buildChildPsbt, inputKindFromType } from '../src/lib/cpfp';

describe('package math', () => {
  it('parent only', () => {
    const r = cpfpPackage({ parentFee: 200, parentVsize: 200, childVsize: 110, targetRate: 10 });
    expect(r.childFee).toBe(2900); expect(r.packageRate).toBeCloseTo(10); expect(r.reason).toBe('package');
  });
  it('includes unconfirmed ancestors', () => {
    const r = cpfpPackage({ parentFee: 200, parentVsize: 200, ancestors: [{ fee: 300, vsize: 150 }], childVsize: 110, targetRate: 10 });
    expect(r.childFee).toBe(10 * (200 + 150 + 110) - 500); // 4100
    expect(r.packageRate).toBeCloseTo(10);
  });
  it('child pays at least target on its own', () => {
    const r = cpfpPackage({ parentFee: 100000, parentVsize: 200, childVsize: 110, targetRate: 10 });
    expect(r.childFee).toBe(1100); expect(r.reason).toBe('child-self');
  });
  it('respects min relay', () => {
    const r = cpfpPackage({ parentFee: 100000, parentVsize: 200, childVsize: 110, targetRate: 0.5, minRelay: 1 });
    expect(r.childFee).toBe(110); expect(r.reason).toBe('min-relay');
  });
});

describe('child vsize', () => {
  it('per script type', () => {
    expect(childVsize('p2wpkh', 'p2wpkh')).toBe(110);
    expect(childVsize('p2tr', 'p2tr')).toBe(111);
    expect(childVsize('p2sh-p2wpkh', 'p2wpkh')).toBe(133);
    expect(childVsize('p2pkh', 'p2pkh')).toBe(192);
  });
  it('refuses unknown types', () => {
    expect(inputKindFromType('v0_p2wsh')).toBeNull();
    expect(inputKindFromType('p2sh')).toBeNull();
    expect(inputKindFromType('p2sh', true)).toBe('p2sh-p2wpkh');
    expect(inputKindFromType('multisig')).toBeNull();
  });
});

describe('safety', () => {
  it('blocks negative', () => expect(checkSafety(1000, 2000, 'p2wpkh').ok).toBe(false));
  it('blocks dust', () => expect(checkSafety(1500, 1300, 'p2wpkh').ok).toBe(false));
  it('warns above 20%', () => { const s = checkSafety(10000, 2500, 'p2wpkh'); expect(s.ok && s.warn).toMatch(/25%/); });
  it('ok when cheap', () => { const s = checkSafety(100000, 1000, 'p2wpkh'); expect(s.ok && s.warn).toBe(null); });
});

const PRIV = hex.decode('0101010101010101010101010101010101010101010101010101010101010101');
const PUB = secp256k1.getPublicKey(PRIV, true);
const DEST = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const TXID = 'aa'.repeat(32);
function roundTrip(b64: string) { return Transaction.fromPSBT(base64.decode(b64)); }

describe('PSBT round-trip', () => {
  it('P2WPKH', () => {
    const script = p2wpkh(PUB).script;
    const { base64: b } = buildChildPsbt({ parentTxid: TXID, vout: 1, value: 50000, scriptHex: hex.encode(script), kind: 'p2wpkh', destination: DEST, sendValue: 48900, mainnet: true });
    const t = roundTrip(b);
    const i = t.getInput(0);
    expect(hex.encode(i.txid!)).toBe(TXID); expect(i.index).toBe(1); expect(i.sequence).toBe(0xfffffffd);
    expect(i.witnessUtxo!.amount).toBe(50000n); expect(hex.encode(i.witnessUtxo!.script)).toBe(hex.encode(script));
    const o = t.getOutput(0);
    expect(hex.encode(o.script!)).toBe(hex.encode(OutScript.encode(Address(NETWORK).decode(DEST))));
    expect(o.amount).toBe(48900n); expect(t.version).toBe(2); expect(t.inputsLength).toBe(1); expect(t.outputsLength).toBe(1);
    expect(50000 - Number(o.amount)).toBe(1100); // fee
  });
  it('P2TR', () => {
    const script = p2tr(schnorr.getPublicKey(PRIV)).script;
    const t = roundTrip(buildChildPsbt({ parentTxid: TXID, vout: 0, value: 30000, scriptHex: hex.encode(script), kind: 'p2tr', destination: DEST, sendValue: 28890, mainnet: true, locktime: 900000 }).base64);
    expect(t.getInput(0).witnessUtxo!.amount).toBe(30000n); expect(t.lockTime).toBe(900000);
    expect(t.getOutput(0).amount).toBe(28890n);
  });
  it('P2PKH uses nonWitnessUtxo', () => {
    const script = p2pkh(PUB).script;
    const parent = new Transaction({ allowUnknownInputs: true });
    parent.addOutput({ script, amount: 70000n });
    parent.addInput({ txid: 'bb'.repeat(32), index: 0, finalScriptSig: new Uint8Array([0]) });
    const parentHex = hex.encode(parent.toBytes(true, false));
    const parentTxid = parent.id;
    const t = roundTrip(buildChildPsbt({ parentTxid, vout: 0, value: 70000, scriptHex: hex.encode(script), kind: 'p2pkh', parentHex, destination: DEST, sendValue: 68000, mainnet: true }).base64);
    const i = t.getInput(0);
    expect(i.nonWitnessUtxo).toBeTruthy(); expect(i.witnessUtxo).toBeUndefined();
    expect(hex.encode(i.txid!)).toBe(parentTxid); expect(i.sequence).toBe(0xfffffffd);
    expect(t.getOutput(0).amount).toBe(68000n);
  });
});

import { parseAncestors, loadAncestors } from '../src/lib/cpfp';
describe('ancestor loading (refuse on failure)', () => {
  it('network failure -> refuses', async () => {
    expect((await loadAncestors(() => Promise.reject(new Error('timeout')))).ok).toBe(false);
  });
  it('malformed -> refuses', () => {
    expect(parseAncestors(null).ok).toBe(false);
    expect(parseAncestors({}).ok).toBe(false);
    expect(parseAncestors({ ancestors: 'x' }).ok).toBe(false);
    expect(parseAncestors({ ancestors: [{ fee: 'a', weight: 400 }] }).ok).toBe(false);
    expect(parseAncestors({ ancestors: [{ fee: 10 }] }).ok).toBe(false);
  });
  it('empty ancestors -> builds normally', async () => {
    const r = await loadAncestors(async () => ({ ancestors: [], effectiveFeePerVsize: 2 }));
    expect(r).toEqual({ ok: true, ancestors: [] });
    const pkg = cpfpPackage({ parentFee: 200, parentVsize: 200, ancestors: r.ok ? r.ancestors : [], childVsize: 110, targetRate: 10 });
    expect(pkg.childFee).toBe(2900);
  });
  it('ancestors present -> included in package', async () => {
    const r = await loadAncestors(async () => ({ ancestors: [{ txid: 'x', fee: 300, weight: 600 }] }));
    expect(r.ok && r.ancestors).toEqual([{ fee: 300, vsize: 150 }]);
    const pkg = cpfpPackage({ parentFee: 200, parentVsize: 200, ancestors: r.ok ? r.ancestors : [], childVsize: 110, targetRate: 10 });
    expect(pkg.childFee).toBe(4100); expect(pkg.packageVsize).toBe(460);
  });
});
