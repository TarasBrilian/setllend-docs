---
title: Redeem
description: Collect the USDC your notes are worth once their maturity has passed, and understand when a redemption can pay less.
---

At maturity, each note pays its value in USDC. **Redeeming** turns your notes into USDC and, in the same flow, sends it to the chain or account you pick. You can redeem any time **at or after** the maturity; there is no deadline. Waiting earns no extra interest, and notes still outstanding when a loss is realized share it (see [How bad debt can lower the value](#how-bad-debt-can-lower-the-value)).

## Where the USDC comes from

Each maturity has a **redemption pool**. It fills up as borrowers in that maturity repay, and as liquidations repay overdue or unhealthy loans. A redemption pays from that pool.

- Borrowers have until maturity plus a **1-hour grace period** to repay. After that, Setllend's keeper (or anyone) liquidates unpaid loans, which refills the pool from the collateral.
- If you redeem before every borrower has repaid or been liquidated, the pool may hold less than your notes are worth. The contract then pays **what the pool holds** and keeps the unpaid part as notes, which you redeem later. The result card always shows what was actually paid.

## Redeem your notes

1. Open **Portfolio → All My Positions → Lend**. A maturity that has passed shows **Redeemable**. (Before maturity, **Redeem** is disabled: "Available after maturity".)
2. Click **Redeem**. The modal **Redeem notes** ("Matured *date*") shows **You receive**: the value of your free notes.
3. Pick **Receive USDC on**: **Arbitrum** or **Base** through 1Click, or **NEAR** (your NEAR account) for a NEAR account, which is the default there. A NEAR account choosing Arbitrum or Base enters **Your address on** that chain.
4. Click **Redeem $…** and sign.

You can also redeem from **Your activity in this market → Positions** on the market detail page.

The steps:

1. "Sign the redemption with your wallet": the `redeem` action.
2. "USDC reaches your Intents balance": the contract pays it out.
3. The exit, for the amount the redemption actually paid:
   - **Arbitrum or Base:** **Withdraw USDC to Arbitrum** (or Base) through 1Click, with a second signature.
   - **NEAR account:** "Register on USDC (first time only, 0.00125 NEAR)" if your account has never held USDC, then "Sign the withdrawal of USDC to your NEAR account".

The [Withdraw](withdraw.md) guide explains the exit steps, fees, and refunds in detail.

## What you sign

An `auth_call` to `setllend.near`:

```json
{"action": "redeem", "data": {"maturity": "1795766400000000000", "value": null}}
```

`value: null` redeems all your free notes in that maturity, which is what the app sends. The contract burns the matching note shares, pays the USDC to your Intents balance, and emits `redeemed` with the value paid.

## How bad debt can lower the value

Your notes are shares of the maturity's note pool. Normally a share is worth one USDC at maturity. If a borrower in that maturity is liquidated and their collateral can't cover their debt, the shortfall is **bad debt**: it is written off and the value of **every** note in that maturity drops by the same fraction.

**Example.** A maturity has 100,000 USDC of notes. One loan ends with 2,000 USDC of debt that its collateral could not cover. Every note is now worth 98% of face: your 1,003.45 USDC of notes redeem for about 983.38 USDC.

- The loss is shared **pro rata** by everyone holding notes in that maturity when it is realized.
- Lenders who redeemed before it was realized were paid in full.
- Other maturities are not affected.

Portfolio shows your notes at their current value, so a write-off shows up there at once. See [Bad debt](../concepts/bad-debt.md) for how a loan gets there and why the risk is kept small (70% max LTV, liquidation at 80%, a keeper that liquidates every eligible loan).

## Notes listed for sale

Notes in an open sell order are **locked** and are not redeemed. The modal says "Notes listed for sale stay locked. Cancel the sell order to redeem them too." A sell order can't fill after maturity, so cancel it from **Open Orders**, then redeem.

## Timing and fees

- The `redeem` step usually completes in seconds; the 1Click exit to Arbitrum or Base takes about 10 to 30 seconds more.
- Setllend charges nothing, and the relayer pays the gas. A 1Click exit has a small fee ([Withdraw](withdraw.md#fees-and-timing)).

## When something goes wrong

| What you see | Meaning | What to do |
|---|---|---|
| **Redeem** is disabled | The maturity hasn't passed, or all your notes are listed for sale. | Wait for maturity, or cancel the sell order. |
| "Not done: Redemption pool is empty" | No borrower in this maturity has repaid yet, and no liquidation has refilled the pool. | Wait until after the grace period, when unpaid loans are liquidated, and redeem again. Your notes stay in your account until then. |
| "Not done: Not matured" | The maturity hasn't arrived on chain yet. | Wait a moment and try again. |
| The redemption paid less than **You receive** | The pool held less than your notes are worth. | The rest stays as notes. Redeem again later. |
| The exit step failed after the redemption | The USDC is in your Intents balance (or, if the payout itself failed, in your Setllend free balance). | Withdraw it from **My Assets** ([Withdraw](withdraw.md)). |
