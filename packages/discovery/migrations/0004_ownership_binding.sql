-- Trust-on-first-use ownership binding for catalog rows.
--
-- The attack this closes (payTo displacement / listing hijack): the upsert on
-- (resource, tool_name) replaced content wholesale on conflict, including
-- `accepts` and therefore `payTo`. Anyone settling one real dust payment with
-- forged bazaar metadata for a victim's resource URL - or supplying a poisoned
-- entry through federation ingestion - could overwrite the victim's payment
-- terms and inherit the row's accumulated settlement_count, which the
-- settlement-history tiebreak then rewards. See docs/threat-model.md §3.
--
-- The rule: the first observed-settlement write for a (resource, tool_name)
-- binds the row to that settlement's payTo. Once bound, a write updates the
-- row only when every payTo across its accepts entries equals the bound
-- address - a mixed accepts array smuggling an extra payout address alongside
-- the owner's is refused whole, as is a write carrying no payTo at all (the
-- payment itself is never blocked - only the catalog update). Rows that have never settled keep
-- last-write-wins so federation re-syncs refresh them unchanged. A settlement
-- claiming a previously ingested/registered row also upgrades its provenance
-- to observed-settlement, fixing the companion mislabel where content was
-- last-write-wins but provenance was first-write-wins.
--
-- Enforcement lives in the upsert's ON CONFLICT ... WHERE clause
-- (src/catalog.ts), so concurrent conflicting writes are serialized by the
-- row lock and exactly one first settlement can bind.
--
-- Rebinding (a seller legitimately rotating payout addresses) is an operator
-- action, documented in docs/guides/operator-guide.md.
--
-- Applied automatically and idempotently by Catalog.connect() (see
-- src/catalog.ts's SCHEMA constant) on every service start, the same way
-- every other schema change in this package has been applied. This file is
-- the versioned, human-readable record of the change, not something you run
-- by hand.

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS bound_pay_to TEXT;
ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS bound_at TIMESTAMPTZ;
