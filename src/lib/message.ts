/**
 * BIP-137 / Electrum-style Bitcoin message verification (verify only — never signs).
 *
 * Spec: https://github.com/bitcoin/bips/blob/master/bip-0137.mediawiki
 * Magic hash = double-SHA256( 0x18 || "Bitcoin Signed Message:\n" || CompactSize(len) || message )
 * Signature = 65 bytes base64: header (27–42) || r || s
 * Header encodes recovery id and claimed address type:
 *   27–30 P2PKH uncompressed, 31–34 P2PKH compressed,
 *   35–38 P2SH-P2WPKH, 39–42 P2WPKH.
 *
 * Taproot (bc1p…) and bare script hashes need BIP-322 / script knowledge — we refuse those.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64 } from '@scure/base';
import { p2pkh, p2wpkh, p2sh, NETWORK, TEST_NETWORK } from '@scure/btc-signer';
import { decodeAddress, type AddressType } from './address';

export type SigAddressType = 'p2pkh-uncompressed' | 'p2pkh-compressed' | 'p2sh-p2wpkh' | 'p2wpkh';
export type VerifyVerdict = 'yes' | 'no' | 'cant-check';

export interface VerifyResult {
  verdict: VerifyVerdict;
  title: string;
  reason: string;
  addressType?: AddressType;
  signatureType?: SigAddressType;
  /** Address derived from the recovered key + signature header (shown when it differs). */
  recoveredAddress?: string;
  network?: string;
}

const SIG_TYPE: SigAddressType[] = ['p2pkh-uncompressed', 'p2pkh-compressed', 'p2sh-p2wpkh', 'p2wpkh'];
const SIG_LABEL: Record<SigAddressType, string> = {
  'p2pkh-uncompressed': 'legacy address (uncompressed key)',
  'p2pkh-compressed': 'legacy address (compressed key)',
  'p2sh-p2wpkh': 'wrapped SegWit (3…)',
  'p2wpkh': 'native SegWit (bc1q…)',
};

/** Address types this tool can verify with BIP-137. */
export const SUPPORTED_TYPES: AddressType[] = ['P2PKH', 'P2SH', 'P2WPKH'];
/** Address types we refuse rather than guess. */
export const UNSUPPORTED_TYPES: AddressType[] = ['P2TR', 'P2WSH', 'P2A', 'future-segwit'];

function compactSize(n: number): Uint8Array {
  if (n < 0 || !Number.isInteger(n)) throw new Error('Invalid length');
  if (n < 253) return Uint8Array.of(n);
  if (n <= 0xffff) {
    const b = new Uint8Array(3);
    b[0] = 0xfd;
    new DataView(b.buffer).setUint16(1, n, true);
    return b;
  }
  if (n <= 0xffffffff) {
    const b = new Uint8Array(5);
    b[0] = 0xfe;
    new DataView(b.buffer).setUint32(1, n, true);
    return b;
  }
  throw new Error('Message is too long to sign under BIP-137');
}

/** BIP-137 magic hash of a UTF-8 message. Exported for tests. */
export function magicHash(message: string): Uint8Array {
  const enc = new TextEncoder();
  const msg = enc.encode(message);
  const header = enc.encode('Bitcoin Signed Message:\n');
  const prefix = new Uint8Array(1 + header.length);
  prefix[0] = header.length; // 0x18
  prefix.set(header, 1);
  const len = compactSize(msg.length);
  const buf = new Uint8Array(prefix.length + len.length + msg.length);
  buf.set(prefix);
  buf.set(len, prefix.length);
  buf.set(msg, prefix.length + len.length);
  return sha256(sha256(buf));
}

function decodeBip137Signature(rawB64: string): { recid: number; type: SigAddressType; compact: Uint8Array } | { error: string } {
  const cleaned = rawB64.replace(/\s+/g, '');
  if (!cleaned) return { error: 'Paste a signature (usually a long base64 string from a wallet’s “sign message” feature).' };
  let bytes: Uint8Array;
  try { bytes = base64.decode(cleaned); }
  catch { return { error: 'The signature is not valid base64. Copy it again from the wallet that produced it.' }; }
  if (bytes.length !== 65) {
    return { error: `A BIP-137 signature is exactly 65 bytes; this one decoded to ${bytes.length}. It may be incomplete, or a different format (for example BIP-322), which this tool does not check.` };
  }
  const header = bytes[0];
  if (header < 27 || header > 42) {
    return { error: `The signature’s type byte is ${header}, which is outside the BIP-137 range (27–42). This tool only checks Electrum / BIP-137 message signatures.` };
  }
  const recid = (header - 27) & 3;
  const type = SIG_TYPE[Math.floor((header - 27) / 4)]!;
  // noble recovered format: recid byte || r || s
  const compact = new Uint8Array(65);
  compact[0] = recid;
  compact.set(bytes.slice(1), 1);
  return { recid, type, compact };
}

