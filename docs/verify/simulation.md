---
title: Simulation
description: Run the whole Setllend backend on a simulated NEAR chain, connect the app to it, and take a loan from lend and borrow through repay and redemption without any funds.
---

The simulation runs the real Setllend backend (event follower, books, matcher, relayer, keeper, 1Click wrapper, REST API, and WebSocket) on top of a simulated NEAR chain. The chain includes a simulated `intents.near` that checks signatures and nonces like the real one, a TypeScript port of the Setllend contract with the same math, events, and error messages, an oracle with prices you can set, and a simulated 1Click. Nothing reaches mainnet and you need no funds: a faucet credits balances, and an endpoint moves the clock forward so you can reach maturity in seconds.

This page walks through a full loan with two EVM accounts, a lender and a borrower, and then documents every simulation endpoint.

## What you need

- Node.js 24 or later.
- A browser with an EVM wallet extension (MetaMask, Rabby, or similar) holding **two accounts**. Two accounts in the same wallet work; you switch between them in the wallet. The wallet only signs messages in the simulation, so the accounts need no funds on any chain.
- A clone of the repository: `git clone https://github.com/TarasBrilian/setllend.git`.

:::danger Don't use Deposit or a NEAR wallet in the simulation
The simulation replaces the chain behind the backend, not your wallet. **Deposit** in Portfolio, and the **New deposit** option in the order and repay forms, send real funds from your wallet on Arbitrum or Base. A NEAR wallet's key registration and deposits are real mainnet transactions. Fund accounts with the faucet below, pay from the **Intents balance**, use **Deposited** collateral, and connect only an EVM wallet. Actions that only ask for a signature are safe, including a withdrawal to Arbitrum or Base, which the simulated 1Click handles.
:::

## 1. Start the simulated backend

```bash
cd backend
npm install
npm run sim -- --no-mm
```

This starts the simulation with an empty order book on http://localhost:8787 (set `PORT` to use another port). Every start is a fresh chain with an in-memory database, so stopping it erases everything. Among other lines, it prints its URL and the maturities it created:

```text
simulated Setllend backend on http://localhost:8787 (a fresh chain, nothing reaches mainnet)
maturities: <three timestamps in nanoseconds>
```

The simulated contract starts like the mainnet deploy: USDC as the debt token, ETH (Arbitrum), ETH (Base), and NEAR as collateral, each with 70% max LTV, 80% liquidation threshold, and 5% liquidation bonus, a 1-hour grace period, and three maturities **12 hours, 7 days, and 30 days** after the start. Prices start at ETH $2,415.65, NEAR $4.03, and USDC $1.00.

Check it is up:

```bash
curl -s localhost:8787/health      # "contract": "ready"
curl -s localhost:8787/sim/info    # clock, height, maturities, keeper account, token aliases
```

## 2. Start the app against it

In a second terminal:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
```

Open http://localhost:3000. Click **Connect** and pick your wallet under **EVM wallet**. Connect the first account; this will be the **lender**.

## 3. Fund both accounts

Each account's Intents account is its `0x` address in **lowercase**. In the app, open the account menu and click **Copy address**, which copies the lowercase form. Switch to the second account in your wallet (the **borrower**) and copy its address too.

Give each account 1,000 USDC and 1 ETH (amounts are in base units: USDC has 6 decimals, ETH 18):

```bash
LENDER=0x1111111111111111111111111111111111111111     # replace with the lender's lowercase address
BORROWER=0x2222222222222222222222222222222222222222   # replace with the borrower's lowercase address

for ACCOUNT in $LENDER $BORROWER; do
  curl -s -X POST localhost:8787/sim/faucet -H 'content-type: application/json' \
    -d "{\"account\":\"$ACCOUNT\",\"token\":\"USDC\",\"amount\":\"1000000000\"}"            # 1,000 USDC
  curl -s -X POST localhost:8787/sim/faucet -H 'content-type: application/json' \
    -d "{\"account\":\"$ACCOUNT\",\"token\":\"ETH\",\"amount\":\"1000000000000000000\"}"     # 1 ETH (Arbitrum)
  echo
