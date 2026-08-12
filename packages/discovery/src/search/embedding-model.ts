/**
 * The embedding backend is an injected interface, not a hardwired import:
 * the embedding worker and dense.ts depend on this, not on
 * @huggingface/transformers directly. Production wiring (index.ts) uses
 * localEmbeddingModel() below; tests inject a small deterministic fake
 * (test/setup/fake-embedding-model.ts) so the worker/queue/generation-
 * versioning suite doesn't need network access or a multi-second model
 * load on every run. The one test that must exercise the real model
 * (paraphrase retrieval actually working) does so explicitly - see
 * test/unit/11.dense-retrieval.spec.ts's [MODEL] block.
 */
export interface EmbeddingModel {
  modelId: string;
  revision: string;
  dimension: number;
  pooling: string;
  normalization: string;
  embed(texts: string[]): Promise<number[][]>;
}

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const REVISION = 'main';
const DIMENSION = 384;

/**
 * Local, offline sentence embeddings via transformers.js (ONNX runtime,
 * in-process - no external API, no per-call cost). Model weights download
 * once from the Hugging Face hub on first use and are cached locally by
 * the library afterward (see EMBEDDING_CACHE_DIR below).
 *
 * Chosen model: all-MiniLM-L6-v2, 384 dimensions, mean-pooled + L2-
 * normalized sentence embeddings - a well-established, small (~90MB), fast-
 * on-CPU general-purpose model, a reasonable default for a v1 with no
 * corpus-specific tuning data yet.
 */
export function localEmbeddingModel(): EmbeddingModel {
  let pipelinePromise: Promise<unknown> | undefined;

  async function getPipeline(): Promise<
    (texts: string[], opts: { pooling: string; normalize: boolean }) => Promise<{
      tolist(): number[][];
    }>
  > {
    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        if (process.env.EMBEDDING_CACHE_DIR) {
          env.cacheDir = process.env.EMBEDDING_CACHE_DIR;
        }
        return pipeline('feature-extraction', MODEL_ID, { revision: REVISION });
      })();
    }
    return pipelinePromise as ReturnType<typeof getPipeline>;
  }

  return {
    modelId: MODEL_ID,
    revision: REVISION,
    dimension: DIMENSION,
    pooling: 'mean',
    normalization: 'l2',
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const extractor = await getPipeline();
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist();
    },
  };
}
