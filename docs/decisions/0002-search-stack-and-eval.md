# ADR 0002: Search runs on PostgreSQL hybrid retrieval, with quality proven by a public evaluation harness

Status: accepted · 2026-08-08

## Context

The Bazaar discovery layer must serve `GET /discovery/resources` (structured filters) and
`GET /discovery/search` (natural-language queries, cursor pagination, `partialResults`).
The corpus is small - the entire global Bazaar index is ~14,000 short, structured entries
today - so ranking quality, not scale, is the engineering problem. Queries are
agent-issued intents ("weather API that takes USDC on stellar"), which mix topical
matching with hard structured constraints.

## Decision

**Store:** one PostgreSQL instance holds the catalog, both discovery endpoints, and both
retrieval arms - `pgvector` for embeddings, a true BM25 extension for lexical search
(plain `tsvector` ranking lacks IDF and misranks tag-heavy short documents). At this
corpus size, exact vector scan is used deliberately - an ANN index adds complexity for
zero recall gain.

**Retrieval:** two arms in parallel - lexical (BM25 over name/tags/descriptions/parameter
descriptions) and semantic (a local, permissively-licensed embedding model, run
in-process so the self-hosted path has no external dependency). Results merge with
reciprocal rank fusion, then query-derived structured constraints apply: a network named
in the query is a hard filter, asset/price mentions become boosts. At index time we also
generate synthetic agent-intent queries per resource and embed those alongside the
metadata - published tool-retrieval results show schema vocabulary and query vocabulary
diverge, and indexing synthetic queries closes that gap cheaply.

**Ranking signal:** settlement history. A resource recently seen in successful settled
payments ranks above an untested listing, so agents can tell proven endpoints from stale
ones. No Stellar catalog surfaces settlement history today; facilitator integration makes
it cheap and real-time rather than requiring a separate chain-indexing pipeline.

**Evaluation - the part that is a deliverable, not a detail:**

- a versioned golden-query set (target 100-200 queries) with graded relevance judgments,
  built by pooling results from all rankers and judged with a documented rubric;
- LLM-assisted labeling with a tracked human audit sample (judge model ≠ generation model);
- nDCG@10, MRR, and Recall@20 run in CI - ranking changes ship only if they do not
  significantly regress, measured against a held-out split;
- the harness lives in `packages/eval-harness`, public, so the quality claims are
  reproducible by anyone;
- online signal: an agent's actual paid call is the strongest relevance label there is,
  and it is logged (rank of the invoked result) with caller identity excluded.

**Degraded mode maps to the spec:** if the semantic arm is down, serve lexical-only with
`partialResults: true`; verify/settle never depend on the index.

## Alternatives considered

- **Elasticsearch** - rejected: license family (AGPL/SSPL/Elastic) is incompatible with
  this project's no-copyleft requirement.
- **Dedicated vector database** - rejected: a second stateful service for a corpus that
  fits in RAM.
- **Managed embedding/search APIs** - rejected: breaks the self-hosted and
  self-facilitation paths and inserts a vendor into the trust story.
- **Cross-encoder reranking, tuned fusion weights** - deferred, data-triggered: added
  only if the eval harness shows top-rank precision problems fusion cannot fix.

## Consequences

- Infrastructure stays boring: one Postgres (primary + replica), the facilitator service,
  in-process embedding. Cheap to run, easy to self-host, honest 99%+ availability story.
- Every future ranking claim this project makes is backed by a public, re-runnable number.
