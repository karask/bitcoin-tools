import { describe, it, expect } from 'vitest';
import { decodeAddress, toHex, type AddressInfo } from '../src/lib/address';

// BIP-350 valid segwit addresses -> scriptPubKey
const VALID: [string, string][] = [
  ['BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4', '0014751e76e8199196d454941c45d1b3a323f1433bd6'],
  ['tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', '00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262'],
  ['bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y', '5128751e76e8199196d454941c45d1b3a323f1433bd6751e76e8199196d454941c45d1b3a323f1433bd6'],
  ['BC1SW50QGDZ25J', '6002751e'],
  ['bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs', '5210751e76e8199196d454941c45d1b3a323'],
  ['tb1qqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesrxh6hy', '0020000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433'],
  ['tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c', '5120000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433'],
  ['bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0', '512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'],
];
function spk(i: AddressInfo) {
  const v = i.witnessVersion!;
  const op = v === 0 ? '00' : (0x50 + v).toString(16);
  return op + i.program!.length.toString(16).padStart(2, '0') + toHex(i.program!);
}
// BIP-350 invalid addresses
const INVALID = [
  'tc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut',
  'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
  'tb1z0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqglt7rf',
  'BC1S0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ54WELL',
  'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
  'tb1q0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq24jc47',
  'bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4',
  'BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R',
  'bc1pw5dgrnzv',
  'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v8n0nx0muaewav253zgeav',
  'BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P',
  'tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq',
  'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v07qwwzcrf',
  'tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vpggkg4j',
  'bc1gmk9yu',
];

describe('BIP-173/350 vectors', () => {
  it.each(VALID)('valid %s', (a, script) => {
    const r = decodeAddress(a);
    expect(r.valid).toBe(true);
    if (r.valid) expect(spk(r)).toBe(script);
  });
  it.each(INVALID)('invalid %s', (a) => {
    expect(decodeAddress(a).valid).toBe(false);
  });
});

describe('types & networks', () => {
  const cases: [string, string, string][] = [
    ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'mainnet', 'P2PKH'],
    ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'mainnet', 'P2SH'],
    ['mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'testnet/signet', 'P2PKH'],
    ['2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc', 'testnet/signet', 'P2SH'],
    ['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'mainnet', 'P2WPKH'],
    ['bcrt1qs758ursh4q9z627kt3pp5yysm78ddny6txaqgw', 'regtest', 'P2WPKH'],
    ['bc1pfeessrawgf', 'mainnet', 'P2A'],
  ];
  it.each(cases)('%s', (a, net, type) => {
    const r = decodeAddress(a);
    expect(r.valid).toBe(true);
    if (r.valid) { expect(r.network).toBe(net); expect(r.type).toBe(type); }
  });
  it('detects base58 checksum typo', () => {
    const r = decodeAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/checksum/);
  });
  it('detects bech32 checksum typo', () => {
    const r = decodeAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdr');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/checksum/);
  });
  it('flags mixed case', () => {
    const r = decodeAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mDq');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/upper-case and lower-case/);
  });
  it('flags bech32m used for v0', () => {
    const r = decodeAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/bech32m instead of bech32/);
  });
  it('flags bech32 used for v1', () => {
    const r = decodeAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/old bech32 checksum/);
  });
  it('flags invalid characters', () => {
    const r = decodeAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdo');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/character "o"/);
  });
  it('rejects litecoin', () => {
    expect(decodeAddress('LVg2kJoFNg45Nbpy53h7Fe1wKyeXVRhMH9').valid).toBe(false);
  });
});
