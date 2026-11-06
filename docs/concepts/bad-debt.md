---
title: Bad debt
description: What happens when a borrower's collateral can't cover their debt, and how the loss is shared fairly among the note holders of that maturity.
---

**Bad debt** is debt that is left after all of a loan's collateral is gone. It can happen when a collateral price falls so fast that the loan's whole collateral is worth less than its debt plus the liquidation bonus before anyone [liquidates](./liquidation.mdx) it. Setllend has no insurance fund or reserve to absorb it. Instead the loss is shared pro rata by every note holder of that maturity, through the share-based note accounting described on [Zero-coupon notes](./zero-coupon-notes.md#shares-and-value).

## How a loan reaches bad debt

A liquidator receives collateral worth the repaid USDC plus the bonus (5% today). When the collateral is worth less than `debt × 1.05`, a full liquidation can't be paid that way. The contract then caps it: the liquidator receives **all** of every collateral token and repays only what the collateral is worth after the bonus. The liquidator still earns the bonus on what they repay, so they have a reason to close such a loan. The operator's keeper liquidates every eligible loan, including small ones where gas costs more than the bonus.

## When it is realized

Bad debt is realized inside the liquidation itself. If, after the seizure, every collateral token of the loan has reached zero while debt remains, the contract:

1. writes the remaining debt `B` off (the loan's debt face becomes 0);
2. lowers the maturity's total note value: `V = max(V − B, 0)`, while the total shares `S` stay the same;
3. adds `B` to the maturity's `bad_debt_total` and emits a `bad_debt_realized` event with the borrower, the maturity, the amount, and the total note value after the loss.

Nothing else is needed: no list of note holders to update, no vote, no admin step.

## Who bears it

Every note holder of **that maturity**, in proportion to their shares, at the moment of realization. Since `V` drops and `S` doesn't, every share is worth the same fraction less. In detail:

- **Other maturities are not affected.** Each maturity has its own note pool and its own loans.
- **Holders who redeemed before the realization were paid in full.** Their notes were already burned.
- **Notes in a resting `sell_note` order lose value too**, because the order holds shares, not a fixed amount of USDC.
- **Lenders who join after the loss don't share it.** New notes are minted at the new `V / S`, so a new lender gets more shares for the same note value and pays only for what the notes are worth now.

This is the same trade-off Morpho Blue makes for its lenders. It keeps the accounting to two numbers per maturity and treats every holder at the time of the loss the same way.

## Worked example

A maturity has a total note value of `V` = 10,000 USDC in `S` = 10,000 shares. Alice holds 6,000 shares, Bob 4,000.

A loan in this maturity owes 1,000 USDC of debt face, and its collateral has fallen to $525 before anyone liquidated it. A liquidator receives all of the collateral and repays what it is worth after the 5% bonus, 525 / 1.05 = 500 USDC. The other **500 USDC** is realized as bad debt:

| | Before | After |
|---|---|---|
| `V` (total note value) | 10,000 USDC | 9,500 USDC |
| `S` (total shares) | 10,000 | 10,000 |
| Value of one share | 1.00 USDC | 0.95 USDC |
| Alice, 6,000 shares | 6,000 USDC | 5,700 USDC |
| Bob, 4,000 shares | 4,000 USDC | 3,800 USDC |

Both lost 5%, the loss divided by the total note value. Carol now lends and buys 950 USDC of note value. She receives `950 × 10,000 / 9,500` = **1,000 shares**, worth exactly 950 USDC. Her notes carry none of the earlier loss.

The small loan on the [Liquidation](./liquidation.mdx#worked-examples) page shows the other side: 0.05 ETH at $1,400 against 70 USDC of debt face. The keeper repays 66.666667 USDC for all the ETH, and the remaining **3.333333 USDC** is realized as bad debt in that maturity.

## Redemption and the redemption pool

Every maturity keeps a **redemption pool** of USDC: repayments and the USDC liquidators pay go into it, and note holders redeem from it after maturity. The contract keeps the pool plus all outstanding debt face at least equal to `V`, so once every loan is repaid or liquidated, every remaining share can be redeemed at its value.

Before that point, the pool may hold less than all the notes are worth, for example right after maturity while some borrowers still have an hour to repay. A redemption pays up to what the pool holds, and the value it can't pay yet stays as shares until more repayments or liquidations refill the pool. Since a holder who redeems before a loss is realized is paid in full, the loss falls on the shares still outstanding when it is realized.

## A maturity wiped out

If losses take `V` all the way to 0 while shares remain, the notes of that maturity are worth nothing, and the contract rejects new fills there (`notes_wiped_out`), because new notes couldn't be priced against them.

## Checking it yourself

The `get_pool` view of `setllend.near` returns, for one maturity, the `redemption_pool`, `total_value` (`V`), `total_shares` (`S`), and `bad_debt_total`. The `get_notes` view returns the current value of an account's shares. Developer details: [Views](../developers/contract/views.md) and [Events](../developers/contract/events.md).
