# @rialto/discovery

The catalog and search layer.

- **Catalog**: PostgreSQL-backed index of paid HTTP endpoints and MCP tools (keyed on
  resource URL + tool name), populated automatically when payments carrying the Bazaar
  extension settle. Metadata is validated before indexing - schema checks, route-template
  sanitization (percent-decoding before traversal checks), and field-level soft-drop -
  so a hostile client cannot poison the index. Cataloging outcomes are reported back via
  the `EXTENSION-RESPONSES` header.
- **Search**: hybrid retrieval (BM25 + local embeddings, reciprocal rank fusion) with
  query-derived structured filters and settlement-history ranking. Quality is gated by
  `@rialto/eval-harness` - see docs/decisions/0002.
- **Federation**: a registration endpoint for independent facilitators, ingestion of
  external catalogs, and cross-publishing - a service settles anywhere but is findable
  everywhere. This is our answer to the open interop question in stellar/x402-stellar#50.
