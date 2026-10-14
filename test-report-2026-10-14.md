# Bitcoin Tools: test report, 2026-10-14 (18:30 Athens time)

Site: https://kkarasavvas.com/bitcoin-tools/ (karask.github.io/bitcoin-tools gives a 301 redirect here)
How it works: a static Astro site with no backend. All live data comes from the browser calling the **mainnet** mempool.space API (`src/lib/api.ts`, `API = https://mempool.space/api`, which is hard-coded).
Method: I ran the real `src/lib/*` logic against the live mempool.space mainnet API, using a throwaway harness in `.qa/` (`live.test.ts`, `pay.test.ts`; the site code was not modified). I also made HTTP checks against the live pages, and the repo unit tests pass (107/107).

## Why I made no Signet/testnet transaction
The site only works with **mainnet**. It has no network switch, and every txid or address lookup goes to mainnet mempool.space. Its tools reject test-network addresses ("This tool checks mainnet addresses only"), and test-network txids come back as "not found on Bitcoin mainnet". A Signet transaction would therefore only test the not-found path, and I tested that from the code and the API. I also did not use real mainnet money, as instructed. As a substitute, I ran the stuck-tx logic on **live mainnet mempool transactions** paying 1–2 sat/vB.
Context: the mempool fee market right now is 1 sat/vB at every tier (fastest, half-hour, hour, economy and minimum). A minimum-fee transaction would therefore confirm in the next block and **cannot get stuck at the moment**.

## 1–2. Payment status / stuck tx
| Test | Expected | Actual | Result |
|---|---|---|---|
| 416c670b…b49c (1.00 sat/vB, RBF) with fees all at 1 | advice "wait", RBF replacement fee = old fee + 1×vsize = 308 | wait, rbfFee 308, CPFP child fee 110 (= 1×(154+110)−154) | PASS |
| 5a2729ff…b76c (2.02 sat/vB, no RBF) | wait | wait, position above-fast | PASS |
| 6 more live mempool txs (1.06–5.03 sat/vB) | wait | wait, fee maths correct | PASS |
| Confirmed tx (f4184fc5…, block 170) | confirmed, confirmation count = tip−170+1 | confirmed, 971251 confirmations | PASS |
| Genesis coinbase txid | confirmed | confirmed, block 0 | PASS |
| Unknown or Signet txid | "not found" with an explanation that mentions testnet/signet | NOT_FOUND_NOTE does mention it | PASS |
| Actual RBF/CPFP bump on a stuck tx | n/a | not possible: nothing is stuck at 1 sat/vB, and the site is mainnet-only | NOT TESTED |
Code review: the advice logic (rbf / cpfp / rbf-or-cpfp / wait-or-accelerate) and the CPFP package maths (including ancestors, the child-self floor and min relay) are correct and covered by unit tests.

## 3. Payment request (BIP-21 / BOLT11 decoder, QR)
| Input | Expected | Actual | Result |
|---|---|---|---|
| `bitcoin:bc1q…?amount=0.001&label=Test&message=hi%20there` | parsed, message URL-decoded | parsed correctly | PASS |
| testnet address URI, amount 0.00001 | parsed | parsed | PASS |
| `amount=1e-3` | rejected | rejected with "no scientific notation" | PASS |
| `amount=0.123456789` | rejected | rejected with ">8 decimals" | PASS |
| `amount=-1` | rejected with a clear message | rejected, but the message wrongly says "no scientific notation" | FAIL (low), bug B3 |
| `amount=21000001` | warn or reject (more than the 21M supply) | accepted silently | FAIL (low), bug B4 |
| `req-foo=1` | treated as invalid | the parser keeps it and the UI shows an "Unsupported required parameter" red verdict | PASS |
| BOLT11 spec vector `lnbc2500u…` | decodes, mainnet | decodes | PASS |
| Corrupted `lntb…` | checksum error | "Invalid checksum" | PASS |
| `garbage`, `lnbc1` | friendly error | raw library error "TypeError: invalid string length 7, expected (8..9007199254740991)" | FAIL (low), bug B5 |
| QR rendering, live amount/status update | needs a browser | not tested | NOT TESTED |

## 4. Address checker (compared with mempool.space /v1/validate-address)
All of these matched mempool.space: valid mainnet P2PKH (1A1zP1…, 12cbQL…, 1HLoD9…), P2SH (3J98t1…), P2WPKH (bc1qar0…), P2WSH (bc1qrp33…), P2TR (bc1p5d7r…), P2A (bc1pfeessrawgf), and an upper-case bech32 address (valid, with an upper-case warning). Rejected inputs also matched: bad checksums in base58 and bech32, v0 written with bech32m (or v1+ written with bech32, which gives a checksum error), mixed case, a Litecoin address (unknown version byte), extra characters, and a bcrt address with a bad checksum.
Local-only cases: tb1q P2WSH (BIP-173 vector), tb1p P2TR, m… P2PKH and 2… P2SH are all identified as testnet/signet. mempool's mainnet endpoint calls them invalid, which is expected. Empty input, whitespace padding (trimmed, then valid), `hello world` (spaces message), a `bitcoin:` URI (told to strip it), 200 zeros (invalid character "0") and `1` (wrong length) all gave sensible messages. **All PASS (28 cases).**

