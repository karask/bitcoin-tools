import { describe, it, expect } from 'vitest';
import { classifyExposure } from '../src/lib/quantum';
const z = { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 };
const stats = (c: Partial<typeof z>, m: Partial<typeof z> = {}) => ({ chain_stats: { ...z, ...c }, mempool_stats: { ...z, ...m } });

describe('quantum exposure', () => {
  it('P2PK always exposed', () => expect(classifyExposure('P2PK').exposure).toBe('exposed'));
  it('P2TR exposed', () => expect(classifyExposure('P2TR', stats({})).exposure).toBe('exposed'));
  it('unspent P2WPKH not exposed', () => expect(classifyExposure('P2WPKH', stats({ funded_txo_count: 1, funded_txo_sum: 1000 })).exposure).toBe('not-exposed'));
  it('spent P2PKH exposed, reuse with balance', () => {
    const r = classifyExposure('P2PKH', stats({ funded_txo_count: 2, funded_txo_sum: 3000, spent_txo_count: 1, spent_txo_sum: 1000 }));
    expect(r.exposure).toBe('exposed'); expect(r.reusedWithBalance).toBe(true); expect(r.balance).toBe(2000);
  });
  it('mempool spend counts', () => expect(classifyExposure('P2WPKH', stats({ funded_txo_count: 1, funded_txo_sum: 1000 }, { spent_txo_count: 1, spent_txo_sum: 1000 })).exposure).toBe('exposed'));
  it('spent P2SH depends', () => expect(classifyExposure('P2SH', stats({ funded_txo_count: 1, funded_txo_sum: 1, spent_txo_count: 1, spent_txo_sum: 1 })).exposure).toBe('depends'));
  it('P2WSH unspent not exposed', () => expect(classifyExposure('P2WSH', stats({})).exposure).toBe('not-exposed'));
  it('P2A n/a', () => expect(classifyExposure('P2A').exposure).toBe('not-applicable'));
});
