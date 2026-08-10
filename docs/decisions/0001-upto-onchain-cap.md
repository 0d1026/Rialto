# ADR 0001: `upto` enforces its spending cap with an on-chain settlement contract

Status: accepted · 2026-08-08

## Context

The x402 `upto` scheme lets a client authorize a **maximum** spend while the actual
amount is decided at settlement from real usage. The generic spec
([`scheme_upto.md`](https://github.com/x402-foundation/x402/blob/main/specs/schemes/upto/scheme_upto.md))
makes five properties mandatory: single-use authorization, time bounds (`validAfter` and
`deadline`), recipient binding, max-amount enforcement, and phase-dependent `amount`
semantics. No Stellar profile of `upto` exists yet.

On Stellar, a Soroban authorization entry signs an exact invocation with exact arguments -
but `upto`'s defining feature is an amount unknown at signature time. Something on-chain
must hold the signed maximum and accept any actual ≤ max.

## Decision

Ship a minimal, stateless Soroban settlement contract with a single entrypoint. The
client signs one authorization binding **(recipient, token, max amount, validity
window, salt)**; the actual amount is an unsigned argument supplied at settlement; the
contract enforces `actual ≤ max` and pays out atomically in one transaction. Settlement
is facilitator-agnostic: the generic spec mandates recipient binding, not submitter
binding, and leaving the submitter open is what the federation and self-facilitation
paths require - a leaked authorization can at worst settle the signed maximum to the
signed recipient.

- **Single use** comes free from Soroban's protocol-level auth-entry nonce - consumed
  on-chain when used, no contract storage needed (and therefore no rent/TTL management).
- **Deadline** is a signed clock-time the contract checks on-chain; the auth entry's own
  `signatureExpirationLedger` is a second, independent bound that must be padded to
  outlive it.
- **`validAfter`** has no native Soroban primitive, so it is a signed argument the
  contract checks against the ledger's clock time (as is `deadline`) - keeping both time
  bounds under the client's signature rather than downgrading the start bound to
  off-chain policy.
- **Zero usage ⇒ no transaction**; the authorization simply expires.

## Alternatives considered

- **SEP-41 allowances only (`approve`/`transfer_from`), no contract** - rejected. The
  approval names only the spender, so the client never binds the recipient; and one
  allowance supports multiple draws, so single settlement cannot be guaranteed. Two of
  the spec's five MUSTs fail. (Note the accepted design *does* use an allowance - but
  granted only to the contract, spent and optionally zeroed inside one atomic
  settlement, which is a different thing from handing a standing allowance to a
  facilitator.)
- **Escrow (deposit-then-settle, SVM style)** - rejected. Two transactions and locked
  capital where Stellar's auth entries allow single-transaction atomicity, plus contract
  state (rent/TTL) and drift toward payment-channel territory covered elsewhere.

Both existing profiles reached the same conclusion by different roads: EVM enforces the
cap with the Permit2 proxy contract, SVM (draft) with an escrow program. The public
design discussions in
[stellar/x402-stellar#71](https://github.com/stellar/x402-stellar/issues/71) and
[#72](https://github.com/stellar/x402-stellar/issues/72) converge on on-chain enforcement
as well.

## Consequences

- A small Rust contract (~one entrypoint) enters audit scope before mainnet.
- The signed-argument design makes smart-account spending policies straightforward: a
  `__check_auth` policy can inspect exactly what the client signs (token, max, recipient),
  so per-request caps (this contract) compose with per-agent budgets (account policies).
- We author `scheme_upto_stellar.md` and contribute it upstream, coordinating with the
  authors already active in #71/#72. Working draft:
  [upto scheme spec for Stellar](https://gist.github.com/Iam0TI/1bab9ffc1c0e619ba762116f2af9141c)
  (mechanics accepted; two review fixes pending - client-signed allowance expiry,
  required salt).
