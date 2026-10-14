import { describe, it, expect } from 'vitest';
import { signalsRbf, estimateVsize, cpfpChildFee, packageRate, rbfReplacementFee, vsizeFromWeight, analyzeStuck, describeLocktime, guessChange, opReturnData, type Tx } from '../src/lib/tx';

const vin = (sequence: number) => ({ txid: 'a'.repeat(64), vout: 0, prevout: { scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qin', value: 100000 }, scriptsig: '', witness: ['00'], is_coinbase: false, sequence });
const fees = { fastestFee: 20, halfHourFee: 15, hourFee: 10, economyFee: 5, minimumFee: 1 };
function mkTx(p: Partial<Tx>): Tx {
  return { txid: 'b'.repeat(64), version: 2, locktime: 0, vin: [vin(0xffffffff)], vout: [{ scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qx', value: 50000 }], size: 200, weight: 564, fee: 282, status: { confirmed: false }, ...p };
}

describe('RBF', () => {
  it('final sequences do not signal', () => expect(signalsRbf({ vin: [vin(0xffffffff), vin(0xfffffffe)] })).toBe(false));
  it('any sequence < 0xfffffffe signals', () => expect(signalsRbf({ vin: [vin(0xffffffff), vin(0xfffffffd)] })).toBe(true));
  it('replacement fee respects incremental relay', () => {
    expect(rbfReplacementFee(1410, 141, 10.5)).toBe(1551); // 1410 + 141
    expect(rbfReplacementFee(141, 141, 20)).toBe(2820);
  });
});

describe('size & fee math', () => {
  it('typical vsizes', () => {
    expect(estimateVsize('p2wpkh', 1, 2)).toBe(141);
    expect(estimateVsize('p2tr', 1, 2)).toBe(154);
    expect(estimateVsize('p2pkh', 1, 2)).toBe(226);
    expect(estimateVsize('p2sh-p2wpkh', 1, 2)).toBe(166);
  });
  it('vsize rounds weight up', () => { expect(vsizeFromWeight(561)).toBe(141); expect(vsizeFromWeight(564)).toBe(141); });
});

describe('CPFP', () => {
  it('child fee brings package to target', () => {
    const child = cpfpChildFee(200, 200, 110, 10);
    expect(child).toBe(2900);
    expect(packageRate(200, 200, child, 110)).toBeCloseTo(10);
  });
  it('child pays at least its own relay fee', () => {
    expect(cpfpChildFee(10000, 200, 110, 5)).toBe(110);
  });
});

describe('stuck analysis', () => {
  it('confirmed', () => expect(analyzeStuck(mkTx({ status: { confirmed: true } }), fees).advice).toBe('confirmed'));
  it('wait when rate is fine', () => expect(analyzeStuck(mkTx({ fee: 141 * 12 }), fees).advice).toBe('wait'));
  it('rbf-or-cpfp when low, signalling, spendable', () => expect(analyzeStuck(mkTx({ vin: [vin(0xfffffffd)] }), fees).advice).toBe('rbf-or-cpfp'));
  it('cpfp when not signalling', () => expect(analyzeStuck(mkTx({}), fees).advice).toBe('cpfp'));
  it('wait-or-accelerate when no spendable output', () =>
    expect(analyzeStuck(mkTx({}), fees, { outspends: [{ spent: true }] }).advice).toBe('wait-or-accelerate'));
  it('uses effective (ancestor) rate if given', () => expect(analyzeStuck(mkTx({}), fees, { effectiveRate: 11 }).advice).toBe('wait'));
});

describe('misc', () => {
  it('locktime', () => {
    expect(describeLocktime(0).kind).toBe('none');
    expect(describeLocktime(840000).kind).toBe('height');
    expect(describeLocktime(1700000000).kind).toBe('time');
  });
  it('change by round amount', () => {
    const t = mkTx({ vout: [
      { scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qa', value: 1_000_000 },
      { scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qb', value: 1_234_567 },
    ] });
    expect(guessChange(t)?.index).toBe(1);
  });
  it('op_return text', () => {
    expect(opReturnData({ scriptpubkey: '6a0568656c6c6f', scriptpubkey_type: 'op_return', value: 0 })?.text).toBe('hello');
  });
});
