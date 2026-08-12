# packages/discovery: Test Suite Spec (pre-BM25-migration baseline)

> Archival note: this is the spec as handed to the coding agent, preserved verbatim as
> historical record of what was executed against. Everything it describes was built
> and is now green - see `packages/discovery/test/unit/01` through `08` and
> `docs/documentation-audit.md` for the outcome. Not maintained going forward; it's a
> record of intent at the time, not living documentation.

Hand this to the coding agent as-is. This is not the hybrid-search test suite from
`discovery-test-harness-spec.md`, it's the missing regression baseline for what's
already built and manually verified: ingestion, the integrity gauntlet, the auth gate,
and the current lexical (FTS + ILIKE) search. Build this first, get it green against the
current code, then the BM25 migration has something real to not break.

## 0. Why this exists, and what it protects

A manual review (documented separately) exercised the live stack and confirmed the
ingestion pipeline, the gauntlet, the auth gate, and lexical search all work correctly,
and found one real bug (`routeTemplate` silently dropped from cataloged metadata). None
of that is captured as an automated test anywhere in the repo, `test/unit` and
`test/integration` don't exist yet despite the architecture spec requiring them. This
suite's job is threefold: lock in what's already verified working, encode the found bug
as a failing test until it's fixed, and give the BM25 migration a real safety net so
"search still returns the right results" is a machine-checked fact during the migration,
not a manual re-verification.

Follow the conventions from `discovery-test-harness-spec.md`: every `describe` block
cites what it proves (an RFP section, an ADR, or "regression: <short bug description>"
for the routeTemplate case), opens with a plain-English comment before any assertion,
and `[LIVE]` marks the small number of tests that hit a real deployed instance instead
of fixtures. This suite is conformance-only (pass/fail), not the quality-benchmark suite,
that stays separate per the eval-harness work.

## 1. Folder structure

```
packages/discovery/test/
  fixtures/
    resources.ts        # clean entries + one of each gauntlet-defect type
    settlement-events.ts # valid events, malformed events, events missing bazaarMetadata
  unit/
    01.gauntlet.spec.ts
    02.ingest-auth.spec.ts
    03.catalog-repository.spec.ts
    04.search-filters.spec.ts
    05.search-ranking.spec.ts
  integration/
    06.ingest-to-catalog.spec.ts
    07.search-end-to-end.spec.ts
    08.regression-route-template.spec.ts
  live/
    09.live-search.spec.ts   # [LIVE]
```

## 2. Fixtures, built first, everything else depends on them

`fixtures/resources.ts` must include, at minimum:
- One fully clean resource.
- One resource with only an oversized `serviceName`.
- One resource with only an invalid/oversized tag list.
- One resource with only a loopback/IP-literal `iconUrl`.
- One resource with only a path-traversal `routeTemplate` (plain `../`).
- One resource with a **percent-encoded** path-traversal `routeTemplate` (this is the
  case that catches decode-order bugs specifically, keep it distinct from the plain
  case above).
- One resource with a structurally invalid envelope (not a single bad field, the whole
  payload is malformed), to distinguish hard-reject from soft-drop.
- One resource whose raw settlement payload includes a populated `routeTemplate` from
  `DiscoveredHTTPResource`, used specifically by the regression test in section 5.

`fixtures/settlement-events.ts` must include: a valid event with full `bazaarMetadata`,
a valid event with no `bazaarMetadata` (should catalog nothing), a second event for an
already-cataloged resource (should upsert, not duplicate), and a structurally malformed
event.

## 3. Unit tests

### `01.gauntlet.spec.ts`, cites RFP 3.2 / architecture §4.2

Reproduce the manual findings as automated assertions, one `it` per fixture defect
above:
- Oversized `serviceName` alone drops only that field; the rest of the entry catalogs.
- Invalid tag list alone drops only that field.
- Loopback/IP-literal `iconUrl` alone drops only that field.
- Plain path-traversal `routeTemplate` is dropped or rejected per the documented rule.
- **Percent-encoded** path-traversal `routeTemplate` is caught identically to the plain
  case, proving decode happens before the traversal check, not after. This is the
  highest-value test in this file, write it first.
- The structurally invalid envelope is hard-rejected, not soft-dropped, and the
  rejection carries a specific shared error code, not a generic exception.
- A combination fixture (more than one defect at once) drops exactly the defective
  fields and no others, verified against an explicit `dropped: [...]` list, matching
  the shape confirmed manually.

### `02.ingest-auth.spec.ts`, regression coverage for the manually-found auth behavior

