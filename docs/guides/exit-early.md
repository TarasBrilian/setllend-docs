---
title: Exit early
description: Sell your notes before maturity with a sell_note order and get USDC now instead of waiting for the maturity date.
---

A lender is never locked in until maturity. You can **sell your notes** on the same order book to another lender, at any time before maturity, and get USDC now. You place a **`sell_note` order**: the note value you want to sell and the **maximum APR** you accept. It is an ask in the book, next to borrow orders, and it fills against lend orders.

## How the price works

A note pays its face value at maturity. Selling it now means the buyer pays its value **discounted at the fill rate**:

```
USDC received now = note value / (1 + APR × days left / 365)
```

So, as with any bond, **a higher rate means fewer USDC now**. Your **Max rate** is the highest rate, and so the lowest price, you accept. The best price available right now comes from the lend offer with the lowest rate, which the form shows as "Best lend offer: …%. A lower rate gets more USDC."

### Worked example

Twenty-one days before maturity you lent 1,000 USDC at 6%, for notes worth 1,003.45 USDC at maturity. Eleven days later (10 days left) you need the money, and the best lend offer is 6.5%.

- You receive now: 1,003.45 / (1 + 0.065 × 10 / 365) = **1,001.67 USDC**
- Interest given up: 1,003.45 − 1,001.67 = **1.78 USDC**
- You kept **1.67 USDC** of interest for the 11 days you held the notes.

If rates have risen a lot since you lent, the discount grows and you can receive less than you paid. If they have fallen, you receive more. See [Rates and prices](../concepts/rates-and-prices.mdx).

## Sell notes

You can sell from three places:

- **Portfolio → All My Positions → Lend:** click **Sell** on a maturity. The modal **Sell notes** ("Notes maturing *date*") has **Limit** and **Market** modes.
- **Market detail page:** the **Sell note** tab of the order panel. It is enabled only while you hold free notes in that maturity.
- **Your activity in this market → Positions:** **Sell** on the Notes row opens that tab.

Steps:

1. Enter the **Note value to sell**, in USDC at maturity. **Max** takes all your free notes; the hint shows "Your free notes in this maturity: … at maturity".
2. Enter the **Max rate (APR)**. It is prefilled with the best lend offer.
3. Check **You receive now** and **Interest given up**.
4. Click **Sell notes** and sign.

The steps are the key registration for a new NEAR key, "Sign the sell order with your wallet", and "Order placed. USDC from each fill goes to your Intents balance".

In **Market** mode the app places a limit order at the rate of the last lend offer needed for your amount and shows the **Average rate (APR)**, as for lending ([Lend](lend.md#market-mode)).

## What you sign

One `auth_call` intent to `setllend.near`. No tokens move when you sign, because your notes are already in the contract.

```json
{"action": "sell_note", "data": {"maturity": "1795766400000000000", "value": "1050000000", "max_rate_bps": 650, "expires_at": null}}
```

This offers 1,050 USDC of note value at up to 6.50% APR.

## What happens on chain

1. The contract checks the maturity is still ahead and that `value` is within your **free** notes, then **locks** the notes for the order and places the ask (event `order_placed`). In Portfolio they show as "… listed for sale".
2. The matcher pairs the ask with crossing lend bids and calls `match_orders`. No oracle price is needed: no new debt is created.
3. On each fill, the buyer's USDC goes to your **Intents balance**, and the matching notes move from your locked notes to the buyer. The fill rate is the maker's rate, as with every order: if a lend bid was resting at 6%, you sell at 6% even with a max of 6.5%.

Notes are held as shares of the maturity's note pool. Without [bad debt](../concepts/bad-debt.md), one share is worth one USDC at maturity, so the app shows values, not shares.

## Partial fills and cancelling

A sell order can fill in pieces. The USDC of each fill arrives in your Intents balance at once; the rest stays listed.

To stop selling, cancel the order from **Open Orders** (**Cancel**, then **Cancel order** in the modal). The remaining notes unlock and stay in your portfolio ("… of notes unlock and stay in your portfolio"). If you also owe debt in that maturity, the unlocked notes then [net against it](manage-loan.md#repay-early-for-less-by-lending-in-the-same-maturity) automatically.

Because fills are sized in USDC and rounded down, the last millionth of a USDC of a sell order can be impossible to fill exactly. That tiny remainder stays locked in the order until you cancel it.

## Locked notes

Notes listed for sale are locked. They can't be sold twice, netted against debt, or redeemed. A sell order can't fill once the maturity has passed, so after maturity, **cancel** any open sell order and then [redeem](redeem.md): the Redeem modal says "Notes listed for sale stay locked. Cancel the sell order to redeem them too."

## Timing and fees

- Fills usually come within seconds when a lend bid crosses your rate.
- Setllend charges no fee, and the relayer pays the gas. USDC you receive stays in your Intents balance until you [withdraw](withdraw.md) it or lend it again.

## When something goes wrong

| What you see | Meaning | What to do |
|---|---|---|
| "No notes to sell in this maturity" | You hold no free notes there (or they are all listed already). | Check **Portfolio → Lend**. |
| "More than your free notes" | The value is above your free notes. | Use **Max**. |
| "No orders to fill. Use Limit" | Market mode found no lend offers. | Switch to **Limit** and set a rate; the order waits in the book. |
| "Not done" with a reason, for example "Value exceeds free notes" | The contract rejected the order. Nothing was locked. | Fix the amount and **Try again**. |
| The order rests unfilled | No lend offer has a rate at or below your max rate. | Wait, raise your max rate (accepting fewer USDC), or cancel. |
