/**
 * Query-derived structured constraints: a network, asset, or price
 * mentioned in the query text applies as a hard filter against structured
 * fields (resources.accepts), not more text handed to the dense arm - a
 * semantic embedding model has no way to "understand" that
 * "stellar:testnet" must match exactly, so it's stripped out and applied
 * as SQL instead.
 *
 * Deliberately scoped: network detection is exact (the two real CAIP-2 ids
 * this catalog uses) and is what the stage 3 acceptance criteria actually
 * test. Asset and price detection are best-effort v1s - asset against a
 * small known vocabulary, price as a simple "under/below $N" pattern
 * comparing the raw stored amount (not currency/unit-normalized). Both are
 * documented limitations, not hidden behavior.
 */
export interface StructuredConstraints {
  network?: 'stellar:testnet' | 'stellar:pubnet';
  asset?: string;
  maxAmount?: string;
  /** query text with recognized constraint tokens removed, for the lexical/dense arms */
  strippedQuery: string;
}

const NETWORK_PATTERN = /\bstellar:(testnet|pubnet)\b/i;
const KNOWN_ASSETS = ['XLM', 'USDC', 'native'];
const PRICE_PATTERN = /\b(?:under|below|less than|cheaper than)\s*\$?(\d+(?:\.\d+)?)/i;

export function extractStructuredConstraints(query: string): StructuredConstraints {
  let stripped = query;
  const out: StructuredConstraints = { strippedQuery: query };

  const networkMatch = NETWORK_PATTERN.exec(query);
  if (networkMatch) {
    out.network = `stellar:${networkMatch[1].toLowerCase()}` as StructuredConstraints['network'];
    stripped = stripped.replace(networkMatch[0], ' ');
  }

  for (const asset of KNOWN_ASSETS) {
    const re = new RegExp(`\\b${asset}\\b`, 'i');
    const m = re.exec(stripped);
    if (m) {
      out.asset = asset;
      stripped = stripped.replace(m[0], ' ');
      break;
    }
  }

  const priceMatch = PRICE_PATTERN.exec(stripped);
  if (priceMatch) {
    out.maxAmount = priceMatch[1];
    stripped = stripped.replace(priceMatch[0], ' ');
  }

  out.strippedQuery = stripped.replace(/\s+/g, ' ').trim();
  return out;
}
