---
title: Run locally
description: Build and test the contract, run the backend read-only against mainnet, run the app, and reproduce the CI checks on your own machine.
---

The [repository](https://github.com/TarasBrilian/setllend) has three self-contained folders, each with its own toolchain: `contracts/` (Rust), `backend/` (TypeScript on Node.js), and `frontend/` (Next.js). There is no workspace spanning them. This page shows how to run each one and the checks CI runs on every pull request.

To run the whole system without funds or mainnet, see [Simulation](./simulation.md) instead.

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| [rustup](https://rustup.rs) | any | Installs the pinned Rust toolchain from `contracts/rust-toolchain.toml`: Rust 1.99.1 with `rustfmt`, `clippy`, and the `wasm32-unknown-unknown` target |
| [`cargo-near`](https://github.com/near/cargo-near) | 0.22 | Building the contract wasm; the sandbox tests call it to build the contract they deploy |
| [Node.js](https://nodejs.org) | 24 or later | Backend and frontend. The backend runs its `.ts` files directly with Node's type stripping, so it has no build step |
| [Docker](https://docs.docker.com/get-docker/) | any | Only for the reproducible contract build (see [Verify the contract](./verify-contract.md)) |

Install `cargo-near` 0.22 with its installer, the same way CI does:

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/download/cargo-near-v0.22.0/cargo-near-installer.sh | sh
```

Then clone the repository:

```bash
git clone https://github.com/TarasBrilian/setllend.git
cd setllend
cp .env.example .env    # every value is optional for local runs
```

## Contract

The contract and its test helpers form one Cargo workspace in `contracts/`:

| Crate | Folder | What it is |
|---|---|---|
| `setllend` | `contracts/setllend/` | The contract. Unit tests live in `src/tests/` |
| `mock-intents` | `contracts/mocks/intents/` | A mock `intents.near`: balances, `transfer` with `mt_on_transfer` and refunds, `auth_call`, `mt_transfer` |
| `mock-oracle` | `contracts/mocks/oracle/` | A mock `aggregate-oracle.near` with the same `list_prices_no_older_than` method and JSON, and setters for prices and publish times |
| `setllend-tests` | `contracts/tests/` | Sandbox tests with `near-workspaces` |

Run every test:

```bash
cd contracts
cargo test
```

This runs the **unit tests** first, then the **sandbox tests**, which build the wasm with `cargo near`, start a local NEAR sandbox node, deploy the contract with the two mocks, and drive it only through the mock `intents.near`, as real users would: orders and refunds of invalid ones, cancels, note sales, borrow fills priced through the oracle and skipped on a stale price, collateral withdrawal against debt, multi-token loans, failed payouts and their recovery, liquidation, bad debt, owner management of collateral tokens, and the gas of full batches. Every loan in them is opened by a real fill. NEAR Intents and the oracle have no testnet, which is why the mocks exist.

The tests also check `contracts/setllend/fixtures/golden.json`, which holds the exact JSON the contract parses and produces (`msg` strings, `match_orders` arguments, views, events) and test vectors for its math. The backend's TypeScript encoders and math are tested against the same file, so the two can't drift apart.

To build the wasm alone:

```bash
cd contracts/setllend
cargo near build non-reproducible-wasm    # quick local build
cargo near build reproducible-wasm        # the pinned Docker build used for mainnet; needs a clean git tree
```

## Backend

```bash
cd backend
npm install
npm run dev
```

This starts the API on http://localhost:8080 against the deployed `setllend.near` on mainnet. Without keys it is **read-only**: it loads the books and loans from the contract's views, follows the contract's events from the FastNear explorer, serves the REST API and WebSocket, and reads oracle prices, but it submits nothing. `POST /api/intents` answers `not_ready`, the matcher doesn't send batches, and the keeper doesn't run.

Check it:

```bash
curl -s localhost:8080/health
```

`"contract": "ready"` means it has loaded the books. History (trades and account events) starts from the moment it first runs, unless `SETLLEND_START_BLOCK` is set to the contract's deploy block, in which case a fresh database reads history from there. The database is a SQLite file, `setllend.db` in the `backend/` folder by default.

`npm run dev` restarts on file changes; `npm start` runs without watching. Both load the root `.env` if it exists.

Backend checks:

```bash
npm run typecheck
npm test            # unit tests, plus the end-to-end scenario on the simulated chain
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and connect an EVM wallet or a NEAR wallet. `npm run dev` first copies the shared types from `backend/src/shared/` into `frontend/src/shared/` (`npm run sync-types`), so the JSON the app signs is byte-identical to what the backend and contract expect.

The app reads the backend at `NEXT_PUBLIC_API_URL`:

| Value | Backend |
|---|---|
| empty (default) | The deployed API, https://setllend-production.up.railway.app |
| `http://localhost:8080` | Your local read-only backend from above |
| `http://localhost:8787` | The [simulation](./simulation.md) |

Until the backend reports the contract as ready, the app shows sample data marked **Demo data**.

:::warning A local app still uses real wallets
Pointed at the deployed API or a local backend that reads mainnet, the app signs real intents and sends real deposits, exactly like https://www.setllend.xyz. Only the simulation keeps everything off chain, and even there Deposit and NEAR wallet actions are real.
:::

## Environment variables

All variables live in one `.env.example` at the repository root. Copy it to `.env` (which git ignores) and fill in what you need; an empty value counts as unset. Secrets never go in the repository, and only `NEXT_PUBLIC_*` variables reach the browser.

| Variable | Used by | Meaning |
|---|---|---|
| `PORT` | Backend | HTTP port. Default `8080` |
| `DATABASE_PATH` | Backend | SQLite file. Default `setllend.db` in the working directory |
| `NEAR_RPC_URL` | Backend | NEAR JSON-RPC endpoint for views, prices, and transactions. Default `https://free.rpc.fastnear.com` |
| `FASTNEAR_TX_URL` | Backend | FastNear explorer API the event follower reads. Default `https://tx.main.fastnear.com` |
| `SETLLEND_CONTRACT` | Backend | The contract to follow. Default `setllend.near` |
| `SETLLEND_START_BLOCK` | Backend | Block height a fresh database reads history from; usually the deploy block. Unset: from the current block |
| `NEAR_ACCOUNT_ID` | Backend | The NEAR account that pays gas and holds the keeper's funds. Required when any key below is set; without it the keeper doesn't run |
| `NEAR_INTENTS_PRIVATE_KEY` | Backend (relayer) | Function-call key of that account for `execute_intents` on `intents.near`. Secret |
| `NEAR_MATCHER_PRIVATE_KEY` | Backend (matcher) | Function-call key of that account for `match_orders` on the contract. Secret |
| `NEAR_KEEPER_SIGNING_KEY` | Backend (keeper) | ed25519 key registered on `intents.near` that signs the keeper's `liquidate` intents. Secret. Without it the keeper only scans |
| `ONE_CLICK_JWT` | Backend (1Click wrapper) | 1Click partner API key, sent as `X-API-Key`. Secret. Without it the 1Click endpoints answer 503 |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend URL, see above. Empty means the deployed API |

`.env.example` also lists variables for the contract deploy and setup scripts, which only the contract owner uses.

Any key you set must belong to the account in `NEAR_ACCOUNT_ID`. Without a key, the component that needs it runs read-only and the rest keeps working.

## CI checks

`.github/workflows/ci.yml` runs on every pull request and every push to `main`. To reproduce it locally:

```bash
# contracts/
cd contracts
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test

# backend/
cd ../backend
npm ci
npm run typecheck
npm test

# frontend/
cd ../frontend
npm ci
npm run check-types-sync    # fails if frontend/src/shared/ differs from backend/src/shared/
npm run typecheck
npm run lint
npm run build
```
