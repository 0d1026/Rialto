# packages/discovery: BM25/Hybrid Search + Eval Harness Spec

> Archival note: this is the spec as handed to the coding agent, preserved verbatim as
> historical record of what was executed against. Stages 0-4 described here were all
> built and are green - see `docs/search/` for the resulting conceptual documentation
> (with math and worked examples derived from this build), `docs/benchmarks.md` for
> the resulting numbers, and `docs/documentation-audit.md` for the full gap analysis.
> Not maintained going forward; it's a record of intent at the time, not living
> documentation.

Hand this to the coding agent as-is. Prerequisites: the pre-BM25 regression suite
(`discovery-test-suite-pre-bm25-spec.md`) is green, the `routeTemplate` bug is fixed in
its own commit, and `discovery-test-harness-spec.md` is committed to the repo. Do not
start this work before those three are true, this spec assumes a real regression net
already exists underneath it.

Build in the stage order given. Each stage has its own acceptance criteria and is a
legitimate freeze point if time runs out, per the same discipline used throughout this
project: a clearly labeled partial result is a real deliverable, a silent gap is not.

## Stage 0: `settlement_count` migration

**Build:**
- A new migration adding `settlement_count integer not null default 0` to the
  `resources` table.
- Update the catalog repository's upsert path: a repeat settlement for an existing
  resource increments `settlement_count` by 1 in the same write that updates
  `last_updated`, atomically (one `UPDATE ... SET settlement_count = settlement_count + 1,
  last_updated = now() WHERE ...`, not a read-then-write).

**Acceptance criteria:**
- [ ] A fresh resource catalogs with `settlement_count = 1`.
- [ ] A second settlement for the same resource results in `settlement_count = 2`,
      verified by directly querying the row, not just checking the API response.
- [ ] Two concurrent settlements for the same resource (simulate with parallel
      requests) both land, `settlement_count` ends at the correct total, not short by
      one due to a lost update. This is the actual reason the increment must be
      atomic in SQL, not read-modify-write in application code.
- [ ] Add this test to `03.catalog-repository.spec.ts` from the pre-BM25 suite,
      replacing the discrepancy flagged there, don't create a new file for one test.

## Stage 1: Real BM25

**Build**, in `search/bm25.ts`:
- Term frequency and inverse document frequency computed over the catalog's tokenized
  text fields (`serviceName`, `description`, tags), not Postgres's `ts_rank`/
  `ts_rank_cd`. Postgres's `tsvector` can still do tokenization, the ranking function on
  top must be real BM25 (standard formula, k1 and b as tunable, documented constants,
  not hidden magic numbers).
- Keep the existing ILIKE fallback for short/partial queries from the current
  implementation, this is a real usability property already verified working, don't
  regress it.
- Field weighting: a match in `serviceName` should score higher than the same term
  appearing only in `description`. Document the weight values chosen.

**Acceptance criteria:**
- [ ] A query sharing only a rare, distinguishing term with the correct result ranks it
      above a result sharing only common terms, verified with a fixture set where a
      naive tsvector match would rank them incorrectly (this is the test that actually
      proves BM25 vs bare tsvector ranking, not just "search returns something").
- [ ] A term match in `serviceName` outranks the same term appearing only in
      `description`, other factors equal.
- [ ] The short/partial-query ILIKE fallback from the existing suite still passes
      unmodified, run `05.search-ranking.spec.ts` from the pre-BM25 suite against the
      new implementation and confirm every test in it still passes, that file was
      written in terms of observable behavior specifically so it would survive this
      migration, use it as the regression check.
- [ ] BM25 parameters (k1, b) are named constants with a comment explaining the chosen
      values, not inline magic numbers.

## Stage 2: Dense retrieval, async, generation-versioned

**Build:**
- An embedding worker (`search/embedding-worker.ts`) that claims jobs from a Postgres
  queue table using `FOR UPDATE SKIP LOCKED`, with batching, exponential backoff, and
  dead-lettering after a defined retry limit.
- A `generations` table: `id`, `model_id`, `revision`, `dimension`, `pooling`,
  `normalization`, `created_at`. Embeddings are stored keyed to a generation id.
  Changing any of model/revision/dimension/pooling/normalization creates a new
  generation row; old and new generations' vectors are never queried against each
  other.
- Synthetic per-resource queries: at index time, generate a small set (document the
  count chosen) of natural-language questions an agent would plausibly ask to find this
  resource, embed those alongside the resource's own metadata, same generation.
- `search/dense.ts`: queries the current generation's vectors only, returns a ranked
  candidate list.

**Acceptance criteria:**
- [ ] A resource cataloged while the embedding worker is stopped has no vectors yet;
      once the worker runs, it gets embedded, verified by checking the generation-keyed
      table directly.
- [ ] Simulate a generation change (insert a new `generations` row with a different
      `dimension`), confirm the dense search path only queries the current generation,
      old-generation vectors present in the table are never returned or compared.
- [ ] A paraphrase query with no vocabulary overlap with a resource's own metadata
      still surfaces it, because a synthetic query embedded at index time matches,
      verified with a fixture resource whose synthetic queries are known and one of
      them is used as the test query.
- [ ] A worker crash mid-batch does not lose the job (confirm via `SKIP LOCKED`
      semantics, a second worker instance picks up the abandoned job rather than the
      job silently vanishing).

