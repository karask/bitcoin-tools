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

import { knownEarlyP2pk } from '../src/lib/quantum';
import { decodeAddress, toHex } from '../src/lib/address';
describe('early P2PK keys (B1)', () => {
  const zero = { funded_txo_count: 1, funded_txo_sum: 5e9, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 1 };
  const empty = { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 };
  const stats = { chain_stats: zero, mempool_stats: empty };
  const h = (a: string) => { const d = decodeAddress(a); if (!d.valid) throw new Error(a); return toHex(d.program!); };
  for (const [a, blk] of [['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 0], ['12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S', 9], ['1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1', 2]] as const) {
    it(`${a} (block ${blk} P2PK) is exposed even though never spent`, () => {
      expect(knownEarlyP2pk(h(a))).toBe(true);
      const r = classifyExposure('P2PKH', stats, h(a));
      expect(r.exposure).toBe('exposed');
      expect(r.reason).toMatch(/P2PK/);
    });
  }
  it('an unrelated never-spent address is only "not revealed by its own history"', () => {
    const r = classifyExposure('P2WPKH', stats, h('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'));
    expect(r.exposure).toBe('not-exposed');
    expect(r.reason).toMatch(/not a guarantee/);
  });
});
