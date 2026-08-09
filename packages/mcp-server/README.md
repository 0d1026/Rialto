# @rialto/mcp-server

MCP server exposing the discover → pay → retry loop as tools an agent calls from inside
its own runtime:

- `search_resources` - natural-language search over the catalog, structured filters
- `get_resource` - full metadata, schemas, and payment requirements for one resource
- `paid_call` - performs the 402 flow end to end and returns the result plus a
  settlement receipt the agent can verify against the ledger and retain

Deterministic, structured IO; machine-readable error codes; a non-null reason on every
rejection.