## 5. Quantum exposure checker (live mainnet data)
| Address | Expected | Actual | Result |
|---|---|---|---|
| bc1qar0… (P2WPKH, spent once, balance 0.18 BTC) | exposed, reused with balance | exposed, with the move-funds advice | PASS |
| bc1p5d7r… (P2TR, never spent) | exposed (key is in the address) | exposed | PASS |
| 3J98t1… (P2SH, spent 379×) | depends / probably exposed | depends | PASS |
| bc1qrp33… (P2WSH, spent) | depends | depends | PASS |
| Raw 02/03/04 pubkey (P2PK) | exposed | exposed (by code path) | PASS |
| testnet address, invalid input | rejected | "mainnet only" / invalid | PASS |
| **1A1zP1eP5… (genesis address, ~57.6 BTC)** | **exposed**: its pubkey sits in the P2PK genesis coinbase output | **not-exposed (green "Public key not revealed")** | **FAIL (medium), bug B1** |
| 12cbQLTF… (Satoshi block-9 key, P2PK coinbase), 1HLoD9… | exposed (P2PK history) | not-exposed | FAIL, same bug B1 |

## General
All 10 pages return 200 in under 0.35 s, an unknown path returns 404, and the viewport meta tag is present. API errors (404/400/429/timeout) are mapped to plain-English messages.

## Bugs
- **B1 (Medium). The quantum checker says "not exposed" for P2PKH addresses whose key was exposed through P2PK outputs**, including the famous genesis address. Repro: open the quantum checker and enter `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`. You get a green "Public key not revealed on-chain". There is a small-print caveat that even names the genesis address, but the headline verdict is wrong for exactly the Satoshi-era coins this tool will be tested on. Fix: check whether the address's funding txos include `p2pk` outputs for the same hash160. mempool's `/address/:addr/txs` vouts give scriptpubkey_type p2pk with the pubkey, so hash it and compare. At a minimum, show a warn verdict instead of ok for addresses funded before about 2010.
- **B2 (Low). CPFP "spendable output" uses a flat 546-sat dust limit** (`analyzeStuck`, tx.ts). P2WPKH/P2TR outputs between 294/330 and 545 sats are wrongly treated as unusable for CPFP. `cpfp.ts` already has per-type DUST values, so use those.
- **B3 (Low). BIP-21 negative amount gives a misleading error.** Repro: decode `bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=-1`. It says "no scientific notation" when it should say "amount must be positive".
- **B4 (Low). BIP-21 amounts above 21,000,000 BTC are accepted without a warning.** Repro: `?amount=21000001`.
- **B5 (Low). The BOLT11 decoder exposes raw library errors for short or garbage input.** Repro: paste `garbage` or `lnbc1`. You get "TypeError: invalid string length 7, expected (8..9007199254740991)". Wrap it as "Not a valid Lightning invoice".
- **Limitation / feature gap (Info). Mainnet only.** No Signet/testnet support for payment status, the explainer or the quantum checker. That limits safe end-to-end testing of the stuck-tx flow, and developers can't use it with test coins. Consider a network toggle that switches to mempool.space/signet/api.

## Not tested (needs a browser)
QR code image rendering and scanning; ⌘K search and the sidebar; live DOM updates and status refresh in the payment-status tool; mobile layout visuals; the converter and fee checker UI with live prices; CPFP PSBT download in the UI.

---
# Retest, 2026-10-14 18:45–19:30 (Athens), after bbb7215 + 067b272
Unit tests: 136/136 pass. All 10 pages return 200, an unknown path returns 404, and the github.io 301 redirect works. The network picker (mainnet/signet/testnet4) is present on the stuck, explainer, quantum and fee pages. The address checker has none, as intended, since it validates locally.
Harness: `.qa/live.test.ts` (fixed: txs that are gone from the mempool or have no inputs are now skipped instead of passed to `analyzeStuck`, and the quantum test now passes hash160) and `.qa/retest.test.ts` (Signet, B1–B5).

## Bug retests
| Bug | Check | Result |
|---|---|---|
| B1 | 1A1zP1… (genesis), 12cbQLTF…, 1HLoD9…, 12c6DSiU… → `exposed` (reason: early P2PK output). 1BvBMSEY… (spent 5321×) → exposed. The not-exposed verdict is now always amber (`kind='warn'`) with "its own history has not revealed…" | PASS |
| B2 | dustFor: p2wpkh 294, p2tr/p2wsh 330, p2sh 540, p2pkh 546. Outputs of 300 (p2wpkh) are counted as spendable, 329 (p2tr) and 545 (p2pkh) are excluded | PASS |
| B3 | `amount=-1` and `-0.5` → "Amount must be positive" | PASS |
| B4 | `amount=21000001` rejected; 21000000 accepted. buildBip21/QR rejects more than 21M. The converter shows a "more than 21,000,000 BTC" note (present in the deployed JS) | PASS (converter/QR checked in code and JS; visual check needs a browser) |
| B5 | `garbage`, `lnbc1`, `lnbc`, 5000×`x` → "Not a valid Lightning invoice…"; empty → "Paste a Lightning invoice" | PASS |

