# Documentation audit: what's built vs. what's written down

Purpose: before restructuring `docs/` and eventually porting to Fumadocs, get an
honest inventory of the gap between implementation and documentation. This is a
planning artifact, not itself the documentation — content gets written in a
follow-up pass, into whatever structure we agree on after this.

Method: every claim below is checked against actual source files and passing tests
in the repo as of this session, not against memory of what was planned. Where a
doc topic needs mathematical treatment, that's called out explicitly, since that's
what the next pass needs to get right, not just describe.

## 1. What currently exists in `docs/`

| File | Lines | State |
|---|---|---|
| `architecture.md` | 354 | Current, updated this session for BM25/dense/fusion/pgvector - the closest thing to a source of truth today |
| `benchmarks.md` | 89 | Current, real numbers, honest about v1 scope |
| `decisions/0001-upto-onchain-cap.md` | 68 | Design decision for the `upto` contract - **describes something not yet implemented** (contract is a README stub) |
| `decisions/0002-search-stack-and-eval.md` | 102 | Updated this session with an "Implementation notes" section listing every deviation from the original decision |
| `discovery-test-harness-spec.md` | 180 | The presentation-oriented harness spec (conformance/quality dirs) - describes a structure the actual suite doesn't use (see §6 below) |
| `discovery.md` | 0 | **Empty.** Unclear original intent - never filled in |
| `scheme_upto_stellar.md` | 851 | Substantial, thorough - the `upto` wire spec, written independent of this session's work. Not yet linked from architecture.md's search section (it's referenced for §3.3, correctly) |

**Missing entirely, referenced by name in the original team plan but never created:**
`quickstart.md`, `seller-guide.md`, `buyer-agent-guide.md`, `operator-guide.md`,
`threat-model.md`.

**Missing and never mentioned anywhere:** any document for the two spec messages that
actually drove this session's build (the pre-BM25 regression-suite spec and the
BM25/hybrid-search + eval-harness spec). Both were pasted into chat, never saved as
files. Everything they specified got built and tested, but the specs themselves - the
actual design intent, stage-by-stage - exist nowhere in the repo. That's a real gap:
`docs/decisions/0002` describes the *decision*, but not the *plan* that was executed
against it, stage by stage, with acceptance criteria. Worth preserving as historical
record even though the work is done, the same way `scheme_upto_stellar.md` is kept
even though it's "just" a spec.

## 2. Gap breakdown by subsystem

