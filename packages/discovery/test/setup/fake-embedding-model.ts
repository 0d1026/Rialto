import type { EmbeddingModel } from '../../src/search/embedding-model.js';

/**
 * A small, deterministic, offline stand-in for the real model - NOT a real
 * semantic embedding, and it doesn't need to be. It exists to test the
 * plumbing around embeddings (worker claim/backoff/dead-letter, generation
 * versioning, cosine ranking, dense.ts wiring) fast and without network
 * access. It hand-maps a few topic keyword clusters to distinguishable
 * basis vectors, so a query and a resource that share a *topic* but no
 * *vocabulary* (e.g. "climate outlook" vs a resource whose synthetic query
 * says "weather forecast") still land close in this fake space - enough to
 * prove the retrieval mechanism correctly favors the right resource without
 * needing the real model loaded for every test.
 *
 * The one acceptance-criterion test that must prove real paraphrase
 * matching works end to end uses the real localEmbeddingModel() instead -
 * see test/unit/11.dense-retrieval.spec.ts's [MODEL] block.
 */

const TOPIC_CLUSTERS: Record<string, string[]> = {
  weather: ['weather', 'forecast', 'climate', 'rain', 'temperature', 'meteorology', 'storm', 'outlook'],
  finance: ['stock', 'finance', 'market', 'trading', 'investment', 'ticker', 'price', 'equity'],
  translation: ['translate', 'translation', 'language', 'multilingual', 'localize'],
};
const TOPICS = Object.keys(TOPIC_CLUSTERS);
const DIMENSION = TOPICS.length + 8; // topic dims + a few hash dims for tie-breaking/uniqueness

function hashDims(text: string, n: number): number[] {
  const out = new Array(n).fill(0);
  for (let i = 0; i < text.length; i++) {
    out[i % n] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  return out.map((v) => (v / norm) * 0.1); // small magnitude: topic signal should dominate
}

function embedOne(text: string): number[] {
  const lower = text.toLowerCase();
  const topicScores = TOPICS.map((topic) => {
    const keywords = TOPIC_CLUSTERS[topic];
    const hits = keywords.filter((k) => lower.includes(k)).length;
    return hits;
  });
  const vec = [...topicScores, ...hashDims(lower, DIMENSION - TOPICS.length)];
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function fakeEmbeddingModel(): EmbeddingModel {
  return {
    modelId: 'fake-topic-cluster-v1',
    revision: 'test',
    dimension: DIMENSION,
    pooling: 'none',
    normalization: 'l2',
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map(embedOne);
    },
  };
}
