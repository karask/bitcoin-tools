import type { Tx, RecommendedFees } from './tx';
import { signalsRbf, feeRate } from './tx';

export type TxStatusKind = 'confirmed' | 'mempool' | 'not-found';

export interface TxTrackStatus {
  kind: TxStatusKind;
  confirmations?: number;
  blockHeight?: number;
  blockTime?: number;
  feeRate?: number;
  rbf?: boolean;
  /** Rough ETA wording vs current market — never a promise. */
  eta?: string;
  /** Honest uncertainty for not-found. */
  notFoundNote: string;
}

export const NOT_FOUND_NOTE =
  'This transaction was not found on Bitcoin mainnet. That can mean a typo in the ID, that it was never broadcast, that it was replaced (RBF) by a different transaction, that it was dropped from mempools, or that it belongs to a different network (testnet/signet). We cannot tell which from here.';

export function confirmations(blockHeight: number, tipHeight: number): number {
  return Math.max(0, tipHeight - blockHeight + 1);
}

export function etaWording(rate: number, fees: RecommendedFees): string {
  if (rate >= fees.fastestFee) return 'At the current fee market, a transaction paying this rate is usually included in the next block or two (about 10–20 minutes), though block times vary.';
  if (rate >= fees.halfHourFee) return 'At the current fee market, this rate often confirms within about half an hour, but that is only an estimate.';
  if (rate >= fees.hourFee) return 'At the current fee market, this rate often confirms within about an hour, but quieter or busier periods can change that.';
  if (rate >= fees.economyFee) return 'This fee is on the low side for current demand. It may wait until the network gets quieter — that can take hours or longer.';
  return 'This fee is below what most queues are currently requiring. It may wait a long time, or be dropped from some mempools. It is not gone forever if it never confirms — the sender can spend the coins again later.';
}

export function trackTx(
  tx: Tx | null,
  tipHeight: number,
  fees: RecommendedFees,
): TxTrackStatus {
  if (!tx) return { kind: 'not-found', notFoundNote: NOT_FOUND_NOTE };
  if (tx.status.confirmed && tx.status.block_height != null) {
    return {
      kind: 'confirmed',
      confirmations: confirmations(tx.status.block_height, tipHeight),
      blockHeight: tx.status.block_height,
      blockTime: tx.status.block_time,
      feeRate: feeRate(tx.fee, tx.weight / 4),
      rbf: signalsRbf(tx),
      notFoundNote: NOT_FOUND_NOTE,
    };
  }
  const rate = feeRate(tx.fee, tx.weight / 4);
  return {
    kind: 'mempool',
    feeRate: rate,
    rbf: signalsRbf(tx),
    eta: etaWording(rate, fees),
    notFoundNote: NOT_FOUND_NOTE,
  };
}

export interface IncomingPayment {
  txid: string;
  value: number; // sats received into the watched address in this tx
  status: 'confirmed' | 'mempool';
  confirmations?: number;
  blockTime?: number;
  feeRate: number;
}

/** Summarise value paid TO `address` in a tx (sum of matching vouts). */
export function valueToAddress(tx: Tx, address: string): number {
  return tx.vout.reduce((s, o) => s + (o.scriptpubkey_address === address ? o.value : 0), 0);
}

export function incomingFromTxs(txs: Tx[], address: string, tipHeight: number): IncomingPayment[] {
  return txs
    .map((tx): IncomingPayment | null => {
      const value = valueToAddress(tx, address);
      if (value <= 0) return null;
      const confirmed = !!tx.status.confirmed;
      return {
        txid: tx.txid,
        value,
        status: confirmed ? 'confirmed' as const : 'mempool' as const,
        confirmations: confirmed && tx.status.block_height != null
          ? confirmations(tx.status.block_height, tipHeight) : undefined,
        blockTime: tx.status.block_time,
        feeRate: feeRate(tx.fee, tx.weight / 4),
      };
    })
    .filter((x): x is IncomingPayment => x !== null);
}
