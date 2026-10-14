/** BIP-21 bitcoin: URI builder and parser. */

export interface Bip21Parts {
  address: string;
  amountBtc?: string; // exact decimal string, no exponent
  label?: string;
  message?: string;
  lightning?: string; // BIP-21 lightning= fallback
  params: Record<string, string>; // other query params
}

export interface BuildBip21Opts {
  address: string;
  amountBtc?: number | string | null;
  label?: string;
  message?: string;
  /** Uppercase the scheme and bech32 address (smaller QR). Legacy Base58 stays as-is. */
  uppercase?: boolean;
}

/** Format a BTC amount for BIP-21: no scientific notation, ≤ 8 decimals, no trailing zeros after the point except keeping at least one digit if needed. */
export function formatBip21Amount(amount: number | string): string {
  let s: string;
  if (typeof amount === 'number') {
    if (!isFinite(amount) || amount < 0) throw new Error('Amount must be a non-negative number');
    // avoid float artefacts: work in sats
    const sats = Math.round(amount * 1e8);
    if (Math.abs(amount * 1e8 - sats) > 1e-6) throw new Error('Amount has more than 8 decimal places');
    s = (sats / 1e8).toFixed(8);
  } else {
    s = amount.trim();
    if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Amount must be a plain decimal (no scientific notation)');
    const [a, b = ''] = s.split('.');
    if (b.length > 8) throw new Error('Amount has more than 8 decimal places');
    s = b ? `${a}.${b}` : a;
  }
  // strip trailing zeros after decimal, but keep "0" if zero
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  if (s === '' || s === '.') s = '0';
  return s;
}

export function buildBip21(opts: BuildBip21Opts): string {
  const addr = opts.address.trim();
  if (!addr) throw new Error('Address is required');
  const isBech = /^(bc|tb|bcrt)1/i.test(addr);
  let address = opts.uppercase && isBech ? addr.toUpperCase() : addr;
  const q: string[] = [];
  if (opts.amountBtc !== undefined && opts.amountBtc !== null && opts.amountBtc !== '') {
    q.push(`amount=${formatBip21Amount(opts.amountBtc)}`);
  }
  if (opts.label) q.push(`label=${encodeURIComponent(opts.label)}`);
  if (opts.message) q.push(`message=${encodeURIComponent(opts.message)}`);
  let uri = q.length ? `bitcoin:${address}?${q.join('&')}` : `bitcoin:${address}`;
  if (opts.uppercase) {
    // Whole-URI upper case → denser alphanumeric QR. Legacy Base58 addresses are
    // case-sensitive, so only the scheme (and query keys/values) flip for those.
    if (isBech) uri = uri.toUpperCase();
    else uri = 'BITCOIN' + uri.slice('bitcoin'.length);
  }
  return uri;
}

export function parseBip21(raw: string): Bip21Parts {
  const input = raw.trim();
  const m = /^(bitcoin):([^?]+)(\?(.*))?$/i.exec(input);
  if (!m) throw new Error('Not a bitcoin: payment URI');
  const address = m[2];
  const params: Record<string, string> = {};
  if (m[4]) {
    for (const part of m[4].split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const k = decodeURIComponent((eq < 0 ? part : part.slice(0, eq)).toLowerCase());
      const v = decodeURIComponent(eq < 0 ? '' : part.slice(eq + 1));
      params[k] = v;
    }
  }
  let amountBtc: string | undefined;
  if (params.amount !== undefined) {
    amountBtc = formatBip21Amount(params.amount);
  }
  return {
    address,
    amountBtc,
    label: params.label,
    message: params.message,
    lightning: params.lightning,
    params,
  };
}
