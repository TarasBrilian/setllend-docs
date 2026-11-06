---
title: Errors
description: Every panic message setllend.near can produce, grouped by action, with its meaning and how to fix it, and how failed transfers and auth calls are refunded.
---

When a check fails, the contract panics with a short message and every state change of that receipt is reverted. In a transaction outcome the message appears as a function call error of the form `Smart contract panicked: <message>`. This page lists every message in the deployed code, grouped by the action that can produce it.

`match_orders` is different: a fill that fails a check is **skipped**, not panicked, and reported with a `fill_skipped` event. Those reasons are listed in [Matching](./matching.md#skip-reasons).

## What a failure costs

| Path | What happens on a panic |
|---|---|
| `transfer` + `msg` (`mt_on_transfer`) | State reverted. `intents.near` refunds **the full amount of every token** to the sender's Intents balance |
| `auth_call` (`on_auth`) | State reverted. Nothing moved, so nothing to refund. The intent batch still succeeds, because the call is detached |
| Price callbacks (`on_liquidate_prices`, `on_withdraw_collateral_prices`, `on_match_prices`) | The callback's state is reverted. Nothing changed before the oracle call, so the action simply didn't happen. A liquidator is refunded in full |
| Payouts (`mt_transfer` to the user) | Not a panic: `on_payout` credits the free balance and emits `payout_failed`. Withdraw it with the auth call `withdraw` |

Gas burnt up to the failure is not refunded. Gas that was prepaid but not burnt is.

### Refunds from `mt_on_transfer`

`mt_on_transfer` returns one refund amount per token. `intents.near` resolves the transfer afterwards:

- **The call returns normally:** each token's refund (usually `"0"`, or the overpayment of a `repay`, or the unused part of a `liquidate` offer) goes back to the sender's Intents balance.
- **The call panics, or returns something malformed:** `intents.near` refunds the full amount of every token, and the panic has reverted Setllend's state. An invalid order can never keep part of the funds.
- **`liquidate`** returns a promise. If the callback panics, the promise fails and the liquidator gets the full amount back.

The refund happens in a later receipt of the same transaction, within a few seconds.

## Any transfer action

| Message | Meaning | Fix |
|---|---|---|
| `Caller must be the intents contract` | `mt_on_transfer` or `on_auth` was called by an account other than `intents.near` | Go through a NEAR Intents `transfer` or `auth_call` intent |
| `Length mismatch` | `token_ids` and `amounts` differ in length | Only reachable by a malformed direct call |
| `Amount must be positive` | A token amount is 0 | Send a positive amount of every token |
| `Invalid msg` | `msg` isn't valid JSON for a known action: unknown `action`, missing field, a `u64`/`u128` written as a number, an account ID with uppercase letters | Check the format in [Transfer messages](./messages.md). Lowercase EVM addresses |
| `Expected exactly one token` | `lend`, `repay`, or `liquidate` carried zero or several tokens | Send only USDC |
| `Wrong token` | `lend`, `repay`, `liquidate`: the token isn't the debt token. `borrow`, `add_collateral`: a token isn't a listed collateral token | Use the asset IDs from `get_config` and `get_collateral_tokens` |
| `No tokens` | `borrow` or `add_collateral` with no tokens | Send at least one collateral token |
| `Collateral token is frozen` | `borrow` or `add_collateral` with a frozen token | Use another collateral token |
| `Duplicate token` | The same token listed twice | List each token once |

## Placing orders (`lend`, `borrow`, `sell_note`)

| Message | Meaning | Fix |
|---|---|---|
| `Unknown maturity` | The maturity isn't in the contract's list | Pick one from `get_maturities` |
| `Maturity has passed` | The maturity is not in the future | Pick a later maturity |
| `Expiry has passed` | `expires_at` is not in the future | Use a later expiry, or `null` |
| `Principal must be positive` | `borrow` with `principal` = 0 | Ask for a positive principal |
| `No collateral in loan` | Auth call `borrow`: the signer has no loan with collateral in that maturity | Use a transfer `borrow` with collateral, or `add_collateral` first (needs debt) |
| `Value must be positive` | `sell_note` with `value` = 0 | Sell a positive value |
| `Value exceeds free notes` | `sell_note` for more than the value of the signer's free shares | Read `get_notes` and sell at most `free_value`. Shares locked in another `sell_note` order are not free |

## `add_collateral`

| Message | Meaning | Fix |
|---|---|---|
| `No debt` | The sender has no loan with debt in that maturity | Collateral only goes into a loan with debt. To borrow, send a `borrow` with the collateral instead |
| `Debt is overdue` | `block_time ≥ maturity + grace` | Too late to top up. Repay the debt before the keeper liquidates it |

## `repay`

| Message | Meaning | Fix |
|---|---|---|
| `No debt` | No loan for that borrower and maturity, or its debt is already zero | Check `get_loan` and the `borrower` field. Nothing to repay |

## `liquidate`

| Message | Meaning | Fix |
|---|---|---|
| `No loan` | No loan for that borrower and maturity | Check `get_loans` |
| `No debt` | The loan has no debt (also when it was repaid while the oracle call was in flight) | Nothing to liquidate |
| `Loan is not liquidatable` | Health factor ≥ 1 at conservative prices and not yet `maturity + grace` | Wait. Check health off-chain with the same prices first |
| `No price` | No usable price for USDC or for one of the loan's tokens, frozen ones included | Retry when the oracle has fresh prices |
| `Nothing to seize` | Every token's share rounds to 0 (a dust loan with a small repayment) | Offer more USDC. A loan whose only collateral is too small to seize a single unit can only be cleared by a repayment |
| `Math overflow` | A value product exceeds 512 bits (only with absurd amounts) | Liquidate in smaller parts |

## `cancel`

| Message | Meaning | Fix |
|---|---|---|
| `Order not found` | The order doesn't exist: already filled, cancelled, or never placed | Check `get_orders_by_account` |
| `Not the order owner` | The signer didn't place this order | Sign with the owner's account |

## `withdraw_collateral`

| Message | Meaning | Fix |
|---|---|---|
| `Amount must be positive` | `amount` = 0 | Withdraw a positive amount |
| `No loan` | The signer has no loan in that maturity | Check `get_loans_by_account` |
| `Amount exceeds collateral` | More than the loan holds of that token (also checked again in the callback) | Read `get_loan` and withdraw at most that amount |
| `Debt is overdue` | The loan has debt and `block_time ≥ maturity + grace` | The collateral now secures overdue debt. Repay first |
| `No price` | The loan has debt and a needed price is missing or invalid | Retry later, or repay the debt so no price is needed |
| `Withdrawal exceeds max LTV` | What is left would fail the max LTV check at conservative prices | Withdraw less, repay part of the debt, or add collateral first. Frozen tokens give no borrowing power |

## `redeem`

| Message | Meaning | Fix |
|---|---|---|
| `Not matured` | `block_time` is before the maturity | Wait for maturity, or sell the notes with `sell_note` |
| `Unknown maturity` | The maturity isn't listed | Use a maturity from `get_maturities` |
| `Nothing to redeem` | The signer has no free notes in that maturity (or asked for 0) | Check `get_notes`. Cancel an open `sell_note` order to unlock its shares |
| `Value exceeds free notes` | Asked for more than the value of the free shares | Ask for at most `free_value`, or `null` for all |
| `Redemption pool is empty` | No repayments or liquidations have paid into the pool yet | Retry after borrowers repay or the keeper liquidates overdue loans |

## `withdraw`

| Message | Meaning | Fix |
|---|---|---|
| `Nothing to withdraw` | No free balance of that token (or asked for 0) | Check `get_free_balances` |
| `Amount exceeds free balance` | Asked for more than the free balance | Ask for at most the balance, or `null` for all |

## `match_orders`

| Message | Meaning | Fix |
|---|---|---|
| `No fills` | Empty `fills` list | Send at least one fill |
| `Math overflow` | A fill's math overflowed. The whole batch reverts | Remove the offending fill |

Every other problem with a fill is a skip reason, not a panic.

## Owner methods

| Message | Meaning |
|---|---|
| `Owner only` | The caller isn't `owner_id` |
| `Maturity must be in the future` | `add_maturity` with a past timestamp |
| `Maturity exists` | `add_maturity` with a listed maturity |
| `Debt token cannot be collateral` | `add_collateral_token` with the USDC asset ID |
| `Collateral token exists` | `add_collateral_token` with a listed token |
| `Feed ID is empty` | `add_collateral_token` with an empty `feed_id` |
| `Require 0 < max_ltv < liq_threshold` | Invalid ratios on add or update |
| `Require liq_threshold * (1 + liq_bonus) < 100%` | A liquidation at the threshold couldn't pay the bonus |
| `Unknown collateral token` | Update, freeze, or unfreeze of a token that isn't listed |
| `Already frozen` / `Not frozen` | Freeze of a frozen token, unfreeze of an unfrozen one |

## Internal and framework messages

These should not occur in normal use, but can appear in outcomes:

| Message | Source |
|---|---|
| `Method on_auth doesn't accept deposit` (or another method name) | A deposit was attached to a method that takes none. For `auth_call`, keep `attached_deposit` at 0 |
| `Method on_payout is private` (or another callback) | Someone other than the contract called a `#[private]` callback |
| `Failed to deserialize input from JSON. Error: …` | Malformed arguments to a public method such as `match_orders` or a view |
| `Failed to deserialize callback using JSON. Error: …` | The oracle returned something that doesn't parse. The callback reverts and nothing happens |
| `Notes have no value` | Pricing new notes when `V = 0` and `S > 0`. Fills check this first and skip with `notes_wiped_out` |
| `Invalid price` | A non-positive mid price in seizure. Validated prices are always positive |
| `Division by zero`, `Wrong ask kind`, `Unknown collateral token` (outside owner methods) | Guards against bugs |
| `Exceeded the prepaid gas` | Not a contract message: the call ran out of gas. Raise `min_gas` on the intent or the transaction's gas. See [Gas](./gas.md) |
