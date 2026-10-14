import { bech32, bech32m, base58 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';

export type Network = 'mainnet' | 'testnet/signet' | 'regtest';
export type AddressType = 'P2PKH' | 'P2SH' | 'P2WPKH' | 'P2WSH' | 'P2TR' | 'P2A' | 'future-segwit';

export interface AddressInfo {
  valid: true;
  address: string;
  network: Network;
  type: AddressType;
  encoding: 'base58' | 'bech32' | 'bech32m';
  witnessVersion?: number;
  program?: Uint8Array; // hash / witness program
  warnings: string[];
}
export interface AddressError {
  valid: false;
  address: string;
  error: string;   // plain English
  hint?: string;   // typo / what to do
  warnings: string[];
}
export type AddressResult = AddressInfo | AddressError;

const HRP: Record<string, Network> = { bc: 'mainnet', tb: 'testnet/signet', bcrt: 'regtest' };

function toHex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
export { toHex };

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function err(address: string, error: string, hint?: string, warnings: string[] = []): AddressError {
  return { valid: false, address, error, hint, warnings };
}

function decodeSegwit(input: string): AddressResult {
  const address = input;
  const warnings: string[] = [];
  const lower = input.toLowerCase();
  if (input !== lower && input !== input.toUpperCase()) {
    return err(address, 'This address mixes upper-case and lower-case letters, which is not allowed for this address format.',
      'Bech32 addresses must be all lower-case (or all upper-case). Copy the address again from the original source rather than retyping it.');
  }
  if (input === input.toUpperCase()) warnings.push('This address is written in upper case. That is valid (it is sometimes used in QR codes), but most wallets display it in lower case.');
  if (lower.length > 90) return err(address, 'This address is too long to be a valid Bitcoin address.', 'Check that nothing extra was pasted before or after it.');
  const sep = lower.lastIndexOf('1');
  if (sep < 1) return err(address, 'This does not look like a Bitcoin address.');
  const hrp = lower.slice(0, sep);
  const data = lower.slice(sep + 1);
  const network = HRP[hrp];
  if (!network) return err(address, `The prefix "${hrp}" is not a Bitcoin network prefix.`, 'Bitcoin addresses of this kind start with "bc1" (mainnet), "tb1" (testnet/signet) or "bcrt1" (regtest). This may be an address for a different coin.');
  const bad = [...data].find((c) => !BECH32_CHARSET.includes(c));
  if (bad !== undefined) {
    return err(address, `The character "${bad}" can never appear in this kind of address.`,
      'Bech32 addresses never contain "1" (after the prefix), "b", "i" or "o", so a typo is likely — for example "o" instead of "0", or "i"/"b" instead of "l"/"6". Copy and paste the address instead of typing it.');
  }
  if (data.length < 6) return err(address, 'This address is too short.', 'Part of it may be missing.');
  const d32 = bech32.decodeUnsafe(lower as `${string}1${string}`, 90);
  const d32m = bech32m.decodeUnsafe(lower as `${string}1${string}`, 90);
  const dec = d32 || d32m;
  if (!dec) {
    return err(address, 'The checksum does not match — this address contains a typo or was copied incorrectly.',
      'Bitcoin addresses include a built-in checksum so that mistakes are caught before any money is sent. Do not send to this address; get the correct address again from the recipient.');
  }
  const encoding = d32 ? 'bech32' : 'bech32m';
  const words = dec.words;
  if (words.length < 1) return err(address, 'This address has no data.');
  const version = words[0];
  if (version > 16) return err(address, 'This address uses an invalid witness version.');
  let program: Uint8Array;
  try { program = bech32.fromWords(words.slice(1)); }
  catch { return err(address, 'The data inside this address is malformed (invalid padding).'); }
  if (version === 0 && encoding !== 'bech32') {
    return err(address, 'This SegWit v0 address uses the wrong checksum type (bech32m instead of bech32).', 'Version 0 addresses (bc1q…) must use the original bech32 checksum. It was probably created by buggy software — do not send to it.');
  }
  if (version !== 0 && encoding !== 'bech32m') {
    return err(address, `This SegWit v${version} address uses the old bech32 checksum instead of bech32m.`, 'Since BIP-350, addresses of version 1 and above (such as Taproot bc1p…) must use bech32m. It was probably created by outdated software — do not send to it.');
  }
  if (program.length < 2 || program.length > 40) return err(address, 'The data inside this address has an invalid length.');
  let type: AddressType;
  if (version === 0) {
    if (program.length === 20) type = 'P2WPKH';
    else if (program.length === 32) type = 'P2WSH';
    else return err(address, 'A version 0 SegWit address must contain 20 or 32 bytes of data; this one does not.');
  } else if (version === 1 && program.length === 32) type = 'P2TR';
  else if (version === 1 && program.length === 2 && program[0] === 0x4e && program[1] === 0x73) type = 'P2A';
  else {
    type = 'future-segwit';
    warnings.push(`This is a valid address for SegWit version ${version}, which has no defined spending rules yet. Coins sent here may be spendable by anyone or lost. Do not send to it unless you know exactly why.`);
  }
  return { valid: true, address, network, type, encoding, witnessVersion: version, program, warnings };
}

function decodeBase58(input: string): AddressResult {
  const address = input;
  const bad = [...input].find((c) => !B58_ALPHABET.includes(c));
  if (bad !== undefined) {
    return err(address, `The character "${bad}" can never appear in this kind of address.`,
      'Legacy Bitcoin addresses never contain "0" (zero), "O" (capital o), "I" (capital i) or "l" (lower-case L), because they are easily confused. A typo is likely.');
  }
  let raw: Uint8Array;
  try { raw = base58.decode(input); } catch { return err(address, 'This is not a valid Bitcoin address.'); }
  if (raw.length !== 25) return err(address, 'This address has the wrong length.', 'A character may be missing or added. Copy and paste the address instead of typing it.');
  const payload = raw.slice(0, 21);
  const check = sha256(sha256(payload)).slice(0, 4);
  if (!check.every((b, i) => b === raw[21 + i])) {
    return err(address, 'The checksum does not match — this address contains a typo or was copied incorrectly.',
      'Bitcoin addresses include a built-in checksum so that mistakes are caught before any money is sent. Do not send to this address; get the correct address again from the recipient.');
  }
  const v = payload[0];
  const program = payload.slice(1);
  const map: Record<number, [Network, AddressType]> = {
    0x00: ['mainnet', 'P2PKH'], 0x05: ['mainnet', 'P2SH'],
    0x6f: ['testnet/signet', 'P2PKH'], 0xc4: ['testnet/signet', 'P2SH'],
  };
  const m = map[v];
  if (!m) return err(address, 'This has a valid checksum but is not a Bitcoin address (unknown version byte). It may belong to another cryptocurrency.', 'Check that you are not mixing up Bitcoin with another coin such as Litecoin or Dogecoin.');
  const warnings: string[] = [];
  if (m[0] !== 'mainnet') warnings.push('Legacy test addresses (m…, n…, 2…) look the same on testnet, signet and regtest.');
  return { valid: true, address, network: m[0], type: m[1], encoding: 'base58', program, warnings };
}

export function decodeAddress(raw: string): AddressResult {
  const input = raw.trim();
  if (!input) return err(raw, 'Please enter an address.');
  if (/\s/.test(input)) return err(raw, 'The address contains spaces or line breaks.', 'Remove any spaces — a real address is one continuous string.');
  const lower = input.toLowerCase();
  if (lower.startsWith('bitcoin:')) return err(raw, 'This is a payment link (bitcoin: URI), not a bare address.', 'Remove the "bitcoin:" part and anything after a "?" to check the address itself.');
  if (/^(bc|tb|bcrt)1/.test(lower)) return decodeSegwit(input);
  if (/^[0-9a-f]+$/i.test(input) && (input.length === 66 || input.length === 130)) {
    return err(raw, 'This looks like a public key, not an address.', 'Public keys are not used as addresses by modern wallets.');
  }
  return decodeBase58(input);
}

export const TYPE_LABEL: Record<AddressType, string> = {
  P2PKH: 'Legacy (P2PKH)',
  P2SH: 'Script hash (P2SH) — often wrapped SegWit or multisig',
  P2WPKH: 'Native SegWit (P2WPKH)',
  P2WSH: 'Native SegWit script (P2WSH) — often multisig',
  P2TR: 'Taproot (P2TR)',
  P2A: 'Pay-to-Anchor (P2A) — a special anchor output, not a normal wallet address',
  'future-segwit': 'Unknown future SegWit version',
};

export function networkWarning(info: AddressInfo, expected: Network = 'mainnet'): string | null {
  if (info.network === expected) return null;
  if (info.network === 'testnet/signet') return 'This is a TEST network address (testnet or signet). Test coins have no value. Never send real bitcoin to it — most wallets will refuse, and if one does not, the funds could be lost.';
  if (info.network === 'regtest') return 'This is a REGTEST address, used only for local development. Never send real bitcoin to it.';
  return 'This is a mainnet (real bitcoin) address.';
}
