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

## Testnet deployment

The contract was deployed to Stellar Testnet on 2026-08-12.

| Item | Value |
| --- | --- |
| Network | `Test SDF Network ; September 2015` |
| Contract ID | `CD6UPKZGXXJ2YESA7MKFDO4ZFKRKOQUM2NEFZUSKS4YDDHWVC2STZCC5` |
| WASM SHA-256 | `b79951fda7a301a6a96e8134aca9d659dd3dcf0d19860030361cb07dbc2cb148` |
| WASM upload transaction | [`85a843f0...32c47b`](https://stellar.expert/explorer/testnet/tx/85a843f093a91268885df36d2971cdff6ae1fff44c310d48990d7f48ae32c47b) |
| Contract deployment transaction | [`db0538fe...6ed2b`](https://stellar.expert/explorer/testnet/tx/db0538fe299917bdcbadad2dc90e8c5ee5408a0fc4285da14f643166b9f6ed2b) |
| Contract Explorer | [Open in Stellar Lab](https://lab.stellar.org/r/testnet/contract/CD6UPKZGXXJ2YESA7MKFDO4ZFKRKOQUM2NEFZUSKS4YDDHWVC2STZCC5) |

Inspect the deployed interface:

```sh
stellar contract info interface \
  --contract-id CD6UPKZGXXJ2YESA7MKFDO4ZFKRKOQUM2NEFZUSKS4YDDHWVC2STZCC5 \
  --network testnet \
  --output rust
```

Confirm that the deployed bytecode matches the local build:

```sh
stellar contract fetch \
  --id CD6UPKZGXXJ2YESA7MKFDO4ZFKRKOQUM2NEFZUSKS4YDDHWVC2STZCC5 \
  --network testnet |
shasum -a 256

shasum -a 256 \
  contracts/upto-settlement/target/wasm32v1-none/release/upto_settlement.wasm
```


## Account support

The contract accepts Soroban `Address` values and therefore does not branch on
G-account versus C-account payers. Account-specific behavior lives in the
signed `SorobanAuthorizationEntry`: Stellar validates a G-account signature or
invokes a C-account's `__check_auth` before the authorized call succeeds.

The unit tests mock protocol authorization so they can inspect the exact tree.
End-to-end G-account and C-account signature tests belong in the client and
facilitator integration suite against a local network or testnet.