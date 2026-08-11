# upto-settlement (Soroban contract)

A minimal, stateless Soroban contract enforcing the x402 `upto` scheme's spending cap
on-chain. The client signs one authorization binding recipient, token, maximum amount,
validity window, and salt; the actual amount is supplied unsigned at settlement; the
contract enforces `actual <= max` and pays out atomically in a single transaction.
Settlement is facilitator-agnostic - the signature bounds what can happen, not who
submits it.
Replay protection comes from Soroban's native auth-entry nonce - no contract storage,
no rent to manage.

Design rationale: docs/decisions/0001-upto-onchain-cap.md. Spec contribution
(`scheme_upto_stellar.md`) is coordinated upstream via the 0d1026/x402 fork.
