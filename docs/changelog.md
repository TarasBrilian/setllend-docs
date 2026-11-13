---
title: Changelog
description: Public, user-relevant changes to the Setllend contract, markets, app, and API.
---

Changes to what users and integrators see: contract deploys and upgrades, maturities, collateral tokens and their parameters, and the app and API. Every on-chain item can be checked with the contract's views; see [Verify the contract](./verify/verify-contract.md).

## 2026-11-13

- **API: every answer is JSON.** A path no endpoint has answers `404 {"error": "Unknown endpoint: <method> <path>. See https://docs.setllend.xyz/developers/rest-api"}` instead of a plain-text `404 Not Found`. A known path asked with the wrong method answers 405 with an `Allow` header, for example `GET /api/oneclick/quote` answers `Use POST for /api/oneclick/quote`. `GET /` answers a short index, and a plain HTTP `GET /ws` answers `426 Upgrade Required` with a pointer to the [WebSocket API](./developers/websocket-api.md). See [REST API](./developers/rest-api.md#common-errors).
- **REST API docs list every error message** under the endpoint that gives it.

## 2026-11-06

- **Setllend contract deployed on NEAR mainnet** at [`setllend.near`](https://nearblocks.io/address/setllend.near), in transaction [`DgAcsj1cjT2TnrNNt4e2hAtHauBpdaN6CYovTKpfLkPn`](https://nearblocks.io/txns/DgAcsj1cjT2TnrNNt4e2hAtHauBpdaN6CYovTKpfLkPn) (block 223274565). One transaction deployed the code, initialized the contract, opened the maturities, and listed the collateral tokens.
- **Reproducible build** of commit [`49fcc47`](https://github.com/TarasBrilian/setllend/tree/49fcc47e0167b7a7b4958078a3fedb07354bbd90) with `near-sdk` 5.30.1 and Rust 1.99.1, in the Docker image `sourcescan/cargo-near:0.22.0-rust-1.99.1`. Code hash `GsN51wYVvYPrjF9kinyJcssjxaWgdu6nEb5AZMA8oWkz`, 432,033 bytes. The `contract_source_metadata` view (NEP-330) names the commit and the image.
- **Configuration:** owner `setllend.near`; ledger `intents.near`; oracle `aggregate-oracle.near`; debt token native NEAR USDC (`nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`) on the USDC/USD feed; grace period 1 hour; oracle prices at most 60 seconds old with a confidence interval of at most 1% of the price.
- **Maturities opened**, all at 08:00 UTC:
  - 2026-11-08 (`1794124800000000000`)
  - 2026-11-13 (`1794556800000000000`)
  - 2026-11-27 (`1795766400000000000`)
  - 2026-12-25 (`1798185600000000000`)
- **Collateral tokens listed**, none frozen:

  | Token | Asset ID | Price feed | Max LTV | Liquidation threshold | Liquidation bonus |
  |---|---|---|---|---|---|
  | ETH from Arbitrum | `nep141:arb.omft.near` | ETH/USD | 70% | 80% | 5% |
  | ETH from Base | `nep141:base.omft.near` | ETH/USD | 70% | 80% | 5% |
  | NEAR | `nep141:wrap.near` | NEAR/USD | 70% | 80% | 5% |

- **App launched** at https://www.setllend.xyz: lend, borrow, and sell notes with an EVM wallet or a NEAR wallet; deposits from Arbitrum and Base through 1Click and from a NEAR wallet; repay, add or withdraw collateral, redeem, and withdraw from Portfolio.
- **API launched** at https://setllend-production.up.railway.app (`/health`, REST, and WebSocket at `/ws`), running the event follower, matcher, relayer, keeper, and 1Click wrapper. The relayer, matcher, and keeper sign from the operator account `backend.setllend.near`. See [REST API](./developers/rest-api.md) and [WebSocket API](./developers/websocket-api.md).