## Stage 3: Fusion and settlement-history ranking

**Build**, in `search/fusion.ts` and `search/ranking.ts`:
- Reciprocal rank fusion combining the BM25 and dense result lists, by **rank position
  only**, never comparing a BM25 score and a cosine distance directly.
- Query-derived structured constraints: a network, asset, or price mentioned in the
  query applies as a hard filter or boost against structured fields, not more text for
  the dense arm.
- Settlement-history ranking applied after fusion: at equal or near-equal fused rank,
  the resource with higher `settlement_count` and more recent `last_updated` (from
  stage 0) ranks first.
- `partialResults: true` whenever any optional stage (dense arm, embedding worker
  backlog) degrades, `false` only when the full pipeline ran.

**Acceptance criteria:**
- [ ] Fusion output never derives from comparing a raw BM25 score to a raw cosine
      score, verified by inspecting the fusion function's inputs in a test, only rank
      positions should be consumed.
- [ ] A query naming a specific network applies as a hard filter, verified against a
      fixture set with near-miss rows on the wrong network that must be excluded, not
      merely ranked lower.
- [ ] Two resources with equal fused rank are ordered by settlement history, verified
      against fixtures with deliberately different `settlement_count`/`last_updated`
      values.
- [ ] With the dense arm live and healthy, `partialResults: false`. With it disabled,
      `partialResults: true` and BM25-only results still return correctly ordered.

## Stage 4: Eval harness (`packages/eval-harness`)

This is where "comparable metrics" gets built, read this stage carefully, the
methodology matters as much as the code.

**Build:**
- `golden-queries/`: 100 to 200 queries, committed as data, covering: exact-name
  lookups, paraphrase/intent queries, filtered queries (network/price/asset), no-result
  queries, and adversarial queries (crafted to reward keyword-stuffing or metadata
  gaming if the ranking is weak).
- Graded relevance judgments (0 to 3 scale, not binary), one judgment per
  query-result pair in a pooled candidate set (union of results from BM25-only,
  dense-only, and fused runs, so no single ranker's blind spot defines ground truth).
  Use LLM-assisted labeling with a documented rubric, plus a human-audited sample
  (document the sample size and agreement rate). The judge model must be different
  from any model involved in generating synthetic queries or embeddings, to avoid the
  judge grading a ranker against its own bias.
- `metrics.ts`: nDCG@10, MRR, Recall@20, computed against the judgment set.
- `runner.ts`: runs all of BM25-only, dense-only, and fused-with-settlement-ranking as
  separate configurations against the live catalog, reporting metrics per
  configuration side by side, so the value each stage adds is visible, not just a
  single blended number.
- A CI job that runs the harness on every change touching `search/` and fails the
  build if any metric regresses past a documented threshold against the last accepted
  baseline.

**How to report this for comparability, not just correctness:**
- Publish the query set, the judgment methodology, the judge model, the human-audit
  sample size and agreement rate, and the raw per-configuration metrics, all in the
  repo, versioned.
- Report your own nDCG/MRR/Recall numbers as the primary, load-bearing claim, since
  they're the only ones in this evaluation that are reproducible by a third party.
- Do not compute a single "we beat competitor X by Y%" headline number against another
  team's catalog, the catalogs contain different resources and aren't comparable on
  identical items. Where a qualitative comparison is useful (e.g. does a paraphrase
  query that fails against a competitor's public search succeed against ours), report
  it separately, labeled clearly as illustrative, not as a benchmark result.
- Anyone cloning the repo should be able to run `runner.ts` and get the same numbers
  you report, modulo the catalog's actual current contents at the time they run it,
  this is what "reproducible" means here, not just "we ran it once and wrote down what
  happened."

**Acceptance criteria:**
- [ ] The query set and judgments are committed in a documented format, with the
      methodology (rubric, judge model, human-audit sample and agreement rate)
      written down alongside them, not just implied by the code.
- [ ] Running `runner.ts` against the live catalog produces a printed table with
      nDCG@10, MRR, Recall@20 for each of the three configurations (BM25-only,
      dense-only, fused).
- [ ] A CI job runs this on relevant changes and fails on regression past the
      documented threshold.
- [ ] A fresh clone of the repo, with no undocumented local state, produces the same
      relative ordering of the three configurations (fused should outperform either
      arm alone; if it doesn't, that's a real finding to report, not a bug to hide).

## Stage 5: Test suite extension

Extend, don't replace, the pre-BM25 suite:
- `05.search-ranking.spec.ts` gets a companion file, not a rewrite, e.g.
  `10.bm25-ranking.spec.ts`, `11.dense-retrieval.spec.ts`, `12.fusion.spec.ts`,
  `13.settlement-ranking.spec.ts`, one per stage above, using the fixture conventions
  already established.
- Add one new `[LIVE]` test once stage 2 through 4 are deployed: a real paraphrase
  query against the live deployed search endpoint, confirming the dense arm is doing
  real work in production, not just in tests.

## Definition of done

Stages 0 through 3 deployed and passing their acceptance criteria is the minimum bar
for the submission. Stage 4 (eval harness) is not optional scope-creep, it's the piece
that turns every claim in stages 1 through 3 into a checkable number, prioritize
getting a first version of it running, even with a smaller query set than 100 to 200,
over polishing stage 3 further. A real eval harness with 40 queries beats a
theoretically complete fusion pipeline with no way to check it actually works better.
