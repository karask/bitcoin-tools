import { describe, it, expect } from 'vitest';
import { buildBip21, formatBip21Amount, parseBip21 } from '../src/lib/bip21';

describe('formatBip21Amount', () => {
  it('formats numbers without exponent or trailing zeros', () => {
    expect(formatBip21Amount(1)).toBe('1');
    expect(formatBip21Amount(0.0015)).toBe('0.0015');
    expect(formatBip21Amount(0.00000001)).toBe('0.00000001');
    expect(formatBip21Amount('0.10000000')).toBe('0.1');
    expect(formatBip21Amount('2.5')).toBe('2.5');
  });
  it('rejects scientific notation and >8 decimals', () => {
    expect(() => formatBip21Amount('1e-8')).toThrow();
    expect(() => formatBip21Amount('0.000000001')).toThrow();
  });
});

describe('buildBip21', () => {
  it('address only', () => expect(buildBip21({ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' })).toBe('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'));
  it('amount label message', () => {
    expect(buildBip21({ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amountBtc: 0.01, label: 'a b', message: 'c&d' }))
      .toBe('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=0.01&label=a%20b&message=c%26d');
  });
  it('uppercases bech32', () => {
    expect(buildBip21({ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amountBtc: '0.0015', uppercase: true }))
      .toBe('BITCOIN:BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ?AMOUNT=0.0015');
  });
  it('does not uppercase legacy', () => {
    expect(buildBip21({ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', uppercase: true })).toBe('BITCOIN:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
  });
});

describe('parseBip21', () => {
  it('round-trips', () => {
    const u = buildBip21({ address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', amountBtc: 1.5, label: 'Tips', message: 'thanks' });
    const p = parseBip21(u);
    expect(p.address).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    expect(p.amountBtc).toBe('1.5');
    expect(p.label).toBe('Tips');
    expect(p.message).toBe('thanks');
  });
  it('extracts lightning=', () => {
    const p = parseBip21('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?lightning=lnbc1pvjluez');
    expect(p.lightning).toBe('lnbc1pvjluez');
  });
});

describe('amount validation (B3/B4)', () => {
  it('negative string says positive', () => { expect(() => formatBip21Amount('-1')).toThrow(/must be positive/); });
  it('negative number says positive', () => { expect(() => formatBip21Amount(-0.5)).toThrow(/must be positive/); });
  it('parse rejects negative amount clearly', () => { expect(() => parseBip21('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=-1')).toThrow(/must be positive/); });
  it('exponent still gets the plain-decimal message', () => { expect(() => formatBip21Amount('1e3')).toThrow(/scientific/); });
  it('21M exactly is allowed', () => { expect(formatBip21Amount('21000000')).toBe('21000000'); });
  it('over 21M rejected (string, number, build, parse)', () => {
    expect(() => formatBip21Amount('21000000.00000001')).toThrow(/21,000,000/);
    expect(() => formatBip21Amount(22e6)).toThrow(/21,000,000/);
    expect(() => buildBip21({ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amountBtc: '99999999' })).toThrow(/21,000,000/);
    expect(() => parseBip21('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=30000000')).toThrow(/21,000,000/);
  });
});

describe('non-numeric amount', () => {
  it('"abc" says it must be a number', () => { expect(() => formatBip21Amount('abc')).toThrow(/must be a number/); });
  it('empty-ish junk says number', () => { expect(() => formatBip21Amount('1,5')).toThrow(/must be a number/); });
  it('"1e3" still gets the scientific-notation message', () => { expect(() => formatBip21Amount('1e3')).toThrow(/scientific/); });
});

describe('malformed numbers (Retest 2)', () => {
  for (const s of ['1.2.3', '1..2', '.5', '1.', '1e', 'e3', '1.2e', '--1e3', '1 000'])
    it(`"${s}" says must be a number`, () => { expect(() => formatBip21Amount(s)).toThrow(/must be a number|must be positive/); });
  for (const s of ['1e3', '1.5E-3', '2e+2'])
    it(`"${s}" says no scientific notation`, () => { expect(() => formatBip21Amount(s)).toThrow(/scientific/); });
});
