/**
 * v1 golden query set: 15 queries. Deliberately smaller than ADR 0002's
 * 100-200 target - per the BM25/hybrid spec's own definition of done, "a
 * real eval harness with 40 queries beats a theoretically complete fusion
 * pipeline with no way to check it actually works better." This is a
 * runnable, honestly-scoped v1; growing the set is the natural next step,
 * not a redesign.
 *
 * Categories, per the spec: exact-name, paraphrase/intent, filtered
 * (network/price/asset), no-result, and adversarial (keyword-stuffing /
 * metadata-gaming).
 */
export type QueryCategory = 'exact-name' | 'paraphrase' | 'filtered' | 'no-result' | 'adversarial';

export interface GoldenQuery {
  id: string;
  text: string;
  category: QueryCategory;
}

export const GOLDEN_QUERIES: GoldenQuery[] = [
  { id: 'q1', text: 'WeatherCo', category: 'exact-name' },
  { id: 'q2', text: 'TickerPulse', category: 'exact-name' },
  { id: 'q3', text: 'MoodLens', category: 'exact-name' },
  { id: 'q4', text: 'is it going to rain tomorrow', category: 'paraphrase' },
  { id: 'q5', text: 'how much is bitcoin worth right now', category: 'paraphrase' },
  { id: 'q6', text: 'help me understand this foreign text', category: 'paraphrase' },
  { id: 'q7', text: 'is my flight delayed', category: 'paraphrase' },
  { id: 'q8', text: 'what can I cook with what is in my fridge', category: 'paraphrase' },
  { id: 'q9', text: 'which team won last night', category: 'paraphrase' },
  { id: 'q10', text: 'weather forecast on stellar:testnet', category: 'filtered' },
  { id: 'q11', text: 'cryptocurrency prices on stellar:pubnet', category: 'filtered' },
  { id: 'q12', text: 'currency conversion under 5', category: 'filtered' },
  { id: 'q13', text: 'compose a symphony from scratch', category: 'no-result' },
  { id: 'q14', text: 'predict next week lottery numbers', category: 'no-result' },
  { id: 'q15', text: 'weather forecast', category: 'adversarial' },
];
