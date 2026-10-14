// Pure transaction logic. Data shapes follow the mempool.space (Esplora) REST API.
export interface Prevout { scriptpubkey: string; scriptpubkey_type: string; scriptpubkey_address?: string; value: number; }
export interface Vin {
  txid: string; vout: number; prevout: Prevout | null; scriptsig: string; witness?: string[];
  is_coinbase: boolean; sequence: number; inner_redeemscript_asm?: string; inner_witnessscript_asm?: string;
}
export interface Vout { scriptpubkey: string; scriptpubkey_asm?: string; scriptpubkey_type: string; scriptpubkey_address?: string; value: number; }
export interface TxStatus { confirmed: boolean; block_height?: number; block_hash?: string; block_time?: number; }
export interface Tx {
  txid: string; version: number; locktime: number; vin: Vin[]; vout: Vout[];
  size: number; weight: number; fee: number; status: TxStatus;
}
export interface RecommendedFees { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number; minimumFee: number; }

export const SEQUENCE_FINAL = 0xffffffff;
export const RBF_THRESHOLD = 0xfffffffe;

/** BIP-125 opt-in signalling: any input with nSequence < 0xfffffffe. */
export function signalsRbf(tx: Pick<Tx, 'vin'>): boolean {
  return tx.vin.some((i) => i.sequence < RBF_THRESHOLD);
}
/** nLockTime is enforced only if at least one input has a non-final sequence. */
export function locktimeEnforced(tx: Pick<Tx, 'vin'>): boolean {
  return tx.vin.some((i) => i.sequence !== SEQUENCE_FINAL);
}
export function describeLocktime(locktime: number): { kind: 'none' | 'height' | 'time'; value: number } {
  if (locktime === 0) return { kind: 'none', value: 0 };
  return locktime < 500_000_000 ? { kind: 'height', value: locktime } : { kind: 'time', value: locktime };
}

export function vsizeFromWeight(weight: number): number { return Math.ceil(weight / 4); }
export function feeRate(fee: number, vsize: number): number { return vsize > 0 ? fee / vsize : 0; }
export function txFeeRate(tx: Pick<Tx, 'fee' | 'weight'>): number { return feeRate(tx.fee, tx.weight / 4); }
export function isSegwit(tx: Pick<Tx, 'vin'>): boolean { return tx.vin.some((i) => (i.witness?.length ?? 0) > 0); }
export function usesTaproot(tx: Pick<Tx, 'vin' | 'vout'>): boolean {
  return tx.vin.some((i) => i.prevout?.scriptpubkey_type === 'v1_p2tr') || tx.vout.some((o) => o.scriptpubkey_type === 'v1_p2tr');
}

// ---- size estimation (vbytes) ----
export type ScriptKind = 'p2wpkh' | 'p2tr' | 'p2sh-p2wpkh' | 'p2pkh';
// Per-input/output vbytes (typical signatures; ECDSA sigs assumed 72 bytes worst case-ish).
export const SIZES: Record<ScriptKind, { input: number; output: number; segwit: boolean }> = {
  p2wpkh: { input: 68, output: 31, segwit: true },
  p2tr: { input: 57.5, output: 43, segwit: true },
  'p2sh-p2wpkh': { input: 91, output: 32, segwit: true },
  p2pkh: { input: 148, output: 34, segwit: false },
};
/** Estimate vsize for a tx with all inputs/outputs of one kind. Overhead: 10 vB, +0.5 vB segwit marker/flag. */
export function estimateVsize(kind: ScriptKind, inputs: number, outputs: number): number {
  const s = SIZES[kind];
  const overhead = 10 + (s.segwit ? 0.5 : 0);
  return Math.ceil(overhead + inputs * s.input + outputs * s.output);
}
export function totalFee(rate: number, vsize: number): number { return Math.ceil(rate * vsize); }

// ---- fee bumping ----
/** Default incremental relay fee assumed for RBF (conservative; Bitcoin Core 29.1+/30 default is 0.1 sat/vB). */
export const INCREMENTAL_RELAY = 1;

/** Minimum absolute fee for a replacement with the same vsize, targeting `targetRate` (BIP-125 rules 3 & 4). */
export function rbfReplacementFee(oldFee: number, vsize: number, targetRate: number, incremental = INCREMENTAL_RELAY): number {
  return Math.max(Math.ceil(targetRate * vsize), Math.ceil(oldFee + incremental * vsize));
}

/** Fee the child must pay so that parent+child together reach `targetRate`. */
export function cpfpChildFee(parentFee: number, parentVsize: number, childVsize: number, targetRate: number): number {
  const need = Math.ceil(targetRate * (parentVsize + childVsize)) - parentFee;
  // child must also pay at least its own minimum relay fee
  return Math.max(need, Math.ceil(childVsize * 1));
}
export function packageRate(parentFee: number, parentVsize: number, childFee: number, childVsize: number): number {
  return (parentFee + childFee) / (parentVsize + childVsize);
}