Each entry: what's built (source of truth), what's tested (proof it's real), what's
documented today (if anything), and what content type the gap needs.

### 2.1 Facilitator - `exact` scheme, fee sponsorship, throughput

- **Built:** `packages/facilitator/src/schemes/exact.ts`, `app.ts`, `config/env.ts`
- **Tested:** live-tested this session (real testnet keypair, `/verify` `/settle`
  `/supported` `/health`), no automated test suite exists for this package
- **Documented:** `architecture.md` §2/3.1 covers this at a design level; the
  facilitator's own `README.md` overclaims a feature that doesn't exist (per-principal
  cost accounting / success-rate-tied rate limiting - flagged in an earlier turn this
  session, not yet fixed)
- **Gap:** an operator-facing doc for what's actually configurable
  (`FACILITATOR_STELLAR_FEE_BUMP_SECRET`, channel accounts, `FACILITATOR_API_KEY`, the
  rate limit's actual hardcoded value) is missing. Content type: **operational
  reference**, not conceptual - this is "here's every env var and what it does," plus
  fixing the README's overclaim.

### 2.2 Discovery: catalog + integrity gauntlet

- **Built:** `catalog.ts` (schema, upsert), `validation.ts` (the gauntlet)
- **Tested:** `test/unit/01.gauntlet.spec.ts`, `03.catalog-repository.spec.ts`
- **Documented:** `architecture.md` §3.2 covers this well at a conceptual level
  (percent-decode-before-traversal-check, soft-drop rules)
- **Gap:** small. The one thing worth adding is the **atomic increment** reasoning for
  `settlement_count` (migrations/0001) - it's a real, non-obvious correctness property
  (`ON CONFLICT DO UPDATE SET settlement_count = resources.settlement_count + 1` is
  safe under concurrent writes because Postgres serializes via the row lock, not
  because of anything the application does) and it's currently only explained in code
  comments, never in prose. Content type: **concept + correctness reasoning**, no real
  math, but worth a worked example ("two concurrent settlements, what actually happens
  at the database level").

### 2.3 Discovery: lexical search / BM25F - **math-heavy**

- **Built:** `search/bm25.ts` (pure scoring), `search/lexical.ts` (Postgres
  orchestration + the AND→OR fallback added this session)
- **Tested:** `test/unit/10.bm25-ranking.spec.ts`, `14.lexical-or-fallback.spec.ts`
- **Documented:** not documented anywhere except code comments and this session's chat
  explanation. `architecture.md` mentions "real BM25F" in one paragraph but doesn't
  explain the mechanism.
- **Gap - the biggest one in the whole audit.** This needs its own page. Specifically:
  - **Term frequency saturation**: the actual BM25 formula, what `k1` controls, why
    1.2 is the literature default, a worked numeric example showing the saturation
    curve (why term count 1→2 matters more than 10→11).
  - **Length normalization**: what `b` controls, the formula, why a short field
    matching once beats a long field matching once at the same raw frequency.
  - **IDF**: the Robertson/Sparck-Jones formula, *why* it's shaped that way (why
    `+0.5` in numerator and denominator - Laplace-style smoothing so a term in every
    document doesn't produce a negative or undefined weight), a worked example using
    real numbers from `10.bm25-ranking.spec.ts`'s rare-vs-common test.
  - **BM25F field weighting**: the combined-tf formula across fields, why
    `{a: 3, b: 1, c: 0.5}`, and the mechanical connection to `search_a`/`search_b`/
    `search_c` in the schema.
  - **The AND→OR fallback**: `websearch_to_tsquery`'s default conjunction semantics,
    why that's a real usability problem for natural-language queries independent of
    whether dense search is available, and the relaxation mechanism.
  - **What Postgres still owns vs. what the app owns**: tokenization/stemming (`
    tsvector`, the `'english'` dictionary) is Postgres; the actual relevance math is
    application code. This split is architecturally important and currently only
    stated once, in passing, in a code comment.

### 2.4 Discovery: dense retrieval + embedding worker - **math + operational**

- **Built:** `search/embedding-model.ts`, `search/embedding-worker.ts`,
  `search/dense.ts`, `search/synthetic-queries.ts`, migrations 0002 + 0003
- **Tested:** `test/unit/11.dense-retrieval.spec.ts` (7 cases including a real-model
  paraphrase proof and a simulated worker-crash/lease-expiry recovery)
- **Documented:** `architecture.md` §3.2 mentions this exists; nothing explains the
  mechanism
- **Gap:**
  - **Cosine similarity, worked**: the formula, why it's bounded [-1, 1], why 1 -
    distance = similarity in pgvector's `<=>` convention, a small numeric example.
  - **Why generation-versioning exists**: the actual failure mode it prevents (a model
    swap silently comparing old-model vectors to new-model vectors, garbage output
    with no error), and why the fix is a *table*, not a config flag - old and new
    generations coexist and are never queried against each other by construction, not
    by convention.
  - **pgvector: `vector` vs. `vector(n)`** - this is a real architectural decision made
    this session, recorded in code comments and the ADR's "Implementation notes" but
    not explained conceptually anywhere a reader would find it before hitting the
    schema. Needs: why a fixed-width column can't hold two generations' embeddings,
    what "dimension-less" actually costs (no ANN index, since HNSW/IVFFlat both need a
    fixed dimension) vs. what it buys (model swaps need no migration).
  - **The job queue mechanics** (`FOR UPDATE SKIP LOCKED`, the lease/visibility-timeout
    pattern, exponential backoff, dead-lettering): this is a genuinely reusable pattern
    worth explaining on its own, not just as an implementation detail - what problem
    each piece solves (SKIP LOCKED → no duplicate claims across workers; lease
    expiry → crash recovery without a heartbeat mechanism; backoff → don't hammer a
    flaky dependency; dead-letter → a job that will never succeed doesn't loop
    forever). Content type: **operational + a bit of distributed-systems concept**.
  - **Synthetic queries**: what they are, why template-based (not LLM) for v1, and the
    explicit trust boundary this creates (a resource's *own* declared metadata is
    seller-controlled and gauntlet-validated; a synthetic query is *system-generated*
    from that metadata - the honesty question is whether the template captures real
    query intent, not whether it's forgeable).

### 2.5 Discovery: fusion + settlement ranking - **math**

- **Built:** `search/fusion.ts`, `search/ranking.ts`, `search/query-constraints.ts`,
  `search/hybrid.ts`
- **Tested:** `test/unit/12.fusion.spec.ts`, `13.settlement-ranking.spec.ts`
- **Documented:** explained conversationally in chat this session (lexical vs. dense
  vs. fusion vs. hybrid terminology); not written down anywhere in `docs/`
- **Gap:**
  - **Reciprocal Rank Fusion, the actual formula and why rank position, not score**:
    `1/(k+rank)`, worked example with two rankers and a partial overlap, and the
    specific reasoning for never comparing a BM25 score to a cosine distance directly
    (different units, no principled conversion between them - RRF sidesteps the
    problem entirely by only consuming rank order).
  - **Why `RRF_K = 60`, and what changing it does**: smaller k weights top ranks more
    heavily; this is currently a named constant with a one-line comment, not explained.
  - **The lexical/dense/fusion/hybrid terminology**, exactly as explained in chat this
    session - this conversation *is* a draft of that doc section, it just needs to be
    written down with the diagram.
  - **Structured constraints as hard filters vs. ranking boosts**: why network is a
    hard filter (excludes, doesn't de-rank) and why that's tested specifically
    (`12.fusion.spec.ts`'s near-miss-wrong-network case), plus the honest scope note
    that asset/price are a lighter-weight v1.
  - **Settlement-history ranking as a tiebreak, not a signal**: the distinction matters
    and is easy to get wrong in prose - it only ever activates on a genuine fused-score
    tie, never overrides a real relevance difference. Worth a worked example showing
    both cases (`13.settlement-ranking.spec.ts` already has the fixtures for this).
  - **`partialResults` honesty logic**: the exact conditions (dense errored OR
    embedding backlog OR zero dense results), and why each one matters independently.

### 2.6 Eval harness - **math + methodology**

- **Built:** `packages/eval-harness/` in full
- **Tested:** `test/metrics.spec.ts` (9 known-answer cases)
- **Documented:** `benchmarks.md` is good but is *results-and-interpretation*, not
  *methodology*. The harness's own README exists but is thin.
- **Gap:**
  - **nDCG@10, derived, not just stated**: DCG formula, why `2^grade - 1` (exponential
    reward for higher grades) over `log2(position+1)` (discount), what "ideal ordering"
    means for the normalization, and why nDCG=1 is defined for a query with zero
    relevant results (a convention, not a mathematical necessity - worth stating
    explicitly why that convention was chosen).
  - **MRR, derived**: why reciprocal (not linear) rank, what it does and doesn't
    capture that nDCG does.
  - **Recall@20**: the position-independence property, why it's a different signal
    from the other two.
  - **The judgment methodology, honestly**: single-pass, same model that built the
    harness, no independent human audit yet, no separate judge model - this is
    documented in the judgments.ts file header and `benchmarks.md`, but deserves its
    own clearly-flagged section so it's not missed.
  - **The CI regression gate**: threshold reasoning (`0.02` absolute - why that number,
    not tighter or looser), and the deliberate choice to gate on `fused+settlement`
    only, not all three configurations.

### 2.7 Federation

- **Built:** `router.ts`'s `/federation/register` + `/federation/peers`,
  `catalog.ts`'s `registerPeer`/`peers`/`markPeerIngested`, `ingest-cli.ts` (CDP +
  AlgoVoi ingestion)
- **Tested:** not covered by the current automated suite at all - a real gap in test
  coverage, separate from the documentation gap
- **Documented:** `architecture.md` §3.2 describes the intent well
- **Gap:** the CDP/AlgoVoi ingestion mappers are real, working code with real inspected
  wire shapes (see `ingest-cli.ts`'s header comment) but zero documentation of how to
  actually run an ingestion, what provenance labeling looks like afterward, or how
  cross-publishing (Rialto's own catalog exported in a shape others can ingest) would
  work - that direction isn't implemented at all yet, only ingestion *into* Rialto is.

### 2.8 `upto` scheme

- **Spec:** `docs/scheme_upto_stellar.md`, 851 lines, substantial and independent of
  this session's work
- **Implementation:** none. `contracts/upto-settlement/` is a README. No `upto.ts`
  `SchemeHandler`, no registry entry.
- **Gap:** not a documentation gap - an implementation gap. The spec is ahead of the
  code here, which is the opposite of every other subsystem in this audit. Worth
  stating plainly in whatever docs/ restructure happens, so a reader doesn't assume
  parity between "the spec exists" and "the scheme works."

### 2.9 What's not built at all (for completeness, not to write docs about)

`packages/mcp-server`, `packages/seller-sdk` - READMEs only, per the RFP gap analysis
from earlier this session. Not a documentation gap since there's no implementation to
document; flagged here only so the docs restructure doesn't accidentally imply
otherwise.

## 3. Math-heavy topics, consolidated

Pulled out from §2 so this is scannable on its own - these are the pages that need
actual derivations and worked examples, not just prose:

1. BM25 term-frequency saturation (`k1`) and length normalization (`b`)
2. IDF (Robertson/Sparck-Jones formula, the smoothing terms)
3. BM25F field-weighted combination
4. Cosine similarity
5. Reciprocal Rank Fusion
6. nDCG@10 (DCG formula, ideal-ordering normalization)
7. MRR
8. Recall@K

All eight have real numbers already sitting in the test suite
(`10.bm25-ranking.spec.ts`, `metrics.spec.ts`) that can become the worked examples
directly, rather than inventing new illustrative numbers - the tests are already
"known right answers," which is exactly what a worked example needs.

## 4. Proposed `docs/` structure (for discussion, not yet applied)

A shape that separates *concept/math* (stable, rarely changes) from *operational*
(changes with deployment) from *decisions* (historical record) from *reference*
(generated or close to it):

```
docs/
  architecture.md              # keep - the map of the whole system
  benchmarks.md                # keep - results + interpretation
  decisions/                   # keep - ADRs, historical, append-only
    0001-upto-onchain-cap.md
    0002-search-stack-and-eval.md
    0003-...                   # future decisions land here
  specs/                       # new - the "what was asked for" record
    pre-bm25-regression-suite.md      # preserve the spec that drove stages 0
    bm25-hybrid-eval-harness.md       # preserve the spec that drove stages 1-4
    scheme_upto_stellar.md            # move here from docs/ root
    discovery-test-harness-spec.md    # move here from docs/ root
  search/                       # new - the math-heavy conceptual docs from §2.3-2.6
    lexical-bm25.md
    dense-retrieval.md
    fusion-and-ranking.md
    evaluation-methodology.md
  guides/                       # new - the missing audience-facing docs
    quickstart.md
    seller-guide.md
    buyer-agent-guide.md
    operator-guide.md           # env vars, deployment, the embedding worker, migrations
  threat-model.md                # new - required by the RFP, doesn't exist yet
  discovery.md                   # DELETE or repurpose - currently empty, unclear intent
```

Not proposing this as final - flagging it as a concrete starting point for the "properly
structure the docs folder" step, since a structure is easier to react to than a blank
page.

## 5. Suggested sequencing for the next pass

Roughly in order of (documentation value) × (how settled the underlying implementation
is - no point writing deep math docs for something likely to change again soon):

1. `search/lexical-bm25.md` and `search/evaluation-methodology.md` - the biggest gaps,
   most settled code, and the ones this conversation already half-drafted.
2. `search/dense-retrieval.md` and `search/fusion-and-ranking.md` - same reasoning,
   slightly newer code (pgvector migration, AND→OR fallback both landed this session).
3. Preserve the two build specs into `specs/` verbatim - low effort, high value, purely
   archival.
4. `guides/operator-guide.md` - closes the facilitator README's overclaim gap too.
5. `threat-model.md` - required by the RFP for audit-readiness, currently the largest
   compliance gap, not just a documentation nicety.
6. `guides/seller-guide.md` / `buyer-agent-guide.md` / `quickstart.md` - lower priority
   than the above since `seller-sdk`/`mcp-server` (the things these guides would mostly
   be *about*) aren't built yet; a guide ahead of the SDK it describes risks going
   stale immediately.
