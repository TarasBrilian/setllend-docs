---
title: Portfolio
description: What the Portfolio page shows, from net value and health to positions, balances, and history, and which actions start from it.
---

**Portfolio** (`/portfolio`, in the header) is where you see everything your active account holds on Setllend, across every maturity, and where most account actions start. Before you connect, it shows a single card, "Your portfolio", with a **Connect** button. After you connect, it shows five sections from top to bottom. Everything updates live: the page listens to your account over a WebSocket and refreshes after each of your actions.

Portfolio shows one account at a time. If you connected both an EVM wallet and a NEAR wallet, switch between them in the account menu ([Wallets and accounts](../getting-started/wallets.md#using-both-and-switching)).

## My Position

The headline figures:

| Figure | What it is |
|---|---|
| **Net value** | Your notes at their value at maturity, plus your collateral at the oracle price, plus your available balances, minus your debt face. |
| **Interest at maturity** | Interest your lend fills earn at maturity: their value at maturity minus the USDC you paid. |
| **Avg lend rate** / **Avg borrow rate** | Principal-weighted average fill rates on each side. |
| **Lowest health factor** | The weakest of your loans. Health is per loan, never per account. Green from 1.50, amber from 1.20, red below. |

The donut splits your holdings into four parts, with their values in the legend:

| Segment | Contents |
|---|---|
| **Lending** | Note value at maturity, including notes listed for sale |
| **Borrowed** | Debt at maturity across your loans |
| **Collateral** | Collateral in your loans, at the oracle price |
| **Available** | Deposits in your Intents balance that are not collateral, plus free balances held by Setllend |

**See all transactions** scrolls down to History. USD values are estimates at the oracle's current prices; the contract's own checks use conservative prices (see [Oracle](../concepts/oracle.md)).

## Maturity timeline

"What each maturity pays you and what you owe on it": one pair of bars per maturity, **You receive (notes)** and **You owe (debt)**, with the date and "in *n* days" or **Matured** under each. Hover a maturity for the exact amounts. It is the quickest way to see whether your notes and your debts line up in time.

## All My Positions

Three tabs, covering every maturity.

### Borrow

One row per loan (you have at most one loan per maturity).

| Column | Contents |
|---|---|
| Maturity | Date and status: *n* days left, **Due: repay within the grace period**, or **Overdue: can be liquidated** |
| Collateral | Each token with its amount and USD value |
| Debt at maturity | Debt face and the average fixed rate |
| Health | Health factor, colored like the borrow form's bar |
| Liquidation price | Per token, the price at which the loan becomes liquidatable with the other tokens unchanged |

Actions: **Repay**, **Add collateral**, **Withdraw** (collateral, one token at a time). See [Manage a loan](manage-loan.md).

### Lend

One row per maturity where you hold notes.

| Column | Contents |
|---|---|
| Maturity | Date and *n* days left, or **Redeemable** once matured |
| Value at maturity | Your notes' value, and the part "listed for sale" in a sell order |
| Rate and interest | Average fill rate and the interest to maturity |
| Sell now (est.) | An estimate of what your free notes would sell for now, discounted at the book's mid rate. A real sale fills at the lend offers' rates. |

Actions: **Sell** before maturity ([Exit early](exit-early.md)) and **Redeem** after it ([Redeem](redeem.md)).

### Open Orders

Every open order, in every maturity: **Type** (Lend, Borrow, Sell note), **Maturity**, **Rate** (your limit rate), **Remaining** (USDC still to fill, or note value still listed), and **Placed (UTC)**. **Cancel** opens the cancel modal, which says what returns to you ([Lend](lend.md#cancel-an-order)).

## My Assets

Every balance of the account, with a **Deposit** button at the top ([Deposit](deposit.md)).

| Where | Rows | Actions |
|---|---|---|
| **Wallet · Base**, **Wallet · Arbitrum** (EVM account) | USDC and ETH in your wallet on each chain, read live from the chain | None: deposit them first |
| **Wallet · NEAR** (NEAR account) | NEAR and USDC in your NEAR account, read live from NEAR | None: deposit them first |
| **Deposited · Intents balance** | Each token in your Intents balance. Collateral tokens are marked **Not collateral**. Borrowed USDC and sale proceeds land here. | **Add to collateral** (collateral tokens), **Withdraw** |
| **Setllend · free balance** | Tokens the contract keeps for you after a payout to your Intents balance failed | **Withdraw** |

Columns: **Asset**, **Where**, **Balance**, and **Value** in USD. If a wallet balance can't be read for the moment, the section says "some could not be read right now". See [Withdraw](withdraw.md) for both withdrawal paths.

## History

Every event of your account, in every maturity, newest first, with times in UTC.

| Filter | Shows |
|---|---|
| **All** | Everything |
| **Orders** | Placed and cancelled orders |
| **Fills** | Your filled orders |
| **Repay & redeem** | Repayments and redemptions |
| **Transfers** | Deposits and withdrawals (1Click and to your NEAR account), collateral added and withdrawn, free balances moved back to your balance, and failed payouts |
| **Liquidations** | Liquidations of your loans |

Each row shows the **Action** (for example "Placed lend order", "Filled borrow order", "Deposit USDC from Base", "Withdraw ETH collateral", "Payout of USDC failed"), the **Maturity**, the **Amount**, the **Rate** where it applies, the **Time (UTC)**, and a **Status**: Success, Pending, Failed, or Unknown. Unknown means the outcome couldn't be confirmed; check your Intents balance and NEAR account. Amounts of sell orders are note value, shown in USDC. **Load more** fetches older pages.

Netting (notes cancelling debt in the same maturity) has no row of its own: it shows as a lower debt on the loan and fewer notes.

## The same data per market

On a market detail page, **Your activity in this market** shows the same data for that maturity only: **Open Orders**, **Positions** (your loan and your notes there, with the same actions), and **History**.
