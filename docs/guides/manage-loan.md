---
title: Manage a loan
description: Repay, repay early for less through netting, add collateral, and withdraw collateral on an open Setllend loan.
---

Once a borrow order fills, you have a **loan** in that maturity: one or more collateral tokens and a **debt face**, the USDC you owe at maturity. This page covers everything you can do with it before it is closed: repay, repay early for less, add collateral, and withdraw collateral.

## Find your loan

- **Portfolio → All My Positions → Borrow** lists one row per loan, for every maturity.
- On a market detail page, **Your activity in this market → Positions** shows the loan in that maturity.

Each row shows the maturity and its status, every collateral token with its amount and USD value, the **Debt at maturity** with its average fixed rate, the **Health** factor, and the **Liquidation price** per token. The actions are **Repay**, **Add collateral**, and **Withdraw** (withdraw collateral).

| Status | Meaning |
|---|---|
| *n* days left | Before maturity. |
| **Due: repay within the grace period** | The maturity has passed. You have the 1-hour grace period to repay. |
| **Overdue: can be liquidated** | The grace period is over. Any unpaid debt can be liquidated, whatever the health factor. |

Health is per loan, never per account: a weak loan in one maturity is not helped by collateral in another. See [Collateral and health](../concepts/collateral-and-health.mdx).

## Repay

1. Click **Repay** on the loan. The modal **Repay** ("Loan maturing *date*") opens with the **Amount** prefilled to the whole debt. Enter less for a partial repayment, or click **Max**.
2. Under **Pay from**, choose **Intents balance** (the default when it covers the amount) or **New deposit**, with **Pay USDC from** Arbitrum, Base, or NEAR for a NEAR account.
3. Check **Debt after** and **Health factor after**.
4. Click **Repay** and sign.

The steps are the deposit if needed, "Sign the repay transfer with your wallet", and "Debt reduced. Your collateral stays until you withdraw it".

**What you sign:** a `transfer` of USDC to `setllend.near` with this `msg`:

```json
{"action": "repay", "data": {"maturity": "1795766400000000000", "borrower": null}}
```

`borrower: null` means your own loan. The contract may also take a repayment for someone else's loan, but the app always repays yours.

**What happens on chain:** the contract lowers the loan's debt face by the amount, puts the USDC in the maturity's **redemption pool** (where lenders are paid from at maturity), and emits `repaid`. If you send more than the debt, the rest is refunded to your Intents balance. Your collateral stays in the loan until you withdraw it, even when the debt is zero.

Repaying before maturity costs the **full debt face**: the interest to maturity is part of what you owe from the start. To pay less, use netting below.

## Repay early for less by lending in the same maturity

Before maturity, notes trade below face value. If you **buy notes in the maturity where you owe**, they cancel your debt one for one. This is called **netting**, and it is automatic.

1. Go to the market detail page of your loan's maturity and open the **Lend** tab (or click **Start Earning** on its card).
2. Enter the USDC to spend and a **Min rate** at or below the market's **Lend Rate**, so the order fills against borrowers and note sellers now.
3. Click **Place lend order** and sign.

After each fill, the contract compares the value of your notes with your debt in that maturity and cancels the smaller of the two from both (event `netted`). The redemption pool is not touched, because the notes and the debt simply disappear together. Notes beyond your debt stay as notes.

**Worked example.** Your loan owes 1,004.60 USDC at maturity, 14 days away, and borrowers are asking 6% APR.

- Repaying costs **1,004.60 USDC**.
- Buying 1,004.60 USDC of notes at 6% costs 1,004.60 / (1 + 0.06 × 14 / 365) = **1,002.29 USDC**.
- You save **2.31 USDC**, and the loan's debt is zero.

The **Repay** modal reminds you of this before maturity: "Cheaper before maturity: place a lend order in this maturity instead." Netting needs someone on the other side: if no ask crosses your rate, your lend order waits like any other. After maturity, notes can no longer be bought, so use **Repay**.

## Add collateral

Adding collateral raises the health factor and lowers the liquidation prices. It needs no oracle price, so it works even when prices are stale.

1. Make sure the token is in your Intents balance ([Deposit](deposit.md)). Collateral is added only **from your deposited balance**.
2. Open the modal in one of two ways:
   - **Add collateral** on the loan row, then pick the **Token**.
   - **Add to collateral** next to a deposit in **My Assets**, then pick the **Loan**.
