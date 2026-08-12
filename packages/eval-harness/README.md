# @rialto/eval-harness

The search-quality evaluation harness - public because search quality is a deliverable,
not a claim. A versioned golden-query set with graded relevance judgments, scored on
nDCG@10 / MRR / Recall@20 in CI on every ranking change. Anyone can re-run our numbers.

## Running it

```
DATABASE_URL=postgresql://postgres:pw@localhost:5432/rialto_eval pnpm eval
```

Seeds `src/fixtures/seed-catalog.ts` into that Postgres, embeds it with the real local
model (`@rialto/discovery`'s `localEmbeddingModel()` - the same one production uses, not
a test double), runs the golden query set against three configurations, and prints a
table plus the raw JSON:

```
configuration     nDCG@10  MRR      Recall@20
--------------------------------------------
bm25-only         0.442    0.333    0.433
dense-only        0.981    0.867    1.000
fused+settlement  0.981    0.867    1.000
```

`pnpm check-regression` runs the same thing and fails (exit 1) if `fused+settlement` -
the configuration actually served in production - regresses past `REGRESSION_THRESHOLD`
(0.02 absolute, in `src/check-regression.ts`) against `baseline.json`. That's what
`.github/workflows/eval-harness.yml` runs on every change touching
`packages/discovery/src/search/**`.

## What the current numbers say

BM25-only scores meaningfully lower here (0.442 vs 0.981) than dense/fused, because the
query set is deliberately paraphrase-heavy (`is it going to rain tomorrow`, `how much is
bitcoin worth right now` - zero vocabulary overlap with the resources that answer them).
That's the query set doing its job, not a bug.

`fused+settlement` and `dense-only` currently score identically on this fixture set.
That is a real finding, not a hidden one: at this catalog size (18 resources) and with
this query mix, fusion isn't yet demonstrably beating the dense arm alone. Per the
BM25/hybrid spec's own instruction - "fused should outperform either arm alone; if it
doesn't, that's a real finding to report, not a bug to hide" - here it is. Likely
explanations worth checking as the query/catalog set grows: BM25 contributes little
signal on paraphrase-heavy queries (most of this set), so RRF fusion has little to add
over dense alone; and/or `RRF_K = 60` (the literature default, undtuned - see
`search/fusion.ts`) may not suit a catalog this small. This is exactly what a bigger,
more adversarial query set and real corpus-tuning data (once available) would clarify -
not something to paper over by hand-picking queries that make fusion look better.

## Scope of the current version (v1)

- **Query set:** 15 queries (`src/fixtures/golden-queries.ts`), not the 100-200 ADR 0002
  targets. Per the BM25/hybrid spec's definition of done: "a real eval harness with 40
  queries beats a theoretically complete fusion pipeline with no way to check it actually
  works better." Growing the set is the natural next step, not a redesign.
- **Catalog:** 18 hand-authored resources (`src/fixtures/seed-catalog.ts`), seeded fresh
  into a scratch Postgres on every run - not the real ~14,000-entry production Bazaar
  index ADR 0002 describes. Pointing `runner.ts` at a live deployment instead of seeding
  fixtures is the natural follow-up once one exists at meaningful scale.
- **Judgments:** every (query, resource) pair was reviewed; unlisted pairs in
  `src/fixtures/judgments.ts` are true 0s, not unjudged gaps - see that file's header for
  the full rubric.

## Judge methodology - and its most significant limitation, stated plainly

The relevance judgments in `src/fixtures/judgments.ts` were produced by Claude (the same
model that built this harness), in a single pass, against the documented 0-3 rubric.

ADR 0002 and the BM25/hybrid spec both call for:
1. a judge model different from whatever generates synthetic queries/embeddings, and
2. a tracked human-audit sample with a reported agreement rate.

**Neither is true of this v1.** There was no separately-provisioned judge model
available in the environment this was built in, and no independent human audit pass has
been run. Rather than fabricate an audit sample size or agreement number to look more
rigorous than the process actually was, this is stated directly: judging your own
system's output with the same model, unaudited, is a real methodology gap, not a minor
caveat. Upgrading it - a genuinely separate judge model, a tracked human-reviewed sample
with a reported agreement rate - is the highest-priority next step for this harness, not
optional polish.

## Files

- `src/fixtures/seed-catalog.ts` - the v1 eval catalog (18 resources)
- `src/fixtures/golden-queries.ts` - the v1 query set (15 queries, 5 categories)
- `src/fixtures/judgments.ts` - graded relevance judgments + full rubric
- `src/metrics.ts` - nDCG@10 / MRR / Recall@20 (`test/metrics.spec.ts` has known-answer
  checks on the math itself)
- `src/runner.ts` - seeds, embeds, scores, prints the comparison table
- `src/check-regression.ts` - CI entrypoint, compares against `baseline.json`
- `baseline.json` - last accepted numbers; update deliberately when a ranking change is
  meant to move them, not to silence the regression check
