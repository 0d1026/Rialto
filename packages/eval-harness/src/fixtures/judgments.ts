/**
 * Graded relevance judgments (0-3 scale), one entry per query for every
 * catalog resource judged relevant at all - any (query, resource) pair not
 * listed here was reviewed and judged not relevant (0), not left unjudged.
 * At this catalog size (18 resources, section "seed-catalog.ts"), full
 * judgment per query is more thorough than pooling candidates from the
 * three rankers and cheap enough to just do directly.
 *
 * Rubric:
 *   3 - directly answers the query; this is what the agent was looking for
 *   2 - clearly on-topic and would satisfy the query, but not the best answer
 *   1 - tangentially related (adjacent domain, or on-topic but low quality/
 *       spam-like content that shouldn't be trusted as the top answer)
 *   0 - not relevant, OR fails an explicit hard constraint in the query
 *       (wrong network, over budget) regardless of topical relevance -
 *       see q10, where weather-forecast-stuffed is topically about weather
 *       but on the wrong network and is graded 0 for THAT query specifically
 *
 * Judge methodology and its limitation, stated plainly: these judgments
 * were produced by Claude (the same model building this harness), in a
 * single pass, with the rubric above. ADR 0002 and the BM25/hybrid spec
 * both call for a judge model different from whatever generates synthetic
 * queries/embeddings, plus a tracked human-audit sample with an agreement
 * rate. Neither is true of this v1: there was no separately-provisioned
 * judge model available in this environment, and no independent human
 * audit pass has been run yet. This is the single most significant
 * methodology gap versus what ADR 0002 describes, stated here rather than
 * hidden - upgrading it (real second-model judging, a tracked human-audit
 * sample) is the natural next step for this harness, not a redesign.
 */
export type Judgment = 0 | 1 | 2 | 3;

export const JUDGMENTS: Record<string, Record<string, Judgment>> = {
  q1: {
    // "WeatherCo" - exact-name
    'https://eval.example.com/weather-forecast': 3,
    'https://eval.example.com/weather-forecast-stuffed': 1,
  },
  q2: {
    // "TickerPulse" - exact-name (both the HTTP resource and its MCP tool variant share the name)
    'https://eval.example.com/stock-ticker': 3,
    'https://eval.example.com/stock-ticker-tool': 3,
  },
  q3: {
    // "MoodLens" - exact-name
    'https://eval.example.com/sentiment-analysis': 3,
  },
  q4: {
    // "is it going to rain tomorrow" - paraphrase
    'https://eval.example.com/weather-forecast': 3,
    'https://eval.example.com/weather-forecast-stuffed': 1,
  },
  q5: {
    // "how much is bitcoin worth right now" - paraphrase
    'https://eval.example.com/crypto-prices': 3,
    'https://eval.example.com/stock-ticker': 1,
    'https://eval.example.com/stock-ticker-tool': 1,
  },
  q6: {
    // "help me understand this foreign text" - paraphrase
    'https://eval.example.com/translate-api': 3,
  },
  q7: {
    // "is my flight delayed" - paraphrase
    'https://eval.example.com/flight-status': 3,
  },
  q8: {
    // "what can I cook with what is in my fridge" - paraphrase
    'https://eval.example.com/recipe-finder': 3,
  },
  q9: {
    // "which team won last night" - paraphrase
    'https://eval.example.com/sports-scores': 3,
  },
  q10: {
    // "weather forecast on stellar:testnet" - filtered (network hard filter)
    // weather-forecast-stuffed is topically about weather but lives on
    // stellar:pubnet - graded 0 HERE specifically because it fails the
    // query's explicit network constraint, not because it's off-topic.
    'https://eval.example.com/weather-forecast': 3,
  },
  q11: {
    // "cryptocurrency prices on stellar:pubnet" - filtered (network hard filter)
    'https://eval.example.com/crypto-prices': 3,
  },
  q12: {
    // "currency conversion under 5" - filtered (price hard filter)
    'https://eval.example.com/currency-convert': 3,
  },
  q13: {
    // "compose a symphony from scratch" - no-result (deliberately: nothing in the catalog answers this)
  },
  q14: {
    // "predict next week lottery numbers" - no-result
  },
  q15: {
    // "weather forecast" - adversarial: the genuine listing must outrank
    // the keyword-stuffed near-duplicate despite its heavier term repetition.
    'https://eval.example.com/weather-forecast': 3,
    'https://eval.example.com/weather-forecast-stuffed': 1,
  },
};