3. Enter the **Amount** (**Max** takes the whole deposit). The hint shows "Deposited and not collateral: …".
4. Check **Health factor** (before → after) and **Max LTV of this token**.
5. Click **Add to collateral** and sign.

**What you sign:** a `transfer` of the token to `setllend.near` with `{"action":"add_collateral","data":{"maturity":"…"}}`. The contract adds it to your loan and emits `collateral_added`.

**Rules:**

- The loan must have debt. A loan with no debt answers "This loan has no debt. Withdraw its collateral instead".
- It must be before maturity plus the grace period. After that the debt is liquidatable whatever its health, so a top-up would only go to the liquidator: "Past maturity and the grace period: collateral can no longer be added".
- A frozen token can't be added ("This token is frozen").

## Withdraw collateral

You can take collateral out one token at a time.

1. Click **Withdraw** on the loan row. The modal is **Withdraw collateral**.
2. If the loan holds several tokens, pick one.
3. Enter the **Amount**. With debt, **Max** and the hint give the most you can take: "Up to … while the loan stays within its borrow limit". Without debt: "The loan is repaid: all of it is free".
4. Check **Health factor after** and the new **Liquidation price**.
5. **NEAR account taking ETH out:** enter **Your address on Arbitrum** (or Base) for the 1Click payout.
6. Click **Withdraw collateral** and sign.

**What you sign:** an `auth_call` to `setllend.near`:

```json
{"action": "withdraw_collateral", "data": {"maturity": "1795766400000000000", "collateral_token": "nep141:arb.omft.near", "amount": "250000000000000000"}}
```

This takes 0.25 ETH from Arbitrum out of the loan.

**What happens on chain:**

- **No debt left:** the contract pays the token out at once. No price is needed.
- **Debt remains:** the contract reads the oracle and allows the withdrawal only if the rest of the collateral still covers the debt face at **max LTV** (not the liquidation threshold), at conservative prices. Otherwise it fails with "Withdrawal exceeds max LTV". If the oracle has no fresh price, it fails with "No price"; try again a little later.
- After maturity plus the grace period, a withdrawal from a loan with debt is refused ("Debt is overdue"). The app blocks it first with "Overdue: repay first".

The token goes to your Intents balance (event `collateral_withdrawn`). Then:

- **ETH** continues straight to its own chain through 1Click: you sign the 1Click withdrawal once more, in the step **Withdraw ETH to Arbitrum** (or Base), and the ETH lands in your wallet there.
- **NEAR** stays in your Intents balance, ready to reuse as collateral or to take out with [Withdraw](withdraw.md).

If the contract's payout to your Intents balance fails, the tokens are kept for you as a **free balance** in Setllend, and the modal stops before the 1Click step. Withdraw it from **My Assets** ([Withdraw](withdraw.md#free-balances-from-failed-payouts)).

## At and after maturity

- **At maturity** the loan row turns to **Due: repay within the grace period**. Repay the remaining debt within **1 hour**.
- **After the grace period** the row reads **Overdue: can be liquidated**. Setllend's keeper (or anyone) can then repay your debt and take your collateral plus a 5% bonus. Repaying is still possible until that happens.
- A liquidation takes the same fraction of every collateral token in the loan. If the collateral is worth less than the debt plus the bonus, all of it is taken and the rest of the debt is written off as [bad debt](../concepts/bad-debt.md), which the lenders of that maturity bear.

A loan can also be liquidated **before** maturity, when its health factor falls below 1.00. See [Liquidation](../concepts/liquidation.mdx) and try the numbers in its calculator.

## When something goes wrong

| What you see | Meaning | What to do |
|---|---|---|
| "More than your debt" | The repay amount is above the debt face. | Use **Max**. |
| "Above the borrow limit after withdrawal" | The amount would leave the loan above max LTV. | Withdraw less, or repay first. |
| "Not done: Withdrawal exceeds max LTV" | Prices moved between the preview and the check. | Withdraw a little less. |
| "Not done: No price" | The oracle has no fresh price. | Wait a minute and **Try again**. Repaying and adding collateral don't need prices. |
| "You have no loan with debt to add to" | No loan qualifies for a top-up. | Only loans with debt, before maturity plus grace, can take collateral. |
| A step marked **?** | The outcome isn't known. | Check **History** and the loan row before signing again. |
