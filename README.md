# Bitcoin Tools

Simple, private Bitcoin tools that explain every result in plain English.

**Live:** https://kkarasavvas.com/bitcoin-tools/ (karask.github.io/bitcoin-tools redirects here)

| Tool | What it does |
|---|---|
| [Fee checker](https://kkarasavvas.com/bitcoin-tools/tools/bitcoin-fee-checker/) | Fee rates for ~10 min / ~1 h / ~1 day, total cost in sats, USD, EUR |
| [Stuck transaction helper](https://kkarasavvas.com/bitcoin-tools/tools/stuck-bitcoin-transaction/) | Why a tx is unconfirmed; wait / RBF / CPFP with target fees |
| [Address checker](https://kkarasavvas.com/bitcoin-tools/tools/bitcoin-address-checker/) | Local validation: network, type, checksum/typo, bech32 vs bech32m |
| [Transaction explainer](https://kkarasavvas.com/bitcoin-tools/tools/bitcoin-transaction-explainer/) | Plain-English summary of any txid |
| [Converter](https://kkarasavvas.com/bitcoin-tools/tools/sats-btc-converter/) | sats / BTC / USD / EUR, live and historical |
| [Quantum exposure checker](https://kkarasavvas.com/bitcoin-tools/tools/bitcoin-quantum-exposure-checker/) | Whether an address's public key is revealed on-chain |

## Privacy stance

- Static site: no backend, no analytics, no cookies, no third-party scripts.
- Never asks for keys or seeds.
- Address validation runs locally. Live data (fees, prices, txids, and addresses only where a tool needs them) is fetched by your browser directly from the public [mempool.space](https://mempool.space) API, only when needed. See `/privacy/`.

## Development

```sh
npm install
npm run dev     # http://localhost:4321/bitcoin-tools/
npm test        # vitest unit tests (BIP-173/350 vectors, RBF, CPFP, fee math, quantum classification)
npm run build   # static output in dist/
```

Pure logic lives in `src/lib/` (tested); small client-side scripts in `src/scripts/`; pages in `src/pages/`.

Deployment: pushing to `main` runs tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
For a custom domain, build with `SITE=https://example.com BASE=/` and add `public/CNAME`.

## License

MIT © Kostas Karasavvas
