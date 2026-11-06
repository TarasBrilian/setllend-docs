---
title: FAQ
description: Short answers to the questions lenders, borrowers, and reviewers ask most about Setllend.
---

Short answers, each with a link to the page that explains it in full.

## General

### What is Setllend?

A fixed-rate lending market on NEAR. Lenders and borrowers trade zero-coupon notes on one order book per maturity, settled through NEAR Intents. You can use it with an EVM wallet or a NEAR wallet. See [Zero-coupon notes](../concepts/zero-coupon-notes.md).

### Is the rate really fixed?

Yes. The rate is set when your order fills, and the amount due at maturity is computed then and never changes. What moves afterwards is only the price at which notes trade on the book, which matters if a lender sells before maturity. See [Rates and prices](../concepts/rates-and-prices.mdx).

### Why USDC only?

One debt asset means one pool of liquidity per maturity. USDC from Base, from Arbitrum, and on NEAR are different tokens inside NEAR Intents, so Setllend lends and borrows native NEAR USDC only. USDC you deposit from Base or Arbitrum is converted by 1Click on the way in. See [Deposit](../guides/deposit.md).

### Why fixed maturities instead of any end date?

Free end dates would split lenders and borrowers across many thin books. A few fixed dates put everyone for a period on the same book, so orders meet and notes can be resold. See [Maturities](../concepts/maturities.md).

### Are there fees?

The Setllend contract charges no protocol or trading fee: the borrower pays the fill rate and the lender earns it, apart from at most 0.000001 USDC of rounding that stays in the pool. Signed intents are submitted by the relayer, which pays their gas. Cross-chain deposits and withdrawals through 1Click pay 1Click's and the bridge's fees, which the app shows before you send. A NEAR wallet pays NEAR gas for its own transactions, such as deposits from NEAR and the one-time key registration. See [Withdraw](../guides/withdraw.md).

### Do I need NEAR or a NEAR wallet?

No. With an EVM wallet you sign messages and never need NEAR or NEAR gas. With a NEAR wallet, keep a little NEAR for your own transactions. See [Wallets](../getting-started/wallets.md).

## Lenders

### Can I get my money out before maturity?

Yes. Sell your notes on the same book with a `sell_note` order. A buyer pays the price implied by the APR you set for the time left. If rates have risen since you lent, you get back less than holding to maturity would pay; if they fell, more. See [Exit early](../guides/exit-early.md).

### What if nobody buys my note?

Your `sell_note` order rests on the book until it fills or you cancel it. You can cancel and place it again at a higher APR (a lower price) to meet buyers, or simply hold the notes and redeem them after maturity for their value. See [Order book](../concepts/order-book.md#cancelling).

### Can I lose money as a lender?

Yes, in two ways. If a borrower's collateral can't cover their debt, the shortfall is shared pro rata by all note holders of that maturity. And if you sell notes early after rates have risen, you receive less than their value at maturity. See [Bad debt](../concepts/bad-debt.md) and [Risks](../how-it-works/risks.md).

### What happens to my lend order if it hasn't filled by maturity?

It stays on the book but can no longer fill. Cancel it to get your USDC back; cancelling works at any time. See [Maturities](../concepts/maturities.md#the-life-of-a-maturity).

### When can I redeem, and what if there isn't enough USDC yet?

From the maturity time on. A redemption pays up to what the maturity's redemption pool holds. If some borrowers haven't repaid yet, the rest of your notes stay as notes until repayments or liquidations, which can start one hour after maturity, refill the pool. See [Redeem](../guides/redeem.md).

## Borrowers

### What collateral can I use?

ETH from Arbitrum, ETH from Base, and NEAR. One loan can hold several of them. See [Collateral and health](../concepts/collateral-and-health.mdx#collateral-tokens).

### How much can I borrow?

Up to 70% of your collateral's value, measured against the debt face, which includes the interest to maturity. For example, about 0.635 ETH at $2,260, plus a small margin for the oracle's confidence interval, supports a 21-day loan of 1,000 USDC at 8% APR. See [Collateral and health](../concepts/collateral-and-health.mdx#worked-example).

### Can I repay early?

Yes. You can repay the full debt face at any time, or, usually cheaper, buy notes back in the same maturity with a `lend` order: notes trade below their value before maturity, and they cancel against your debt automatically. See [Netting](../concepts/zero-coupon-notes.md#netting) and [Manage a loan](../guides/manage-loan.md).

### When can my loan be liquidated?

When its health factor falls below 1, or when it is still unpaid one hour after maturity. The health factor uses each token's 80% liquidation threshold and conservative oracle prices. See [Liquidation](../concepts/liquidation.mdx).

### What happens if I don't repay by maturity?

You have a 1-hour grace period after maturity. After that, anyone can liquidate the loan whatever its health: they repay your debt and receive collateral worth the debt plus a 5% bonus. You keep the rest of your collateral and can withdraw it. See [Liquidation](../concepts/liquidation.mdx#worked-examples).

### Does collateral in one maturity protect a loan in another?

No. Each loan belongs to one maturity, and its collateral backs only that loan. See [Collateral and health](../concepts/collateral-and-health.mdx#one-loan-per-maturity).

## System and trust

### Who can liquidate?

Anyone with USDC in their Intents balance, by sending it to `setllend.near` with a `liquidate` message. The operator runs a keeper that checks every loan every 10 seconds. See [Liquidation](../concepts/liquidation.mdx#who-liquidates).

### What if the Setllend backend is down?

Your funds stay in escrow on the contract, and apart from a liquidation, nothing moves them without your signature. While the backend is down, new orders don't get matched and its keeper doesn't liquidate. But `match_orders` and liquidations are open to anyone, the book can be rebuilt from the contract's views, and any NEAR account can submit your signed intents to `intents.near`, so you can cancel orders and withdraw without the operator. See [Trust model](../how-it-works/trust-model.md).

### What if the oracle price is stale?

New borrowing, liquidations, and collateral withdrawals against open debt pause until prices are fresh again. Repaying, adding collateral, placing and cancelling orders, note sales, redemptions, and other withdrawals keep working. There is no admin pause. See [Oracle](../concepts/oracle.md#when-a-price-is-stale).

### Can the owner change the rules?

The owner can add maturities, add collateral tokens, freeze them, and change their max LTV, liquidation threshold, and bonus. Those changes apply at once, to open loans too. The grace period and the oracle guards are fixed at initialization, and no contract method lets the owner move users' funds. The contract account does keep a full-access key, so new code could be deployed. See [Risk parameters](./risk-parameters.md) and [Trust model](../how-it-works/trust-model.md).

### Is the contract audited?

No. The contract has unit tests and sandbox tests, and its source is public. To check what is deployed on mainnet, see [Verify the contract](../verify/verify-contract.md).

### Why is my note worth slightly less than the formula says?

Rounding. Note value rounds down to 0.000001 USDC, so the remaining holders are never diluted. If bad debt has been realized in that maturity, every note there is also worth less by the same fraction. See [Zero-coupon notes](../concepts/zero-coupon-notes.md#rounding-always-favors-the-pool).
