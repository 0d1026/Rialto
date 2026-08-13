# UptoSettlement testnet report

Date: 2026-08-13

Toolchain: `rustc` 1.97.1, `soroban-sdk` 27.0.5, Stellar JavaScript SDK 16.2.0.

## Deployed artifact

| Item | Value |
| --- | --- |
| Contract ID | `CD6UPKZGXXJ2YESA7MKFDO4ZFKRKOQUM2NEFZUSKS4YDDHWVC2STZCC5` |
| On-chain WASM SHA-256 | `b79951fda7a301a6a96e8134aca9d659dd3dcf0d19860030361cb07dbc2cb148` |
| Network | `stellar:testnet` |
| Token | canonical testnet USDC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

The WASM SHA-256 is read directly from the deployed contract instance ledger
entry over RPC, not from a local rebuild. Anyone can reproduce it by querying
the contract instance executable on testnet.

The contract is stateless. It defines no application storage, admin, upgrade,
pause, or allowlist. Replay is prevented by the protocol nonce that the network
consumes when it verifies the payer's authorization entry, so the contract
holds no per-settlement bookkeeping of its own.

## Settlement model

The payer signs one Soroban authorization entry over the argument tuple
`(from, pay_to, asset, max_amount, valid_after, deadline, expiration_ledger,
salt, auto_revoke)`. That authorization is a ceiling. At settle time the
facilitator submits the actual amount, and the contract moves `min(actual,
max_amount)` from payer to payee. Anything below the ceiling never leaves the
payer's account. The facilitator is the transaction source and fee payer, so
the payer spends no XLM.

Guards, with the contract error each raises:

| Guard | Condition | Error |
| --- | --- | --- |
| Not yet valid | ledger time `< valid_after` | `NotYetValid` (1) |
| Expired | ledger time `> deadline` | `Expired` (2) |
| Invalid amount | `max_amount <= 0`, `actual < 0`, or `actual > max_amount` | `InvalidAmount` (3) |

## Live cases

Driven by `harness/live-settle.mjs` against the deployed contract. Payer
`GDBEIGORZRGO5DNCVI6SDNBMZDPLRVVA4XRVLQ5GJFZM3E7CZVNX6Q6G`, payee
`GDX57LT35SHXNCOF27JHG7HFUMVG7W7YSZMREQAY6UEBE23VU3UB6V2E`, fee payer
`GBOUP7KULUJPL2JGAE36VQKSSZULD3O2JGJU7L2SBPUFVUCHE4A43BRF`.

| Case | Ceiling | Actual | Result | Transaction |
| --- | --- | --- | --- | --- |
| Partial | 1.00 USDC | 0.30 USDC | settled 0.30, 0.70 untouched | [`71e16ab3`](https://stellar.expert/explorer/testnet/tx/71e16ab3969f1b82323a384c974e16a44ab630ac5788d88a86de4e195e0ecf6a) |
| Max | 0.50 USDC | 0.50 USDC | settled 0.50 | [`a3ac5788`](https://stellar.expert/explorer/testnet/tx/a3ac57887c98dda0d8a1758b329e4c7999ed214eb971ad3d6f1234d1929afd00) |
| Over cap | 0.10 USDC | 0.20 USDC | rejected `InvalidAmount` (3) | never submitted |
| Expired | deadline in the past | 0.10 USDC | rejected `Expired` (2) | never submitted |

The two rejection cases fail during simulation, before any transaction is
submitted or any fee is spent. A payer authorization can never settle above its
ceiling or past its deadline.

## Reproduce

```
cd contracts/upto-settlement/harness
npm install
UPTO_CONTRACT=CD6UPKZGXXJ2YESA7MKFDO4ZFKRKOQUM2NEFZUSKS4YDDHWVC2STZCC5 \
PAYER_SECRET=S... PAYEE_PUBLIC=G... FACILITATOR_SECRET=S... \
npm run settle
```

The harness exits zero only when both value cases settle and both guard cases
are rejected.
