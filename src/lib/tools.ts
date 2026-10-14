export const TOOLS = [
  { slug: 'bitcoin-fee-checker', name: 'Fee checker', icon: '⛽', blurb: 'What fee to pay right now to confirm in about 10 minutes, an hour, or a day.' },
  { slug: 'stuck-bitcoin-transaction', name: 'Stuck transaction helper', icon: '⏳', blurb: 'Paste a transaction ID to learn why it is stuck and whether to wait, use RBF or CPFP.' },
  { slug: 'bitcoin-address-checker', name: 'Address checker', icon: '✅', blurb: 'Check an address for typos, the wrong network, and its type — entirely in your browser.' },
  { slug: 'bitcoin-transaction-explainer', name: 'Transaction explainer', icon: '🔎', blurb: 'Turn any transaction ID into a plain-English summary of who paid what.' },
  { slug: 'sats-btc-converter', name: 'Sats / BTC / fiat converter', icon: '💱', blurb: 'Convert between sats, BTC, USD and EUR — today or on any past date.' },
  { slug: 'bitcoin-quantum-exposure-checker', name: 'Quantum exposure checker', icon: '🛡️', blurb: 'See whether an address has revealed its public key on-chain, and what that means.' },
] as const;
export const COMING_SOON = ['PSBT and transaction decoder', 'Transaction size calculator', 'Script explainer', 'Key and address converter', 'Sign and verify message'];
export const REPO = 'https://github.com/karask/bitcoin-tools';
