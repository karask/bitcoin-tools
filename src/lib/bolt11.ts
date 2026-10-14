/**
 * Client-side BOLT11 invoice decoder (Lightning Network).
 * Spec: https://github.com/lightning/bolts/blob/master/11-payment-encoding.md
 * Never contacts a Lightning node — decode and signature-verify only.
 */
import { bech32, bech32m, createBase58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

const b58 = createBase58check(sha256);

export type LnNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest';

export interface RouteHintHop {
  pubkey: string;
  shortChannelId: string;
  feeBaseMsat: number;
  feeProportionalMillionths: number;
  cltvExpiryDelta: number;
}

export interface Bolt11Invoice {
  raw: string;
  network: LnNetwork;
  amountMsat: bigint | null;
  amountSats: number | null;
  timestamp: number;
  expiry: number;
  expiresAt: number;
  expired: boolean;
  paymentHash: string | null;
  description: string | null;
  descriptionHash: string | null;
  paymentSecret: string | null;
  payee: string | null;
  /** 'verified' = checked against the invoice's own n field; 'recovered' = payee key recovered
   *  from the signature (well-formed, but tampering would only change the recovered key);
   *  'invalid' = malformed or failed verification. */
  signatureStatus: 'verified' | 'recovered' | 'invalid';
  signatureValid: boolean;
  minFinalCltvExpiry: number;
  fallbackAddress: string | null;
  routeHints: RouteHintHop[][];
  featuresHex: string | null;
  unknownTags: number[];
}

const NET: Record<string, LnNetwork> = { bc: 'mainnet', tb: 'testnet', tbs: 'signet', bcrt: 'regtest' };
const MUL_EXP: Record<string, number> = { m: -3, u: -6, n: -9, p: -12 }; // BTC × 10^exp

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Convert 5-bit words → bytes. pad=true appends a final partial byte (used for signing message). */
export function wordsToBytes(words: number[], pad: boolean): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const w of words) {
    if (w < 0 || w > 31) throw new Error('Invalid bech32 word');
    acc = (acc << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  if (pad && bits > 0) out.push((acc << (8 - bits)) & 0xff);
  return Uint8Array.from(out);
}

function parseHrp(hrp: string): { network: LnNetwork; amountMsat: bigint | null } {
  if (!hrp.startsWith('ln')) throw new Error('Lightning invoices start with ln');
  const rest = hrp.slice(2);
  // longest currency prefix first
  let currency = '';
  for (const c of ['bcrt', 'tbs', 'tb', 'bc']) {
    if (rest.startsWith(c)) { currency = c; break; }
  }
  if (!currency || !(currency in NET)) throw new Error('Unknown Lightning network prefix');
  const amountPart = rest.slice(currency.length);
  if (!amountPart) return { network: NET[currency], amountMsat: null };
  const m = /^(\d+)([munp]?)$/.exec(amountPart);
  if (!m) throw new Error('Invalid amount in invoice prefix');
  const digits = m[1];
  const mul = m[2];
  const exp = mul ? MUL_EXP[mul] : 0; // BTC × 10^exp
  // msat = BTC × 10^11 = digits × 10^(11+exp)
  const power = 11 + exp;
  if (power < 0) {
    const n = BigInt(digits);
    if (n % 10n !== 0n) throw new Error('Invalid sub-millisatoshi precision');
    return { network: NET[currency], amountMsat: n / 10n };
  }
  return { network: NET[currency], amountMsat: BigInt(digits) * 10n ** BigInt(power) };
}

function decodeFallback(network: LnNetwork, words: number[]): string | null {
  if (!words.length) return null;
  const version = words[0];
  const dataWords = words.slice(1);
  const bytes = wordsToBytes(dataWords, false);
  if (version === 17) {
    const ver = network === 'mainnet' ? 0x00 : 0x6f;
    return b58.encode(Uint8Array.of(ver, ...bytes));
  }
  if (version === 18) {
    const ver = network === 'mainnet' ? 0x05 : 0xc4;
    return b58.encode(Uint8Array.of(ver, ...bytes));
  }
  if (version < 0 || version > 16) return null;
  const hrp = network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb';
  const progWords = [version, ...bech32.toWords(bytes)];
  // @scure encode(hrp, words, limit?) — limit false-ish: use large limit
  return version === 0
    ? bech32.encode(hrp, progWords, 1000)
    : bech32m.encode(hrp, progWords, 1000);
}

function parseRouteHint(bytes: Uint8Array): RouteHintHop[] {
  const hops: RouteHintHop[] = [];
  // each hop: 33 pubkey + 8 scid + 4 fee_base + 4 fee_prop + 2 cltv = 51 bytes
  for (let i = 0; i + 51 <= bytes.length; i += 51) {
    const hop = bytes.subarray(i, i + 51);
    const scid = hop.subarray(33, 41);
    hops.push({
      pubkey: toHex(hop.subarray(0, 33)),
      shortChannelId: toHex(scid),
      feeBaseMsat: new DataView(hop.buffer, hop.byteOffset + 41, 4).getUint32(0),
      feeProportionalMillionths: new DataView(hop.buffer, hop.byteOffset + 45, 4).getUint32(0),
      cltvExpiryDelta: new DataView(hop.buffer, hop.byteOffset + 49, 2).getUint16(0),
    });
  }
  return hops;
}

/**
 * Without an `n` field, BOLT11 relies on public-key recovery: any well-formed signature
 * recovers *some* key, so tampering shows up only as a different payee — it cannot be
 * detected without knowing the expected node. With an `n` field we can truly verify
 * (and, per spec, must reject non-canonical high-S signatures).
 */
function checkSignature(hrp: string, dataWordsNoSig: number[], sigWords: number[], nField: string | null):
  { payee: string | null; status: 'verified' | 'recovered' | 'invalid' } {
  if (sigWords.length !== 104) return { payee: nField, status: 'invalid' };
  const sigBytes = wordsToBytes(sigWords, false);
  if (sigBytes.length !== 65) return { payee: nField, status: 'invalid' };
  const compact = sigBytes.subarray(0, 64);
  const recoveryId = sigBytes[64];
  const hrpBytes = new TextEncoder().encode(hrp);
  const dataBytes = wordsToBytes(dataWordsNoSig, true);
  const msg = new Uint8Array(hrpBytes.length + dataBytes.length);
  msg.set(hrpBytes, 0); msg.set(dataBytes, hrpBytes.length);
  const digest = sha256(msg);
  try {
    if (nField) {
      const pub = Uint8Array.from(nField.match(/../g)!.map((h) => parseInt(h, 16)));
      const ok = secp256k1.verify(compact, digest, pub, { prehash: false, lowS: true });
      return { payee: nField, status: ok ? 'verified' : 'invalid' };
    }
    if (recoveryId > 3) return { payee: null, status: 'invalid' };
    // BOLT11 permits high-S signatures for recovery. Like the reference implementations,
    // normalise s to low-S and apply the recovery flag to the normalised signature
    // (this matches the spec's "Public-key recovery with high-S signature" vector).
    let sig = secp256k1.Signature.fromBytes(compact);
    const rec = recoveryId;
    if (sig.hasHighS()) {
      const n = secp256k1.Point.Fn.ORDER;
      sig = new secp256k1.Signature(sig.r, n - sig.s);
    }
    const pub = sig.addRecoveryBit(rec).recoverPublicKey(digest);
    return { payee: toHex(pub.toBytes(true)), status: 'recovered' };
  } catch {
    return { payee: nField, status: 'invalid' };
  }
}

export function decodeBolt11(raw: string, now = Math.floor(Date.now() / 1000)): Bolt11Invoice {
  const input = raw.trim().replace(/^lightning:/i, '');
  if (!input) throw new Error('Paste a Lightning invoice (BOLT11).');
  if (input !== input.toLowerCase() && input !== input.toUpperCase()) {
    throw new Error('Invoice mixes upper-case and lower-case letters, which is not allowed.');
  }
  const lower = input.toLowerCase();

  // bech32 with no practical length limit
  let decoded: ReturnType<typeof bech32.decode>;
  try { decoded = bech32.decode(lower as `${string}1${string}`, Number.MAX_SAFE_INTEGER); }
  catch { throw new Error('Not a valid Lightning invoice. It should start with “lnbc” (or lntb/lntbs/lnbcrt) and be a long string of letters and numbers — check that you copied all of it.'); }
  const hrp = decoded.prefix;
  const words = decoded.words as number[];
  if (words.length < 3 + 104) throw new Error('Invoice is too short to contain a signature.');

  const { network, amountMsat } = parseHrp(hrp);
  const dataWords = words.slice(0, words.length - 104);
  const sigWords = words.slice(words.length - 104);

  // timestamp: first 35 bits = 7 words
  let t = 0;
  for (let i = 0; i < 7; i++) t = (t << 5) | dataWords[i];
  const timestamp = t;

  let paymentHash: string | null = null;
  let description: string | null = null;
  let descriptionHash: string | null = null;
  let paymentSecret: string | null = null;
  let payeeField: string | null = null;
  let expiry = 3600;
  let minFinalCltvExpiry = 18;
  let fallbackAddress: string | null = null;
  const routeHints: RouteHintHop[][] = [];
  let featuresHex: string | null = null;
  const unknownTags: number[] = [];

  let i = 7;
  while (i + 3 <= dataWords.length) {
    const type = dataWords[i++];
    const dataLen = (dataWords[i++] << 5) | dataWords[i++];
    if (i + dataLen > dataWords.length) throw new Error('Invoice tagged field overruns data.');
    const field = dataWords.slice(i, i + dataLen);
    i += dataLen;
    const c = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'[type] ?? `type${type}`;
    switch (c) {
      case 'p': {
        if (dataLen !== 52) break;
        if (!paymentHash) paymentHash = toHex(wordsToBytes(field, false));
        break;
      }
      case 'd': {
        const bytes = wordsToBytes(field, false);
        description = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        break;
      }
      case 'h': {
        if (dataLen === 52) descriptionHash = toHex(wordsToBytes(field, false));
        break;
      }
      case 'n': {
        if (dataLen === 53) payeeField = toHex(wordsToBytes(field, false));
        break;
      }
      case 'x': {
        expiry = Number(wordsToBytesInt(field));
        break;
      }
      case 'c': {
        minFinalCltvExpiry = Number(wordsToBytesInt(field));
        break;
      }
      case 'f': {
        fallbackAddress = decodeFallback(network, field);
        break;
      }
      case 'r': {
        routeHints.push(parseRouteHint(wordsToBytes(field, false)));
        break;
      }
      case 's': {
        if (dataLen === 52) paymentSecret = toHex(wordsToBytes(field, false));
        break;
      }
      case '9': {
        featuresHex = toHex(wordsToBytes(field, false));
        break;
      }
      default:
        unknownTags.push(type);
    }
  }

  const { payee, status: signatureStatus } = checkSignature(hrp, dataWords, sigWords, payeeField);

  const expiresAt = timestamp + expiry;
  const amountSats = amountMsat === null ? null : Number(amountMsat / 1000n);

  return {
    raw: lower,
    network,
    amountMsat,
    amountSats,
    timestamp,
    expiry,
    expiresAt,
    expired: now >= expiresAt,
    paymentHash,
    description,
    descriptionHash,
    paymentSecret,
    payee,
    signatureStatus,
    signatureValid: signatureStatus !== 'invalid',
    minFinalCltvExpiry,
    fallbackAddress,
    routeHints,
    featuresHex,
    unknownTags,
  };
}

function wordsToBytesInt(words: number[]): bigint {
  let v = 0n;
  for (const w of words) v = (v << 5n) | BigInt(w);
  return v;
}

/** True if the string looks like a BOLT11 (with or without lightning: prefix). */
export function looksLikeBolt11(s: string): boolean {
  const t = s.trim().replace(/^lightning:/i, '');
  return /^(ln(bc|tb|tbs|bcrt)|LN(BC|TB|TBS|BCRT))/i.test(t);
}