- A request to `POST /internal/settlement-events` with no bearer token returns 401.
- A request with an incorrect token returns 401.
- A request with the correct `INGEST_TOKEN` succeeds.
- Run this file's tests against a freshly started process each time, or explicitly
  reset/close the listener between runs, the manual review's false alarm here was a
  stale process holding the port, not a code defect, guard the test setup itself
  against that class of flake.

### `03.catalog-repository.spec.ts`, cites RFP 3.2 cataloging behavior

- A settlement with valid `bazaarMetadata` creates exactly one new row.
- A settlement with no `bazaarMetadata` creates no row.
- A second settlement for an already-cataloged resource updates `last-settled` and
  increments settlement count on the same row, does not create a duplicate.

### `04.search-filters.spec.ts`, cites RFP 3.2 filter surface

- `GET /discovery/resources` filtered by `type` returns only matching rows, tested
  against a fixture set containing at least one non-matching row.
- Same for `payTo`, `network`, `extensions` filters, each as its own test.
- Combined filters (more than one at once) apply as AND, not OR.
- `limit`/`offset` pagination returns stable, non-overlapping pages across repeated
  calls.

### `05.search-ranking.spec.ts`, current lexical implementation, written to survive migration

Write these in terms of observable behavior, not implementation detail, so they don't
need rewriting when BM25 replaces `ts_rank`:
- A query matching a resource's `serviceName` or `description` returns that resource.
- A query matching nothing returns an empty result set, not an error.
- Among multiple matching results, the more textually relevant one ranks first (assert
  on relative order, not on a specific score value, since the scoring function is about
  to change).
- A short/partial query (e.g. a substring of a service name) still returns results,
  covering the ILIKE fallback specifically, confirm this behavior is preserved through
  the BM25 migration too, it's a real usability property worth keeping regardless of
  ranking method.

## 4. Integration tests

### `06.ingest-to-catalog.spec.ts`

Full loop against a real local/test Postgres instance, no mocking of the database
layer: `POST /internal/settlement-events` with a valid event, then confirm the row
exists via a direct repository query. This is the cross-team contract point (facilitator
→ discovery), so this test should be the most stable, most-trusted test in the suite,
treat any change here as requiring a second look before merging.

### `07.search-end-to-end.spec.ts`

Ingest several fixture events first (via the real ingestion endpoint, not by writing
directly to the database), then query both `/discovery/resources` and
`/discovery/search` and confirm the ingested entries are findable through the public
API, not just present in the database. This is the test that would have caught a bug
where ingestion writes correctly but search reads from a stale index or wrong table.

### `08.regression-route-template.spec.ts`, regression: routeTemplate silently dropped from cataloged metadata

This test should be written to **fail against the current code** and pass once the bug
in `extractBazaarMetadata` is fixed:

- Ingest a settlement event whose raw discovered resource includes a populated
  `routeTemplate` (use the dedicated fixture from section 2).
- Query the resulting catalog entry (via the repository or the public API).
- Assert `routeTemplate` is present and matches the source value.
- As it stands today, `extractBazaarMetadata` never copies this field, so this
  assertion should fail, confirm it fails for the right reason (missing field) before
  moving on, not because of an unrelated setup error.
- Once the fix lands (copy `discovered.routeTemplate` into the built `BazaarMetadata`),
  this test should pass and stays in the suite permanently as the regression guard for
  this exact defect.
- Add a second case: a settlement event with no `routeTemplate` on the source resource
  catalogs correctly with `routeTemplate` absent (not an empty string, not undefined
  behavior), confirming the fix doesn't invent a value where none exists.

## 5. Live test

### `09.live-search.spec.ts` [LIVE]

One test, run against the actual deployed discovery service, not fixtures: post one
real settlement event to the live ingestion endpoint (with correct auth), then confirm
it's findable via the live `/discovery/search` shortly after. Print the resource ID and
timestamp to console on success, this is your proof-of-liveness artifact, the same role
the settled testnet tx hash plays for the facilitator.

## 6. What this suite deliberately does not cover

BM25 scoring correctness, hybrid fusion, settlement-history ranking, and the eval
harness all belong to `discovery-test-harness-spec.md`'s coverage once that work lands,
not here. This suite's job ends at "the current lexical implementation and the
ingestion/gauntlet/auth layers underneath it are correct and protected against
regression." Do not add BM25-specific tests to this suite, add them fresh when that
work starts, reusing these fixtures where the fixture (not the assertion) is still
relevant.

## 7. Definition of done

All files in section 1 exist, `npm test` (or the repo's equivalent script) runs them,
every bullet in sections 3 and 4 has a corresponding passing test except
`08.regression-route-template.spec.ts`, which should be committed failing first, then
flipped to passing in the same change that fixes the underlying bug, so the commit
history itself documents the fix being verified, not just claimed. The `[LIVE]` test
passes against the real deployed instance before this is considered complete.
