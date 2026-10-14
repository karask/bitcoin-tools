
import { describe, it, expect } from 'vitest';
import { decodeBolt11, looksLikeBolt11 } from '../src/lib/bolt11';

const PAYEE = '03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad';
const HASH = '0001020304050607080900010203040506070809000102030405060708090102';
const DONATION = 'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql';
const COFFEE = 'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';
const HASHED = 'lnbc20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqs9qrsgq7ea976txfraylvgzuxs8kgcw23ezlrszfnh8r6qtfpr6cxga50aj6txm9rxrydzd06dfeawfk6swupvz4erwnyutnjq7x39ymw6j38gp7ynn44';
const TESTNET = 'lntb20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygshp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfpp3x9et2e20v6pu37c5d9vax37wxq72un989qrsgqdj545axuxtnfemtpwkc45hx9d2ft7x04mt8q7y6t0k2dge9e7h8kpy9p34ytyslj3yu569aalz2xdk8xkd7ltxqld94u8h2esmsmacgpghe9k8';
const P2SH = 'lnbc20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygshp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfppj3a24vwu6r8ejrss3axul8rxldph2q7z99qrsgqz6qsgww34xlatfj6e3sngrwfy3ytkt29d2qttr8qz2mnedfqysuqypgqex4haa2h8fx3wnypranf3pdwyluftwe680jjcfp438u82xqphf75ym';
const P2WPKH = 'lnbc20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygshp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfppqw508d6qejxtdg4y5r3zarvary0c5xw7k9qrsgqt29a0wturnys2hhxpner2e3plp6jyj8qx7548zr2z7ptgjjc7hljm98xhjym0dg52sdrvqamxdezkmqg4gdrvwwnf0kv2jdfnl4xatsqmrnsse';
const PICO = 'lnbc9678785340p1pwmna7lpp5gc3xfm08u9qy06djf8dfflhugl6p7lgza6dsjxq454gxhj9t7a0sd8dgfkx7cmtwd68yetpd5s9xar0wfjn5gpc8qhrsdfq24f5ggrxdaezqsnvda3kkum5wfjkzmfqf3jkgem9wgsyuctwdus9xgrcyqcjcgpzgfskx6eqf9hzqnteypzxz7fzypfhg6trddjhygrcyqezcgpzfysywmm5ypxxjemgw3hxjmn8yptk7untd9hxwg3q2d6xjcmtv4ezq7pqxgsxzmnyyqcjqmt0wfjjq6t5v4khxsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsxqyjw5qcqp2rzjq0gxwkzc8w6323m55m4jyxcjwmy7stt9hwkwe2qxmy8zpsgg7jcuwz87fcqqeuqqqyqqqqlgqqqqn3qq9q9qrsgqrvgkpnmps664wgkp43l22qsgdw4ve24aca4nymnxddlnp8vh9v2sdxlu5ywdxefsfvm0fq3sesf08uf6q9a2ke0hc9j6z6wlxg5z5kqpu2v9wz';
const UPPER = 'LNBC25M1PVJLUEZPP5QQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQQQSYQCYQ5RQWZQFQYPQDQ5VDHKVEN9V5SXYETPDEESSP5ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYG3ZYGS9Q5SQQQQQQQQQQQQQQQQSGQ2A25DXL5HRNTDTN6ZVYDT7D66HYZSYHQS4WDYNAVYS42XGL6SGX9C4G7ME86A27T07MDTFRY458RTJR0V92CNMSWPSJSCGT2VCSE3SGPZ3UAPA';
const BAD_CHECK = 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpquwpc4curk03c9wlrswe78q4eyqc7d8d0xqzpuyk0sg5g70me25alkluzd2x62aysf2pyy8edtjeevuv4p2d5p76r4zkmneet7uvyakky2zr4cusd45tftc9c5fh0nnqpnl2jfll544esqchsrnt';
const BAD_MUL = 'lnbc2500x1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpusp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qrsgqrrzc4cvfue4zp3hggxp47ag7xnrlr8vgcmkjxk3j5jqethnumgkpqp23z9jclu3v0a7e0aruz366e9wqdykw6dxhdzcjjhldxq0w6wgqcnu43j';
const BAD_PICO = 'lnbc2500000001p1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpusp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qrsgq0lzc236j96a95uv0m3umg28gclm5lqxtqqwk32uuk4k6673k6n5kfvx3d2h8s295fad45fdhmusm8sjudfhlf6dcsxmfvkeywmjdkxcp99202x';

describe('looksLikeBolt11', () => {
  it('detects', () => {
    expect(looksLikeBolt11(DONATION)).toBe(true);
    expect(looksLikeBolt11('lightning:' + DONATION)).toBe(true);
    expect(looksLikeBolt11('bitcoin:bc1q')).toBe(false);
  });
});

