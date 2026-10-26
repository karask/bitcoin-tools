import { describe, it, expect } from 'vitest';
import { verifyMessage, magicHash, SUPPORTED_TYPES, UNSUPPORTED_TYPES } from '../src/lib/message';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { p2pkh, p2wpkh, p2sh, p2tr } from '@scure/btc-signer';
import { base64 } from '@scure/base';

/** bitcoinjs-message fixtures (Bitcoin network). */
const FIXTURES = [
  {
    message: 'vires is numeris',
    address: '16UwLL9Risc3QfPqBUvKofHmBQ7wMtjvM',
    signature: 'G8JawPtQOrybrSP1WHQnQPr67B9S3qrxBrl1mlzoTJOSHEpmnF7D3+t+LX0Xei9J20B5AIdPbeL3AaTBZ4N3bY0=',
  },
  {
    message: 'vires is numeris',
    address: '1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs',
    signature: 'H8JawPtQOrybrSP1WHQnQPr67B9S3qrxBrl1mlzoTJOSHEpmnF7D3+t+LX0Xei9J20B5AIdPbeL3AaTBZ4N3bY0=',
  },
  {
    message: 'vires is numeris',
    address: '3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN',
    signature: 'JF8nHqFr3K2UKYahhX3soVeoW8W1ECNbr0wfck7lzyXjCS5Q16Ek45zyBuy1Fiy9sTPKVgsqqOuPvbycuVSSVl8=',
  },
  {
    message: 'vires is numeris',
    address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    signature: 'KF8nHqFr3K2UKYahhX3soVeoW8W1ECNbr0wfck7lzyXjCS5Q16Ek45zyBuy1Fiy9sTPKVgsqqOuPvbycuVSSVl8=',
  },
] as const;

describe('BIP-137 magic hash', () => {
  it('prefixes with 0x18 Bitcoin Signed Message', () => {
    const h = magicHash('hello');
    expect(h).toHaveLength(32);
    expect(hex.encode(h)).not.toBe(hex.encode(magicHash('Hello')));
  });
});

describe('valid BIP-137 verify (bitcoinjs fixtures)', () => {
  for (const f of FIXTURES) {
    it(`accepts ${f.address.slice(0, 8)}…`, () => {
      const r = verifyMessage(f.address, f.message, f.signature);
      expect(r.verdict).toBe('yes');
      expect(r.recoveredAddress?.toLowerCase()).toBe(f.address.toLowerCase());
    });
  }
  it('tolerates whitespace in the signature', () => {
    const f = FIXTURES[1];
    const spaced = f.signature.slice(0, 40) + '\n' + f.signature.slice(40);
    expect(verifyMessage(f.address, f.message, spaced).verdict).toBe('yes');
  });
});

describe('negative cases', () => {
  const f = FIXTURES[1];
  it('wrong message → no, soft mismatch wording (no "made for")', () => {
    const r = verifyMessage(f.address, f.message + '!', f.signature);
    expect(r.verdict).toBe('no');
    expect(r.reason).toMatch(/recovers to/i);
    expect(r.reason).toMatch(/does not prove control/i);
    expect(r.reason).not.toMatch(/made for/i);
  });
  it('wrong address → no, and shows recovered address', () => {
    const r = verifyMessage('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH', f.message, f.signature);
    expect(r.verdict).toBe('no');
    expect(r.recoveredAddress).toBe(f.address);
    expect(r.reason).toMatch(/recovers to/i);
    expect(r.reason).toMatch(/does not prove control/i);
    expect(r.reason).not.toMatch(/made for/i);
  });
  it('malformed base64 → cant-check', () => {
    expect(verifyMessage(f.address, f.message, '%%%not-base64%%%').verdict).toBe('cant-check');
  });
  it('wrong length signature → cant-check', () => {
    expect(verifyMessage(f.address, f.message, base64.encode(new Uint8Array(32))).verdict).toBe('cant-check');
  });
  it('header outside BIP-137 range → cant-check', () => {
    const raw = base64.decode(f.signature);
    raw[0] = 50;
    expect(verifyMessage(f.address, f.message, base64.encode(raw)).verdict).toBe('cant-check');
  });
  it('invalid address → cant-check', () => {
    expect(verifyMessage('not-an-address', f.message, f.signature).verdict).toBe('cant-check');
  });
});

describe('unsupported address types', () => {
  const f = FIXTURES[3];
  it('Taproot → cant-check with clear reason', () => {
    const priv = new Uint8Array(32); priv[31] = 2;
    const pub = secp256k1.getPublicKey(priv, true);
    // x-only for taproot: drop the prefix byte
    const xonly = pub.slice(1);
    const tr = p2tr(xonly).address!;
    const r = verifyMessage(tr, f.message, f.signature);
    expect(r.verdict).toBe('cant-check');
    expect(r.reason).toMatch(/BIP-322|Taproot/i);
  });
  it('P2WSH → cant-check', () => {
    // bc1q rp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3 (BIP-173 test vector P2WSH)
    const r = verifyMessage('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3', 'x', f.signature);
    expect(r.verdict).toBe('cant-check');
    expect(r.addressType).toBe('P2WSH');
  });
  it('SUPPORTED / UNSUPPORTED lists are consistent', () => {
    expect(SUPPORTED_TYPES).toEqual(expect.arrayContaining(['P2PKH', 'P2WPKH', 'P2SH']));
    expect(UNSUPPORTED_TYPES).toEqual(expect.arrayContaining(['P2TR', 'P2WSH']));
  });
});

describe('self-signed round trip (privkey 1)', () => {
  const priv = new Uint8Array(32); priv[31] = 1;
  const pub = secp256k1.getPublicKey(priv, true);
  function sign(typeOffset: number, message: string) {
    const h = magicHash(message);
    const sig = secp256k1.sign(h, priv, { format: 'recovered', prehash: false });
    const out = new Uint8Array(65);
    out[0] = 27 + (sig[0] & 3) + typeOffset;
    out.set(sig.slice(1), 1);
    return base64.encode(out);
  }
  it('P2PKH compressed', () => {
    const addr = p2pkh(pub).address!;
    expect(verifyMessage(addr, 'Hello Bitcoin!', sign(4, 'Hello Bitcoin!')).verdict).toBe('yes');
  });
  it('P2WPKH', () => {
    const addr = p2wpkh(pub).address!;
    expect(verifyMessage(addr, 'Hello Bitcoin!', sign(12, 'Hello Bitcoin!')).verdict).toBe('yes');
  });
  it('P2SH-P2WPKH', () => {
    const addr = p2sh(p2wpkh(pub)).address!;
    expect(verifyMessage(addr, 'Hello Bitcoin!', sign(8, 'Hello Bitcoin!')).verdict).toBe('yes');
  });
});
