// The toolbox. Adding a tool here puts it in the toolbox sidebar and the ⌘K search.
// Order matters: tools are listed in this order, grouped by category.
export const CATEGORIES = [
  { id: 'addresses', name: 'Addresses', blurb: 'Check where coins go and what an address reveals.' },
  { id: 'transactions', name: 'Transactions', blurb: 'Understand a payment, or rescue one that is stuck.' },
  { id: 'money', name: 'Money & fees', blurb: 'Amounts, prices and what it costs to send.' },
  { id: 'keys', name: 'Keys & scripts', blurb: 'Signatures, keys and the scripts that lock coins.' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface ToolInfo {
  slug: string; name: string; icon: string; category: CategoryId; blurb: string;
  /** true if the tool works entirely in the browser; false if it fetches from mempool.space */
  local: boolean;
  keywords: string;
}

export const TOOLS: readonly ToolInfo[] = [
  { slug: 'bitcoin-address-checker', name: 'Address checker', icon: 'address', category: 'addresses', local: true, keywords: 'validate bech32 bech32m taproot segwit legacy typo checksum network', blurb: 'Check an address for typos, the wrong network, and its type — entirely in your browser.' },
  { slug: 'bitcoin-qr-code-generator', name: 'Receive address QR', icon: 'qr', category: 'addresses', local: true, keywords: 'bip21 uri qr code receive payment request amount label message', blurb: 'Turn an address into a BIP-21 payment link and a scannable QR code, with optional amount and label.' },
  { slug: 'bitcoin-quantum-exposure-checker', name: 'Quantum exposure checker', icon: 'quantum', category: 'addresses', local: false, keywords: 'public key exposed reuse quantum computer bip-360 security', blurb: 'See whether an address has revealed its public key on-chain, and what that means.' },
  { slug: 'bitcoin-transaction-explainer', name: 'Transaction explainer', icon: 'explain', category: 'transactions', local: false, keywords: 'txid decode inputs outputs change fee rate confirmations op_return', blurb: 'Turn any transaction ID into a plain-English summary of who paid what.' },
  { slug: 'bitcoin-payment-tracker', name: 'Payment tracker', icon: 'track', category: 'transactions', local: false, keywords: 'confirmations mempool watch payment incoming status refresh', blurb: 'Watch a transaction or address for confirmation status — refreshes while you keep the page open.' },
  { slug: 'stuck-bitcoin-transaction', name: 'Stuck transaction helper', icon: 'stuck', category: 'transactions', local: false, keywords: 'unconfirmed pending rbf cpfp bump speed up accelerate mempool', blurb: 'Paste a transaction ID to learn why it is stuck and whether to wait, use RBF or CPFP.' },
  { slug: 'bitcoin-payment-request-decoder', name: 'Payment request decoder', icon: 'invoice', category: 'transactions', local: true, keywords: 'bip21 bolt11 lightning invoice decode uri payment request', blurb: 'Decode a bitcoin: URI or Lightning invoice (BOLT11) into a plain-English summary — entirely offline.' },
  { slug: 'sats-btc-converter', name: 'Sats / BTC / fiat converter', icon: 'convert', category: 'money', local: false, keywords: 'satoshi usd eur dollar euro price historical calculator', blurb: 'Convert between sats, BTC, USD and EUR — today or on any past date.' },
  { slug: 'bitcoin-fee-checker', name: 'Fee checker', icon: 'fee', category: 'money', local: false, keywords: 'sat/vb fee rate estimate mempool cost vbytes', blurb: 'What fee to pay right now to confirm in about 10 minutes, an hour, or a day.' },
];

export const COMING_SOON: { name: string; category: CategoryId }[] = [
  { name: 'PSBT and transaction decoder', category: 'transactions' },
  { name: 'Transaction size calculator', category: 'money' },
  { name: 'Key and address converter', category: 'addresses' },
  { name: 'Script explainer', category: 'keys' },
  { name: 'Sign and verify message', category: 'keys' },
];

/** Categories that have at least one live tool, each with its tools in toolbox order. */
export const GROUPS = CATEGORIES.map((c) => ({ ...c, tools: TOOLS.filter((t) => t.category === c.id) })).filter((g) => g.tools.length);
export const categoryOf = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;
export const REPO = 'https://github.com/karask/bitcoin-tools';