function addressFor(pub: Uint8Array, type: SigAddressType, mainnet: boolean): string {
  const net = mainnet ? NETWORK : TEST_NETWORK;
  if (type === 'p2pkh-uncompressed' || type === 'p2pkh-compressed') return p2pkh(pub, net).address!;
  if (type === 'p2sh-p2wpkh') {
    const compressed = pub.length === 33 ? pub : secp256k1.Point.fromBytes(pub).toBytes(true);
    return p2sh(p2wpkh(compressed, net), net).address!;
  }
  const compressed = pub.length === 33 ? pub : secp256k1.Point.fromBytes(pub).toBytes(true);
  return p2wpkh(compressed, net).address!;
}

/**
 * Verify that `signature` is a BIP-137 signature of `message` by the key behind `address`.
 * Never asks for or handles private keys. Pure crypto — no network.
 */
export function verifyMessage(address: string, message: string, signature: string): VerifyResult {
  const addr = decodeAddress(address);
  if (!addr.valid) {
    return { verdict: 'cant-check', title: 'Not a valid Bitcoin address', reason: addr.error + (addr.hint ? ` ${addr.hint}` : '') };
  }
  if (addr.type === 'P2TR') {
    return {
      verdict: 'cant-check', title: 'Taproot addresses are not supported here',
      reason: 'BIP-137 message signatures were designed for legacy and SegWit single-key addresses. Taproot (bc1p…) uses a different scheme (BIP-322). This tool will not guess — ask the signer for a BIP-322 signature, or use a wallet that verifies Taproot messages.',
      addressType: addr.type, network: addr.network,
    };
  }
  if (addr.type === 'P2WSH' || addr.type === 'P2A' || addr.type === 'future-segwit') {
    return {
      verdict: 'cant-check', title: 'This address type cannot be checked with BIP-137',
      reason: addr.type === 'P2WSH'
        ? 'This is a SegWit script address (usually multisig). BIP-137 only covers single-key addresses. Checking it needs the full script and BIP-322.'
        : 'This address type does not use a single public key the way BIP-137 expects, so this tool cannot verify a message against it.',
      addressType: addr.type, network: addr.network,
    };
  }
  if (addr.type === 'P2SH') {
    // We can only check the common Electrum wrapped-SegWit form. Multisig 3… will simply not match.
  }

  const sig = decodeBip137Signature(signature);
  if ('error' in sig) {
    return { verdict: 'cant-check', title: 'Could not read the signature', reason: sig.error, addressType: addr.type, network: addr.network };
  }

  // Message may be empty (some wallets allow it); we still hash it.
  let pub: Uint8Array;
  try {
    pub = secp256k1.recoverPublicKey(sig.compact, magicHash(message), { prehash: false });
  } catch {
    return {
      verdict: 'no', title: 'Signature is not valid',
      reason: 'The signature bytes do not recover a public key for this message. It was not produced by BIP-137 signing of this exact text, or it has been altered.',
      addressType: addr.type, signatureType: sig.type, network: addr.network,
    };
  }
  if (sig.type === 'p2pkh-uncompressed') {
    pub = secp256k1.Point.fromBytes(pub).toBytes(false);
  }

  const mainnet = addr.network === 'mainnet';
  let recoveredAddress: string;
  try {
    recoveredAddress = addressFor(pub, sig.type, mainnet);
  } catch {
    return { verdict: 'no', title: 'Signature is not valid', reason: 'Could not derive an address from the recovered key.', addressType: addr.type, signatureType: sig.type, network: addr.network };
  }

  // Compare case-insensitively for bech32; Base58 is case-sensitive.
  const claimed = addr.address;
  const match = claimed.startsWith('bc1') || claimed.startsWith('tb1') || claimed.startsWith('bcrt1')
    ? claimed.toLowerCase() === recoveredAddress.toLowerCase()
    : claimed === recoveredAddress;

  if (match) {
    const p2shNote = addr.type === 'P2SH'
      ? ' For addresses starting with 3, this confirms the common single-signature wrapped-SegWit form (P2SH-P2WPKH) used by Electrum and many wallets — not an arbitrary multisig script.'
      : '';
    return {
      verdict: 'yes',
      title: 'Signature matches this address',
      reason: `Whoever produced this signature controls the private key for ${claimed}. That proves they can spend coins sent to it (assuming the key has not been stolen since), for this exact message. It does not prove anything about any other message or address.${p2shNote}`,
      addressType: addr.type, signatureType: sig.type, recoveredAddress, network: addr.network,
    };
  }

  // Helpful mismatch: signature is valid for a different address / type.
  const headerSays = SIG_LABEL[sig.type];
  const typeMismatch = (addr.type === 'P2PKH' && sig.type !== 'p2pkh-compressed' && sig.type !== 'p2pkh-uncompressed')
    || (addr.type === 'P2WPKH' && sig.type !== 'p2wpkh')
    || (addr.type === 'P2SH' && sig.type !== 'p2sh-p2wpkh');

  return {
    verdict: 'no',
    title: 'Signature does not match this address',
    reason: typeMismatch
      ? `Under this message the signature recovers to ${recoveredAddress} (header claims a ${headerSays}), not the address you entered. That does not prove control of ${claimed}. A match needs the same address, the same exact message, and a BIP-137 signature for that pair — the message text or address type may differ.`
      : `Under this message the signature recovers to a different address (${recoveredAddress}). That does not prove control of ${claimed}.`,
    addressType: addr.type, signatureType: sig.type, recoveredAddress, network: addr.network,
  };
}
