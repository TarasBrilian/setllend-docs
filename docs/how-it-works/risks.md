---
title: Risks
description: The dependencies and risks that come with using Setllend, from bridges and the oracle to liveness, bad debt, owner powers, and smart-contract risk.
---

Setllend removes some risks of lending (no variable rate, no lock-up until maturity, no operator custody) but not all of them. This page lists what can go wrong, what Setllend does about it, and what is left to you. For who controls what, see [Trust model](./trust-model.md).

## Bridges

ETH from Arbitrum and Base, and USDC from those chains, reach NEAR through bridges: the tokens `nep141:arb.omft.near`, `nep141:base.omft.near`, and the bridged USDC tokens are issued on NEAR against assets held on the other chain (NEAR Intents uses the Omni and PoA bridges).

- **If a bridge fails or is exploited**, its tokens on NEAR may lose value or become impossible to withdraw. ETH(arb) and ETH(base) are priced by the same ETH/USD feed, so the oracle would keep valuing a broken bridge's ETH as ETH. Loans backed by it could then hold collateral worth less than it appears.
- **Lenders** are exposed to this through borrowers' collateral, and through [bad debt](#bad-debt) if that collateral can't cover the loans.
- **Deposits and withdrawals** to other chains depend on the bridges being up.

Native NEAR USDC, the debt token, and NEAR collateral don't use these bridges.

## Oracle

Every `borrow` fill, liquidation, and collateral withdrawal with open debt uses prices from `aggregate-oracle.near`. Note sales (`sell_note` fills) need no price.

- **It is operated and upgradeable by Rhea.** Its source repository is private, so its code can't be reviewed, and Rhea can change it. Rhea Lend uses the same oracle for its own markets.
- **A single reporter key** submits the price reports. The reports are signed price data, but without the source, Setllend can't confirm how the contract checks them.
- **No time-averaged price** is available. A short spike can trigger liquidations.

What Setllend does: the contract validates every price in its own callback. A price must be positive, have a confidence interval of at most 1% of the price, and be no more than 60 seconds old. Collateral checks use conservative prices (price minus confidence for collateral, price plus confidence for debt). If a feed fails these checks, new loans, liquidations, and collateral withdrawals with debt stop, while every exit keeps working. See [Oracle](../concepts/oracle.md) and [Trust model](./trust-model.md#no-admin-pause).

A wrong but plausible price passes these checks. It could open loans against too little collateral, or liquidate healthy loans.

## 1Click

Deposits from Base and Arbitrum and withdrawals back go through 1Click, the NEAR Intents swap API.

- **It can be unavailable.** 1Click has paused for maintenance with little notice, for longer than announced. The app then shows "1Click is temporarily unavailable". Orders, cancels, repayments, and NEAR wallet deposits and withdrawals keep working, since they don't use it.
- **Swaps can be refunded.** A swap that 1Click can't complete is refunded to the refund address (for deposits) or the Intents balance (for withdrawals).
- **Quotes are estimates.** Each quote has a slippage tolerance (0.5% for USDC and ETH routes, 1% for swaps to or from NEAR) and a minimum that arrives.

Turning native NEAR USDC into USDC on Base or Arbitrum always needs a swap, normally through 1Click. ETH collateral also has a bridge withdrawal path that doesn't need 1Click.

## Liveness of the matcher, relayer, and keeper

The operator runs the matcher, relayer, and keeper in one backend process. If it stops:

- **No new fills** until someone matches. Your orders stay escrowed and cancellable.
- **No gasless submissions** through the app. Anyone with a NEAR account can still submit signed intents.
- **No liquidations by the operator.** Anyone can liquidate an eligible loan, but if nobody does, unhealthy and overdue loans stay open while prices move, which can turn into bad debt.

See [Backend services](./backend-services.md#when-a-component-is-down).

## Bad debt

If a borrower's collateral is worth less than their debt plus the liquidation bonus when the loan is liquidated, the liquidation can't recover the full debt. Once all of a loan's collateral has been seized and debt is still left, the contract **realizes that rest as bad debt**: the loan's debt is cleared, the maturity's total note value is written down by the same amount, and a `bad_debt_realized` event is emitted. The loss is **shared pro rata** by every note holder in that maturity, because each note is a share of that maturity's pool. Other maturities are not affected.

Bad debt becomes likely when prices fall faster than liquidations happen: a sharp drop, a stale oracle, or a keeper that isn't running. See [Bad debt](../concepts/bad-debt.md).

## Owner parameter changes

The owner can change a collateral token's max LTV, liquidation threshold, and liquidation bonus, and freeze or unfreeze a token, with **immediate effect on open loans**. Lowering a liquidation threshold can make a loan liquidatable in the same block, without warning. Borrowers who want room for such a change should keep their health factor well above 1. See [Trust model](./trust-model.md#what-the-owner-can-do).

## Smart-contract risk

- **The contract has not been audited.** It is tested with unit tests and sandbox tests that deploy the built wasm with mock `intents.near` and oracle contracts and run order, multi-token loan, liquidation, and bad-debt flows. Tests don't prove the absence of bugs.
- **There is no cap on losses.** The contract has no deposit caps or order size limits; only the lending mechanism's parameters apply.
- **The code can be upgraded.** `setllend.near`'s full-access key is kept so bugs can be fixed, which means new code can be deployed. See [Trust model](./trust-model.md#the-contract-accounts-full-access-key).
- **The deployed code is verifiable.** It is a reproducible build of a public commit, so anyone can check that what runs is the published source. See [Verify the contract](../verify/verify-contract.md).
- **Dependencies.** The contract relies on `intents.near` behaving as documented: verifying signatures, refunding a failed `mt_on_transfer` in full, and executing `mt_transfer` payouts.

## Storage on NEAR

Every open order, loan, and note record locks some of the contract's NEAR for storage, paid by the contract, not by users. If the contract ran out of free NEAR, a failed payout couldn't be recorded as a free balance. The keeper raises an alert when the contract's free NEAR falls below 1 NEAR, so it can be topped up first.

## Risks that are part of lending

These come with the product itself rather than with its infrastructure:

- **Liquidation.** A borrower whose health factor falls below 1 can be liquidated and loses collateral worth the repaid debt plus a 5% bonus. A loan not repaid by maturity plus the 1-hour grace period is liquidated at any health. See [Collateral and health](../concepts/collateral-and-health.mdx).
- **Selling before maturity.** A lender who sells notes early gets the price a buyer bids, at the buyer's rate. If rates have risen, or no buyer is bidding, an early exit can return less than the original principal plus the interest earned so far. See [Exit early](../guides/exit-early.md).
- **Fixed means fixed.** A lender's rate doesn't rise if market rates do, and a borrower's doesn't fall.
