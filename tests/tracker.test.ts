import { describe, it, expect } from 'vitest';
import { trackTx, incomingFromTxs, confirmations, etaWording, NOT_FOUND_NOTE } from '../src/lib/tracker';
import type { Tx } from '../src/lib/tx';

const fees = { fastestFee: 20, halfHourFee: 15, hourFee: 10, economyFee: 5, minimumFee: 1 };
const tx = (p: Partial<Tx> & { fee?: number; weight?: number; status?: Tx['status'] }): Tx => ({
  txid: 'a'.repeat(64), version: 2, locktime: 0,
  vin: [{ txid: 'b'.repeat(64), vout: 0, prevout: { scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qin', value: 100000 }, scriptsig: '', is_coinbase: false, sequence: 0xfffffffd }],
  vout: [{ scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qout', value: 50000 }],
  size: 200, weight: 564, fee: 2820, status: { confirmed: false }, ...p,
});

describe('tracker', () => {
  it('not-found is honest', () => {
    const s = trackTx(null, 800000, fees);
    expect(s.kind).toBe('not-found');
    expect(s.notFoundNote).toBe(NOT_FOUND_NOTE);
    expect(s.notFoundNote.toLowerCase()).not.toMatch(/failed/);
  });
  it('confirmed with confirmations', () => {
    const s = trackTx(tx({ status: { confirmed: true, block_height: 800000, block_time: 1 }, fee: 1000 }), 800005, fees);
    expect(s.kind).toBe('confirmed');
    expect(s.confirmations).toBe(6);
    expect(confirmations(800000, 800005)).toBe(6);
  });
  it('mempool with RBF and ETA', () => {
    const s = trackTx(tx({ fee: 141 * 12 }), 800000, fees); // ~12 sat/vB on 141 vB
    expect(s.kind).toBe('mempool');
    expect(s.rbf).toBe(true);
    expect(s.eta).toMatch(/hour|half/i);
  });
  it('ETA wording bands', () => {
    expect(etaWording(25, fees)).toMatch(/next block/);
    expect(etaWording(6, fees)).toMatch(/low side|quieter/);
    expect(etaWording(0.5, fees)).toMatch(/below/);
  });
  it('incoming payments', () => {
    const a = 'bc1qout';
    const list = incomingFromTxs([
      tx({ txid: '1'.repeat(64), status: { confirmed: true, block_height: 10 }, vout: [{ scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: a, value: 1234 }] }),
      tx({ txid: '2'.repeat(64), status: { confirmed: false }, vout: [{ scriptpubkey: '', scriptpubkey_type: 'v0_p2wpkh', scriptpubkey_address: 'bc1qother', value: 99 }] }),
    ], a, 20);
    expect(list).toHaveLength(1);
    expect(list[0].value).toBe(1234);
    expect(list[0].confirmations).toBe(11);
  });
});