done
```

Each call answers with the new balance, for example `{"account":"0x…","token":"nep141:17208628f84f…","balance":"1000000000"}`. In the app, **Portfolio** → **My Assets** shows the balances in the Intents balance.

## 4. Lend from the first account

1. Switch your wallet back to the lender.
2. On **Market**, find the maturity about 30 days out and click **View Market for Details**.
3. In the order panel, choose **Lend**, keep **Limit**, and enter **Lend amount** `1000` and **Min rate (APR)** `5`.
4. Under **Pay from**, choose **Intents balance**.
5. Click **Place lend order** and sign the message in your wallet ("Sign the lend order with your wallet").

The relayer simulates and submits it; within a second or two the order appears as a bid at 5.00% in the book, and under **Portfolio** → **Open Orders**.

## 5. Borrow from the second account

1. Switch your wallet to the borrower. The app follows the active account.
2. In the same maturity, choose **Borrow**, keep **Limit**, and enter **Borrow amount** `500` and **Max rate (APR)** `6`. The rates cross: the lender asks at least 5%, the borrower accepts up to 6%.
3. Under **Collateral**, choose **Deposited** and keep ETH (Arbitrum) at `0.75` or set `0.5`. The form shows the debt at maturity, the borrow limit, and the health factor.
4. Click **Place borrow order** and sign.

Within a few seconds the matcher fills the pair **at 5%**, the rate of the order placed first (the maker). For 500 USDC with about 30 days to maturity, the debt at maturity is about 500 × (1 + 0.05 × 30 / 365) ≈ **502.05 USDC**. Check:

- The borrower's **Portfolio** → **Borrow** tab shows the loan, its collateral, debt at maturity, and health factor; **My Assets** shows 1,500 USDC (1,000 from the faucet plus 500 borrowed).
- The lender's **Portfolio** → **Lend** tab shows notes worth about 502.05 USDC at maturity, and the bid in the book has 500 USDC left.

## 6. Repay

As the borrower, open **Portfolio** → **Borrow** and click **Repay** on the loan. The amount defaults to the whole debt. Keep **Intents balance** as the source, click **Repay**, and sign. The debt drops to 0; the collateral stays in the loan until you withdraw it.

:::tip Repay before you move the clock
A loan not repaid by maturity plus the 1-hour grace period is overdue, and the simulation's keeper (funded with 5,000 USDC) liquidates it on its next scan. Repay first if you want to see a clean redemption.
:::

## 7. Move past maturity and redeem

Advance the clock by 30 days:

```bash
curl -s -X POST localhost:8787/sim/time -H 'content-type: application/json' -d '{"advance_ms":2592000000}'
```

It answers with the new block time (`now` in nanoseconds and `now_iso`). Every maturity is now in the past. Then:

1. **Lender:** switch to the lender. In **Portfolio** → **Lend**, the notes show **Redeemable**. Click **Redeem** and sign. About 502.05 USDC arrives in the Intents balance.
2. **Lender:** in **Open Orders**, cancel what is left of the bid (500 USDC). Orders in past maturities can still be cancelled.
3. **Borrower:** switch to the borrower. In **Portfolio** → **Borrow**, click **Withdraw** on the loan and take the ETH back. With no debt left, no price is needed.

You have now run a full lifecycle: order placement and escrow, a match at the maker rate, a loan with a health factor, repayment into the redemption pool, maturity, redemption, a cancel, and a collateral withdrawal, all through the real backend.

## Things to try next

- **Sell notes early.** Before moving the clock, the lender can list notes with **Sell note**, and the borrower (or a third account) can buy them with a new **Lend** order at a crossing rate.
- **See a liquidation.** Set a low ETH price with `/sim/price` (for example `{"token":"ETH","usd":600}`) while a loan is open. The API shows the new price within 5 seconds, and once the loan's health factor is below 1 the keeper can liquidate it.
- **Watch the backend.** `curl -s localhost:8787/health` shows the follower, the matcher's last batch, the keeper's last scan, and the relayer.

## Simulation endpoints

All endpoints take and return JSON. Amounts are decimal strings in base units. Accounts are lowercase account IDs (`0x…` for EVM accounts). The rest of the API (`/health`, `/api/…`, `/ws`) is the real backend's; see [REST API](../developers/rest-api.md) and [WebSocket API](../developers/websocket-api.md).

| Method | Path | Body | Does |
|---|---|---|---|
| GET | `/sim/info` | — | Returns the clock (`now` in nanoseconds, `now_iso`), `height`, `contract`, `maturities` (each with `maturity` and `iso`), `keeper_account`, and `tokens`, the aliases accepted below |
| POST | `/sim/faucet` | `{account, token, amount}` | Credits `amount` of `token` to the account's Intents balance (for USDC, it also registers the account on the USDC contract). Returns `{account, token, balance}` |
| POST | `/sim/time` | `{advance_ms}` | Moves the clock forward by a positive whole number of milliseconds. Returns `{now, now_iso}` |
| POST | `/sim/price` | `{token, usd}` | Sets the price of a token's oracle feed (`usd` a positive number). Returns `{token, feed_id, usd}`. Both ETH tokens share the ETH/USD feed |
| POST | `/sim/keys` | `{account, public_key}` | Registers an `ed25519:<base58>` key for a named account on the simulated `intents.near`, as `add_public_key` would. Returns `{account, public_key}` |
| POST | `/sim/oneclick/:id/arrive` | — | Makes a simulated 1Click deposit arrive now. `:id` is the deposit address. Returns the deposit's row; `404` `{"error":"Unknown deposit address"}` for an unknown one |

`token` is an asset ID or one of these aliases:

| Alias | Asset ID |
|---|---|
| `USDC` | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` |
| `ETH` | `nep141:arb.omft.near` (ETH from Arbitrum) |
| `ETH_BASE` | `nep141:base.omft.near` |
| `NEAR` | `nep141:wrap.near` |

Bad input answers `400` with `{"error": "…"}`, for example `account must be a lowercase account ID`, `token must be USDC or a collateral token`, `amount must be a positive decimal string in base units`, or `advance_ms must be a positive integer`.

## How the simulation differs from mainnet

- **Time.** A block is made every 500 ms and for every transaction. The clock is real time plus an offset that only moves forward through `/sim/time`. Signed payload deadlines are still checked against real time, since your wallet signs with it.
- **Receipts.** All receipts of a transaction land in the same block, so cross-contract timing races can't happen.
- **No gas or storage costs.** The relayer's transactions still go through the same nonce queue and checks, but nothing is burned.
- **Faster loops.** The follower polls every 500 ms, the matcher runs every second, the keeper every 2 seconds, and the relayer's request limit is raised.
- **Prices** stay fresh until you change them.
- **1Click** is simulated: quotes carry a 0.1% fee, a deposit arrives 3 seconds after its transaction hash is reported (or at once with `/sim/oneclick/:id/arrive`), and a signed withdrawal completes 3 seconds after it executes. Its deposit addresses aren't addresses a wallet can send to.

The same simulation runs in the backend's test suite (`npm test`), which drives a scripted scenario through the API and WebSocket on every CI run: lend, a self-trade that is never paired, a refused tampered signature, borrows that fill at the maker's rate, a note sale, cancel, partial and full repayment, redemption after maturity, collateral withdrawal, withdrawals to a NEAR account, and a 1Click deposit and withdrawal. See [Run locally](./run-locally.md).