## End-to-end Signet test (stuck → CPFP)
Signet was chosen because the new picker supports it, coins are free, and blocks come from a single signer.
1. Faucet (faucet.rgbmap.org API, no captcha): **6360301a997db532acb007dabbb36fa536ee7b128f3469748746d57b7f7d3b40**, 50,000 sats to tb1qhjydlg8x983kvyfmudsgtay24dtn84aa7gc0pm (key in /workspace/qa_signet_key.wif, test coins only). Confirmed in block 326342.
2. Low-fee tx **f79ebf7e719de4fc2017a0cd0d7cd087af93177e01c289a19c8b101a16a1c30a**: 141 vB, 15 sats fee = **0.106 sat/vB**, signals RBF (nSequence 0xfffffffd), 20,000 to the recipient + 29,985 change to me. **Accepted by mempool.space Signet** (sub-1 sat/vB relay works). It was **not** included in block 326342 (19:09), so it was stuck.
3. Stuck tool analysis (`analyzeStuck` with live Signet data, effective rate from /v1/cpfp): position `below-minimum`, rbf=true, spendable outputs [0,1], advice **rbf-or-cpfp**, RBF fee **156** (=15+141×1 incremental, and ≥1 sat/vB × 141 ✔), CPFP child fee **236** for a 110 vB child (=1×(141+110)−15 ✔). ETA wording: "below what most queues are currently requiring…" ✔. **PASS**
4. Bump performed as advised: CPFP child **689ea9b111d3b64d988624c0e43765a64affc14ff35606b64df759dd50df6a5c** (spends change vout 1, fee 236). Its actual vsize was **110 vB, exactly as the tool predicted**. The tool then reported the parent's effective rate at 1.006 sat/vB, flipped the advice to `wait`, and the UI text shows the effective rate together with "on its own it pays 0.11". **PASS**
5. However, the 1.006 sat/vB package was **still not mined in block 326342**. The Signet mempool held ~255k vB at 1.003–9 sat/vB, but mempool.space `fees/recommended` reported 1 for every tier. To finish the test I RBF-replaced the child with **14fa6ba3b3963c638f5b13f8589f03017e79bb49375f1b4016487721a712b284** (fee 740, package ≈3 sat/vB). Confirmation status: see the addendum below.

## New findings
- **B6 (Low–Medium), live now.** The payment-status "No incoming payments found yet" message shows the literal text `${NET_NAME[currentNet()]}`. In `src/scripts/stuck.ts:48` the string is in single quotes, not backticks, and the deployed bundle hoisted.3-zPBU4g.js contains the literal. Repro: stuck tool, enter a fresh, never-used address (e.g. `?network=signet` with a new tb1 address). Fix: use a template literal.
- **B7 (Low). Bump target is just the fee estimate.** When mempool.space reports every tier as 1 sat/vB, the tool's target (halfHourFee) equals the floor, so a bump "to target" can still sit behind a large queue of 1.00x sat/vB txs (seen on Signet: advice said 'wait' at 1.006 but the package was skipped by the next block). Suggestion: when the tiers collapse to the minimum, compare against `/v1/fees/mempool-blocks` (projected next-block median/range) and add +1 sat/vB or a "target slightly above the queue" hint. Mainnet has the same pattern today (all tiers = 1).
- Info: a non-numeric BIP-21 amount (`amount=abc`) says "no scientific notation". Better: "Amount must be a number".

## Regression (earlier tests)
- Address checker: all 28 earlier cases are unchanged, PASS. (Note: my earlier `BC1QW508…FAJ9`/`tb1qw508…faj9` inputs were mistyped vectors and are correctly rejected by mempool.space as well. Valid upper-case `BC1QAR0SRRR7…` and BIP-173 `tb1qrp33…0sl5k7` are accepted.)
- Quantum: P2TR exposed, reused P2WPKH exposed + move-funds advice, P2SH/P2WSH spent → depends. PASS
- Stuck on mainnet: 8 live mempool txs (1.0–14.5 sat/vB) → wait, RBF/CPFP maths correct; genesis/confirmed tracking correct. PASS
- BIP-21 parse (label/message decoding, >8 decimals, sci notation, req- params), BOLT11 spec vector. PASS

## Still needs a browser
QR image rendering and scanning; picker interaction and the ?network persistence across links; the CPFP PSBT builder UI and download (I built the child with python-bitcoin-utils instead); converter warning display; mobile layout; ⌘K search.

### Addendum (19:21 Athens)
Parent f79ebf7e… and replacement child 14fa6ba3… were **both confirmed in Signet block 326343 (19:19:37 Athens time)**. The first child 689ea9b1… was replaced and now returns 404, so the tool shows its not-found note, which mentions RBF replacement ✔. On the parent, the stuck tool reports advice `confirmed`, 1 confirmation ✔. The end-to-end flow worked: low fee → stuck → correct advice → CPFP → bump to a higher target (needed because of B7) → confirmed.
