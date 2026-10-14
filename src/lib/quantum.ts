import type { AddressType } from './address';

export interface ChainStats { funded_txo_count: number; funded_txo_sum: number; spent_txo_count: number; spent_txo_sum: number; tx_count: number; }
export interface AddressStats { chain_stats: ChainStats; mempool_stats: ChainStats; }

export type Exposure = 'exposed' | 'not-exposed' | 'depends' | 'not-applicable' | 'unknown';
export interface QuantumResult {
  exposure: Exposure;
  reason: string;
  balance: number; // confirmed + mempool, sats
  everSpent: boolean;
  reusedWithBalance: boolean;
}

export function balanceOf(s: AddressStats): number {
  return s.chain_stats.funded_txo_sum - s.chain_stats.spent_txo_sum + s.mempool_stats.funded_txo_sum - s.mempool_stats.spent_txo_sum;
}

/** Classify public-key exposure. `stats` may be omitted for types that do not need on-chain data. */
export function classifyExposure(type: AddressType | 'P2PK', stats?: AddressStats): QuantumResult {
  const balance = stats ? balanceOf(stats) : 0;
  const everSpent = stats ? stats.chain_stats.spent_txo_count + stats.mempool_stats.spent_txo_count > 0 : false;
  const reusedWithBalance = everSpent && balance > 0;
  const r = (exposure: Exposure, reason: string): QuantumResult => ({ exposure, reason, balance, everSpent, reusedWithBalance });
  switch (type) {
    case 'P2PK':
      return r('exposed', 'Pay-to-public-key outputs put the full public key directly on the blockchain, so it is always visible.');
    case 'P2TR':
      return r('exposed', 'Taproot addresses contain a (tweaked) public key directly in the address, so the key is visible to anyone who sees the address — even before it is spent from.');
    case 'P2PKH':
    case 'P2WPKH':
      if (!stats) return r('unknown', 'On-chain history is needed to tell whether the public key has been revealed.');
      return everSpent
        ? r('exposed', 'This address has been spent from at least once. Spending reveals the public key on the blockchain, so it is now public.')
        : r('not-exposed', 'This address only shows a hash of the public key, and it has never been spent from, so the public key has not been revealed on-chain (as far as the blockchain shows).');
    case 'P2SH':
    case 'P2WSH':
      if (!stats) return r('unknown', 'On-chain history is needed to tell whether the script has been revealed.');
      return everSpent
        ? r('depends', 'This address has been spent from, so its script was revealed. Whether public keys were exposed depends on that script: for wrapped SegWit (P2SH-P2WPKH) and most multisig setups, the public keys are now visible.')
        : r('not-exposed', 'This address only shows a hash of its script, and it has never been spent from, so the script and its keys have not been revealed on-chain (as far as the blockchain shows).');
    case 'P2A':
      return r('not-applicable', 'Pay-to-Anchor outputs contain no public key at all; they are anyone-can-spend anchors used for fee bumping.');
    default:
      return r('unknown', 'This address uses a SegWit version whose rules are not defined yet, so exposure cannot be determined.');
  }
}