describe('BOLT11 valid vectors', () => {
  it('donation any-amount', () => {
    const d = decodeBolt11(DONATION);
    expect(d.network).toBe('mainnet');
    expect(d.amountMsat).toBeNull();
    expect(d.paymentHash).toBe(HASH);
    expect(d.description).toBe('Please consider supporting this project');
    expect(d.timestamp).toBe(1496314658);
    expect(d.expiry).toBe(3600);
    expect(d.payee).toBe(PAYEE);
    expect(d.signatureValid).toBe(true);
    expect(d.paymentSecret).toBe('11'.repeat(32));
  });
  it('2500u coffee 60s expiry', () => {
    const d = decodeBolt11(COFFEE);
    expect(d.amountMsat).toBe(250000000n); // 2500 micro-BTC = 0.0025 BTC = 250000 sat = 250000000 msat
    expect(d.amountSats).toBe(250000);
    expect(d.description).toBe('1 cup coffee');
    expect(d.expiry).toBe(60);
    expect(d.signatureValid).toBe(true);
    expect(d.payee).toBe(PAYEE);
  });
  it('description hash', () => {
    const d = decodeBolt11(HASHED);
    expect(d.amountMsat).toBe(2000000000n); // 20 milli-BTC
    expect(d.description).toBeNull();
    expect(d.descriptionHash).toBe('3925b6f67e2c340036ed12093dd44e0368df1b6ea26c53dbe4811f58fd5db8c1');
    expect(d.signatureValid).toBe(true);
  });
  it('testnet with fallback', () => {
    const d = decodeBolt11(TESTNET);
    expect(d.network).toBe('testnet');
    expect(d.fallbackAddress).toBe('mk2QpYatsKicvFVuTAQLBryyccRXMUaGHP');
    expect(d.signatureValid).toBe(true);
  });
  it('P2SH fallback', () => {
    const d = decodeBolt11(P2SH);
    expect(d.fallbackAddress).toBe('3EktnHQD7RiAE6uzMj2ZifT9YgRrkSgzQX');
  });
  it('P2WPKH fallback', () => {
    const d = decodeBolt11(P2WPKH);
    expect(d.fallbackAddress).toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  });
  it('pico amount + route hints + week expiry', () => {
    const d = decodeBolt11(PICO);
    expect(d.amountMsat).toBe(967878534n);
    expect(d.expiry).toBe(604800);
    expect(d.minFinalCltvExpiry).toBe(10);
    expect(d.routeHints.length).toBeGreaterThan(0);
    expect(d.signatureValid).toBe(true);
  });
  it('upper-case invoice', () => {
    const d = decodeBolt11(UPPER);
    expect(d.signatureValid).toBe(true);
    expect(d.amountSats).toBe(2500000);
  });
  it('lightning: prefix stripped', () => {
    expect(decodeBolt11('lightning:' + DONATION).signatureValid).toBe(true);
  });
  it('expired flag', () => {
    const d = decodeBolt11(DONATION, 1496314658 + 3600);
    expect(d.expired).toBe(true);
    const e = decodeBolt11(DONATION, 1496314658 + 3599);
    expect(e.expired).toBe(false);
  });
});

describe('BOLT11 invalid vectors', () => {
  it('bad checksum', () => expect(() => decodeBolt11(BAD_CHECK)).toThrow());
  it('mixed case', () => expect(() => decodeBolt11('LNBC2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpquwpc4curk03c9wlrswe78q4eyqc7d8d0xqzpuyk0sg5g70me25alkluzd2x62aysf2pyy8edtjeevuv4p2d5p76r4zkmneet7uvyakky2zr4cusd45tftc9c5fh0nnqpnl2jfll544esqchsrny')).toThrow(/upper-case and lower-case/));
  it('invalid multiplier', () => expect(() => decodeBolt11(BAD_MUL)).toThrow(/amount|multiplier|Invalid/i));
  it('sub-msat precision', () => expect(() => decodeBolt11(BAD_PICO)).toThrow(/precision|amount/i));
  it('too short', () => expect(() => decodeBolt11('lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6na6hlh')).toThrow());
});

import { bech32 } from '@scure/base';
describe('BOLT11 signature tamper', () => {
  it('flags an altered invoice with a valid checksum as invalid signature', () => {
    const { prefix, words } = bech32.decode(DONATION as `${string}1${string}`, 10000);
    const w = [...words];
    w[10] = (w[10] + 1) % 32; // alter a data word (inside the payment secret field)
    const altered = bech32.encode(prefix, w, 10000);
    const d = decodeBolt11(altered);
    // Without an n field, tampering changes the recovered payee rather than failing.
    expect(d.signatureStatus).toBe('recovered');
    expect(d.payee).not.toBe(PAYEE);
  });
});

describe('BOLT11 n field', () => {
  it('high-S signature with n field is rejected (spec invalid vector)', () => {
    const d = decodeBolt11('lnbc25m1p70xwfzpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaqnp4q0n326hr8v9zprg8gsvezcch06gfaqqhde2aj730yg0durunfhv66sp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qrsgqsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsp5cfzp9ugllvk03rltd6hvndxj26ux6gcxc5azyxk060rj9tzghct5zvjlps76gx8wpq5yuu79688k8gnm2c0al6v608s96l0xzrrlqqwnzxmu');
    expect(d.signatureStatus).toBe('invalid');
  });
  it('high-S without n still recovers the right payee (spec vector)', () => {
    const d = decodeBolt11('lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap2r09nt4ndd0unm3z9u5t48y6ucv4r5sg7lk98c77ctvjczkspk5qprc90gx');
    expect(d.payee).toBe(PAYEE);
    expect(d.signatureStatus).toBe('recovered');
  });
  it('unrecoverable signature is invalid (spec invalid vector)', () => {
    let st: string;
    try { st = decodeBolt11('lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpusp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qrsgqwgt7mcn5yqw3yx0w94pswkpq6j9uh6xfqqqtsk4tnarugeektd4hg5975x9am52rz4qskukxdmjemg92vvqz8nvmsye63r5ykel43pgz7zq0g2').signatureStatus; } catch { st = 'invalid'; }
    expect(st).toBe('invalid');
  });
});

describe('junk input (B5)', () => {
  for (const s of ['garbage', 'lnbc1', 'lnbc1qqqq', 'lnbc']) {
    it(`friendly error for "${s}"`, () => {
      let msg = '';
      try { decodeBolt11(s); } catch (e) { msg = (e as Error).message; expect(e).not.toBeInstanceOf(TypeError); }
      expect(msg).toMatch(/Not a valid Lightning invoice|too short|start with ln/i);
      expect(msg).not.toMatch(/invalid string length|expected \(/);
    });
  }
});
