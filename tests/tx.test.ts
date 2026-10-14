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

describe('per-type dust (B2)', () => {
  const o = (t: string, value: number) => ({ scriptpubkey: '', scriptpubkey_type: t, scriptpubkey_address: 'x', value });
  it('a 300-sat P2WPKH output is spendable (dust is 294, not 546)', () => {
    expect(analyzeStuck(mkTx({ vout: [o('v0_p2wpkh', 300)] }), fees).spendableOutputs).toEqual([0]);
  });
  it('per-type thresholds', () => {
    const tx = mkTx({ vout: [o('v0_p2wpkh', 293), o('p2pkh', 545), o('p2pkh', 546), o('p2sh', 540), o('v1_p2tr', 330), o('v0_p2wsh', 329)] });
    expect(analyzeStuck(tx, fees).spendableOutputs).toEqual([2, 3, 4]);
  });
});

import { bumpTarget, blocksAhead, type MempoolBlock } from '../src/lib/tx';
describe('bump target from projected blocks (B7)', () => {
  const flat = { fastestFee: 1, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 };
  const full = (median: number, min: number): MempoolBlock => ({ blockVSize: 997_000, medianFee: median, feeRange: [min, median, median * 2] });
  it('flat 1 sat/vB estimates + full next block → above its median, not 1', () => {
    const t = bumpTarget(flat, [full(1.99, 1.01), full(1.0, 1.0)]);
    expect(t.source).toBe('projected'); expect(t.rate).toBeCloseTo(2.1);
  });
  it('never below the half-hour estimate', () => {
    expect(bumpTarget({ ...flat, halfHourFee: 15 }, [full(3, 2)]).rate).toBe(15);
  });
  it('next block not full → just above its lowest fee', () => {
    expect(bumpTarget(flat, [{ blockVSize: 250_000, medianFee: 0, feeRange: [0.5, 1, 2] }])).toMatchObject({ rate: 1, source: 'projected' });
  });
  it('median 0 (bad data) uses the middle of the fee range', () => {
    expect(bumpTarget(flat, [{ blockVSize: 999_000, medianFee: 0, feeRange: [1, 1.004, 3] }]).rate).toBeCloseTo(1.2);
  });
  it('falls back to estimate + margin when projections fail or are malformed', () => {
    expect(bumpTarget(flat, null)).toMatchObject({ rate: 1.2, source: 'estimate' });
    expect(bumpTarget({ ...flat, halfHourFee: 20 }, [])).toMatchObject({ rate: 22, source: 'estimate' });
    expect(bumpTarget(flat, [{ blockVSize: NaN, medianFee: 1, feeRange: [] } as MempoolBlock]).source).toBe('estimate');
  });
  it('blocksAhead finds position behind full blocks', () => {
    const bs = [full(2, 1.05), full(1.03, 1.01), { blockVSize: 255_000, medianFee: 1, feeRange: [1, 1] }];
    expect(blocksAhead(1.0, bs)).toBe(2); expect(blocksAhead(1.02, bs)).toBe(1); expect(blocksAhead(3, bs)).toBe(0);
  });
  it('analyzeStuck: 1 sat/vB tx behind 3+ full blocks is not "wait" even when all estimates are 1', () => {
    const bs = [full(2, 1.05), full(1.5, 1.02), full(1.2, 1.01), full(1.1, 1.005)];
    const a = analyzeStuck(mkTx({ fee: 141, vin: [vin(0xfffffffd)] }), flat, { blocks: bs });
    expect(a.advice).not.toBe('wait'); expect(a.targetRate).toBeCloseTo(2.1); expect(a.targetSource).toBe('projected');
    expect(a.cpfpChildFee).toBe(Math.ceil(2.1 * (141 + 110)) - 141);
  });
  it('analyzeStuck: in the next projected block → wait', () => {
    expect(analyzeStuck(mkTx({ fee: 141 * 3 }), flat, { blocks: [full(2, 1.05)] }).advice).toBe('wait');
  });
});

describe('below minimum fee never says wait (B8)', () => {
  const flat = { fastestFee: 1, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 };
  const notFull: MempoolBlock[] = [{ blockVSize: 183_579, medianFee: 0, feeRange: [0.107, 1, 3] }];
  it('Signet repro: 0.106 sat/vB, next block not full → bump, target ≥ 1', () => {
    const a = analyzeStuck(mkTx({ fee: 15, weight: 564, vin: [vin(0xfffffffd)] }), flat, { blocks: notFull });
    expect(a.position).toBe('below-minimum'); expect(a.advice).not.toBe('wait');
    expect(a.targetRate).toBe(2); expect(a.rbfFee).toBe(282); expect(a.cpfpChildFee).toBe(487); // B9: minimum + 1 for a below-minimum parent
  });
  it('also without projections', () => {
    expect(analyzeStuck(mkTx({ fee: 15, vin: [vin(0xfffffffd)] }), { ...flat, hourFee: 0.1 }).advice).not.toBe('wait');
  });
  it('target respects a higher minimumFee; defaults to 1 if missing', () => {
    expect(bumpTarget({ ...flat, minimumFee: 3 }, notFull).rate).toBe(3);
    expect(bumpTarget({ ...flat, minimumFee: 0 }, notFull).rate).toBe(1);
    expect(bumpTarget({ ...flat, halfHourFee: 0.5, minimumFee: NaN as unknown as number }, null).rate).toBe(1);
  });
  it('at the minimum in a non-full block still waits', () => {
    expect(analyzeStuck(mkTx({ fee: 141 }), flat, { blocks: notFull }).advice).toBe('wait');
  });
});

describe('low-fee parent lifted by a child (B9)', () => {
  const flat = { fastestFee: 1, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 };
  const notFull: MempoolBlock[] = [{ blockVSize: 345_000, medianFee: 0, feeRange: [0.107, 1, 3] }];
  it('bumpTarget: parent below minimum → at least minimum + 1', () => {
    expect(bumpTarget(flat, notFull, 0.106)).toMatchObject({ rate: 2, lowParent: true });
    expect(bumpTarget({ ...flat, minimumFee: 2 }, null, 0.5).rate).toBe(3);
  });
  it('bumpTarget: higher projected target still wins', () => {
    const full: MempoolBlock[] = [{ blockVSize: 998_000, medianFee: 4, feeRange: [3, 4, 9] }];
    expect(bumpTarget(flat, full, 0.1).rate).toBeCloseTo(4.1);
  });
  it('bumpTarget: normal parent unaffected', () => {
    expect(bumpTarget(flat, notFull, 1.5)).toMatchObject({ rate: 1, lowParent: false });
    expect(bumpTarget(flat, notFull)).toMatchObject({ rate: 1, lowParent: false });
  });
  it('Retest 3 repro: own 0.106, package 1.006 → not "wait", target 2, fees sized for 2 sat/vB', () => {
    const a = analyzeStuck(mkTx({ fee: 15, weight: 564, vin: [vin(0xfffffffd)] }), flat, { effectiveRate: 1.006, blocks: notFull });
    expect(a.lowParent).toBe(true); expect(a.advice).not.toBe('wait'); expect(a.targetRate).toBe(2);
    expect(a.cpfpChildFee).toBe(Math.ceil(2 * (141 + 110)) - 15);
  });
  it('package already above minimum + 1 → wait (with lowParent flag for the note)', () => {
    const a = analyzeStuck(mkTx({ fee: 15, weight: 564 }), flat, { effectiveRate: 3, blocks: notFull });
    expect(a.advice).toBe('wait'); expect(a.lowParent).toBe(true);
  });
});
