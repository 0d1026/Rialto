# upto-settlement (Soroban contract)

A minimal, stateless Soroban contract enforcing the x402 `upto` scheme's spending cap
on-chain. The client signs one authorization binding recipient, token, maximum amount,
validity window, and salt; the actual amount is supplied unsigned at settlement; the
contract enforces `actual <= max` and pays out atomically in a single transaction.
Settlement is facilitator-agnostic  the signature bounds what can happen, not who
submits it.
Replay protection comes from Soroban's native auth-entry nonce  no contract storage,
no rent to manage.

Design rationale: docs/decisions/0001-upto-onchain-cap.md. Spec contribution
(`scheme_upto_stellar.md`) is coordinated upstream via the 0d1026/x402 fork.

## Build and test

```sh
cargo test --manifest-path contracts/upto-settlement/Cargo.toml
stellar contract build --manifest-path contracts/upto-settlement/Cargo.toml
```
## Account support

The contract accepts Soroban `Address` values and therefore does not branch on
G-account versus C-account payers. Account-specific behavior lives in the
signed `SorobanAuthorizationEntry`: Stellar validates a G-account signature or
invokes a C-account's `__check_auth` before the authorized call succeeds.

The unit tests mock protocol authorization so they can inspect the exact tree.
End-to-end G-account and C-account signature tests belong in the client and
facilitator integration suite against a local network or testnet.