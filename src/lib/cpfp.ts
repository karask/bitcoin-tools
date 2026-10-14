/** Receiver-side CPFP: package math, child size estimate, safety checks and unsigned PSBT. */
import { Transaction, OutScript, Address, NETWORK, TEST_NETWORK } from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';

export type InputKind = 'p2wpkh' | 'p2tr' | 'p2sh-p2wpkh' | 'p2pkh';
export type OutKind = 'p2wpkh' | 'p2tr' | 'p2sh' | 'p2pkh' | 'p2wsh';

// Typical vbytes (ECDSA sig ≈72 B worst-ish; Taproot key-path 64-B Schnorr sig).
export const INPUT_VB: Record<InputKind, number> = { p2wpkh: 68, p2tr: 57.5, 'p2sh-p2wpkh': 91, p2pkh: 148 };
export const OUTPUT_VB: Record<OutKind, number> = { p2wpkh: 31, p2tr: 43, p2sh: 32, p2pkh: 34, p2wsh: 43 };
/** Bitcoin Core default dust thresholds at 3 sat/vB dust relay fee. */
export const DUST: Record<OutKind, number> = { p2pkh: 546, p2sh: 540, p2wpkh: 294, p2wsh: 330, p2tr: 330 };

/** mempool.space scriptpubkey_type → input kind we can size. P2SH needs the user to confirm it's wrapped SegWit. */
export function inputKindFromType(t: string, p2shIsWrappedSegwit = false): InputKind | null {
  if (t === 'v0_p2wpkh') return 'p2wpkh';
  if (t === 'v1_p2tr') return 'p2tr';
  if (t === 'p2pkh') return 'p2pkh';
  if (t === 'p2sh' && p2shIsWrappedSegwit) return 'p2sh-p2wpkh';
  return null; // p2wsh, bare/unknown multisig, p2pk, unconfirmed p2sh type …
}
export function outKindFromAddressType(t: string): OutKind | null {
  return ({ P2PKH: 'p2pkh', P2SH: 'p2sh', P2WPKH: 'p2wpkh', P2WSH: 'p2wsh', P2TR: 'p2tr' } as Record<string, OutKind>)[t] ?? null;
}

/** 1-input → 1-output child vsize (rounded up). */
export function childVsize(input: InputKind, output: OutKind): number {
  const segwit = input !== 'p2pkh';
  return Math.ceil(10 + (segwit ? 0.5 : 0) + INPUT_VB[input] + OUTPUT_VB[output]);
}

export interface Ancestor { fee: number; vsize: number }
export interface PackageInput {
  parentFee: number; parentVsize: number;
  /** Unconfirmed ancestors of the parent (they must be mined too). */
  ancestors?: Ancestor[];
  childVsize: number; targetRate: number; minRelay?: number;
}
export interface PackageResult { childFee: number; childRate: number; packageFee: number; packageVsize: number; packageRate: number; currentRate: number; reason: 'package' | 'child-self' | 'min-relay' }

export function cpfpPackage(p: PackageInput): PackageResult {
  const anc = p.ancestors ?? [];
  const baseFee = p.parentFee + anc.reduce((s, a) => s + a.fee, 0);
  const baseV = p.parentVsize + anc.reduce((s, a) => s + a.vsize, 0);
  const forPackage = Math.ceil(p.targetRate * (baseV + p.childVsize) - baseFee);
  const forSelf = Math.ceil(p.targetRate * p.childVsize);       // child must itself pay ≥ target
  const forRelay = Math.ceil((p.minRelay ?? 1) * p.childVsize);  // and ≥ min relay
  const childFee = Math.max(forPackage, forSelf, forRelay);
  const reason = childFee === forPackage ? 'package' : childFee === forSelf ? 'child-self' : 'min-relay';
  return {
    childFee, childRate: childFee / p.childVsize,
    packageFee: baseFee + childFee, packageVsize: baseV + p.childVsize,
    packageRate: (baseFee + childFee) / (baseV + p.childVsize),
    currentRate: baseFee / baseV, reason,
  };
}

export type Safety = { ok: true; sendValue: number; feeShare: number; warn: string | null } | { ok: false; error: string };
export function checkSafety(value: number, childFee: number, out: OutKind): Safety {
  const sendValue = value - childFee;
  if (sendValue < 0) return { ok: false, error: `The fee needed (${childFee.toLocaleString()} sats) is larger than the output itself (${value.toLocaleString()} sats). CPFP from this output cannot work at this target — pick a slower target, or wait.` };
  if (sendValue < DUST[out]) return { ok: false, error: `After the fee, only ${sendValue.toLocaleString()} sats would remain, below the ${DUST[out]}-sat dust limit for this destination type. Nodes would refuse to relay it. Pick a slower target, or wait.` };
  const feeShare = childFee / value;
  const warn = feeShare > 0.5
    ? `Warning: the fee would be ${(feeShare * 100).toFixed(0)}% of this output. You would lose more than half of it to fees. Waiting is probably better.`
    : feeShare > 0.2 ? `Heads up: the fee is ${(feeShare * 100).toFixed(0)}% of this output — expensive. Consider a slower target or waiting.` : null;
  return { ok: true, sendValue, feeShare, warn };
}

export interface ChildPsbtInput {
  parentTxid: string; vout: number; value: number; scriptHex: string; kind: InputKind;
  parentHex?: string; destination: string; sendValue: number; mainnet: boolean; locktime?: number;
}
export function buildChildPsbt(c: ChildPsbtInput): { base64: string; bytes: Uint8Array } {
  const net = c.mainnet ? NETWORK : TEST_NETWORK;
  const tx = new Transaction({ version: 2, lockTime: c.locktime ?? 0, allowUnknownOutputs: false });
  const input: Parameters<Transaction['addInput']>[0] = {
    txid: c.parentTxid, index: c.vout, sequence: 0xfffffffd,
    witnessUtxo: { script: hex.decode(c.scriptHex), amount: BigInt(c.value) },
  };
  if (c.kind === 'p2pkh') {
    if (!c.parentHex) throw new Error('Legacy (P2PKH) inputs need the full parent transaction.');
    input.nonWitnessUtxo = hex.decode(c.parentHex);
    delete (input as { witnessUtxo?: unknown }).witnessUtxo;
  }
  tx.addInput(input);
  tx.addOutput({ script: OutScript.encode(Address(net).decode(c.destination)), amount: BigInt(c.sendValue) });
  const bytes = tx.toPSBT();
  return { base64: base64.encode(bytes), bytes };
}