export type Advice = 'confirmed' | 'wait' | 'rbf' | 'cpfp' | 'rbf-or-cpfp' | 'wait-or-accelerate';
export interface StuckAnalysis {
  advice: Advice;
  rate: number; // effective sat/vB
  vsize: number;
  rbf: boolean;
  spendableOutputs: number[]; // indexes of unspent, non-OP_RETURN outputs with value above dust
  targetRate: number;
  rbfFee?: number;
  cpfpChildFee?: number;
  childVsize: number;
  position: 'above-fast' | 'between' | 'below-economy' | 'below-minimum';
}
export const CPFP_CHILD_VSIZE = 110; // 1-in-1-out P2WPKH ≈ 110 vB

export function analyzeStuck(tx: Tx, fees: RecommendedFees, opts: { effectiveRate?: number; outspends?: { spent: boolean }[] } = {}): StuckAnalysis {
  const vsize = vsizeFromWeight(tx.weight);
  const rate = opts.effectiveRate ?? feeRate(tx.fee, tx.weight / 4);
  const rbf = signalsRbf(tx);
  const spendableOutputs = tx.vout
    .map((o, i) => ({ o, i }))
    .filter(({ o, i }) => o.scriptpubkey_type !== 'op_return' && o.value >= 546 && !(opts.outspends?.[i]?.spent))
    .map(({ i }) => i);
  const targetRate = fees.halfHourFee;
  const position: StuckAnalysis['position'] =
    rate >= fees.fastestFee ? 'above-fast' : rate >= fees.economyFee ? 'between' : rate >= fees.minimumFee ? 'below-economy' : 'below-minimum';
  const base = { rate, vsize, rbf, spendableOutputs, targetRate, childVsize: CPFP_CHILD_VSIZE, position };
  if (tx.status.confirmed) return { ...base, advice: 'confirmed' };
  const rbfFee = rbfReplacementFee(tx.fee, vsize, targetRate);
  const childFee = cpfpChildFee(tx.fee, vsize, CPFP_CHILD_VSIZE, targetRate);
  if (rate >= fees.hourFee) return { ...base, advice: 'wait', rbfFee, cpfpChildFee: childFee };
  const canCpfp = spendableOutputs.length > 0;
  // Under full-RBF (Bitcoin Core 28+ default) any unconfirmed tx can be replaced by whoever controls its inputs,
  // but `rbf` tells us whether it opted in, which matters for older nodes/wallets.
  let advice: Advice;
  if (rbf && canCpfp) advice = 'rbf-or-cpfp';
  else if (rbf) advice = 'rbf';
  else if (canCpfp) advice = 'cpfp';
  else advice = 'wait-or-accelerate';
  return { ...base, advice, rbfFee, cpfpChildFee: childFee };
}

// ---- change heuristic (hedged) ----
function inputKind(t: string) { return t; }
function isRound(sats: number) { return sats >= 10_000 && sats % 10_000 === 0; }
/** Returns index of an output that *might* be change, with a reason, or null. Never certain. */
export function guessChange(tx: Tx): { index: number; reason: string } | null {
  const outs = tx.vout.map((o, i) => ({ o, i })).filter(({ o }) => o.scriptpubkey_type !== 'op_return');
  if (outs.length !== 2 || tx.vin.some((v) => v.is_coinbase)) return null;
  const inAddrs = new Set(tx.vin.map((v) => v.prevout?.scriptpubkey_address).filter(Boolean));
  const back = outs.find(({ o }) => o.scriptpubkey_address && inAddrs.has(o.scriptpubkey_address));
  if (back) return { index: back.i, reason: 'it goes back to an address that was also one of the inputs (address reuse)' };
  const inTypes = new Set(tx.vin.map((v) => inputKind(v.prevout?.scriptpubkey_type ?? '')));
  if (inTypes.size === 1) {
    const [t] = [...inTypes];
    const same = outs.filter(({ o }) => o.scriptpubkey_type === t);
    if (same.length === 1) return { index: same[0].i, reason: 'it is the only output with the same address type as the inputs' };
  }
  const round = outs.filter(({ o }) => isRound(o.value));
  if (round.length === 1) {
    const other = outs.find(({ i }) => i !== round[0].i)!;
    return { index: other.i, reason: 'the other output is a round amount, which usually indicates the payment' };
  }
  return null;
}

export function opReturnData(o: Vout): { hex: string; text: string | null } | null {
  if (o.scriptpubkey_type !== 'op_return') return null;
  const s = o.scriptpubkey;
  // strip OP_RETURN (6a) and a single push opcode
  let i = 2; let hex = '';
  while (i < s.length) {
    const op = parseInt(s.slice(i, i + 2), 16); i += 2;
    let len = 0;
    if (op >= 1 && op <= 75) len = op;
    else if (op === 0x4c) { len = parseInt(s.slice(i, i + 2), 16); i += 2; }
    else if (op === 0x4d) { len = parseInt(s.slice(i + 2, i + 4) + s.slice(i, i + 2), 16); i += 4; }
    else continue;
    hex += s.slice(i, i + len * 2); i += len * 2;
  }
  const bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
  const printable = bytes.length > 0 && bytes.every((b) => (b >= 32 && b < 127) || b === 10);
  return { hex, text: printable ? String.fromCharCode(...bytes) : null };
}
