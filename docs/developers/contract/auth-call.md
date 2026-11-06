---
title: Auth call actions
description: The six actions that arrive through an auth_call intent and on_auth - borrow against a loan, cancel, sell_note, withdraw_collateral, redeem, and withdraw.
---

Actions that move no tokens into Setllend arrive as a NEAR Intents `auth_call` intent. `intents.near` verifies the signature and calls:

```rust
pub fn on_auth(&mut self, signer_id: AccountId, msg: String) -> PromiseOrValue<()>
```

`signer_id` is the account that signed the intent, and it is the owner for every action. `msg` uses the same `{"action": ..., "data": {...}}` format as transfers, serialized into a string.

## Rules for every auth call

- **The caller must be `intents.near`.** Anything else panics with `Caller must be the intents contract`.
- **The call is detached.** The user's intent batch succeeds even if `on_auth` fails, and a failure changes no state. Whoever relays the intent must read the outcome of the `on_auth` receipt before reporting success. Setllend's relayer does this.
- **Actions that pay out** (`cancel`, `withdraw_collateral`, `redeem`, `withdraw`) succeed once the payout is attempted. If the `mt_transfer` to the user's Intents balance fails, `on_payout` credits the user's free balance and emits `payout_failed`, and the receipt still succeeds. Look for a `payout_failed` event in the receipts to tell the two apart. The free balance can be withdrawn later with [`withdraw`](#withdraw).
- **Set `min_gas` to 100 Tgas.** `intents.near` guarantees `on_auth` only the intent's `min_gas`, 10 Tgas by default. Every payout reserves 15 Tgas and an oracle round trip about 30 Tgas more, so the default is not enough. Too little gas fails the call before any state change: funds are safe, but nothing happens. Setllend's relayer rejects any `auth_call` with less than `"100000000000000"`.
- **Keep `attached_deposit` at 0.** `on_auth` does not accept a deposit, so an `auth_call` with one fails, and the deposit is taken from the signer's wNEAR and not refunded.

### The surrounding intent

```json
{
  "intent": "auth_call",
  "contract_id": "setllend.near",
  "msg": "{\"action\":\"cancel\",\"data\":{\"order_id\":\"42\"}}",
  "min_gas": "100000000000000"
}
```

| Field | Value |
|---|---|
| `intent` | `"auth_call"` |
| `contract_id` | `"setllend.near"` |
| `msg` | The Setllend message, serialized into a string |
| `min_gas` | `"100000000000000"` (100 Tgas) |
| `attached_deposit` | Leave it out (0) |

It goes into the `intents` array of the signed payload exactly like a `transfer`. See [Transfer messages](./messages.md#the-surrounding-intent) and [Signing intents](../signing-intents.mdx).

## Overview

| Action | Oracle | Pays out | Events |
|---|---|---|---|
| [`borrow`](#borrow) | No (checked at fill) | No | `order_placed` |
| [`cancel`](#cancel) | No | Remaining escrow, one payout per token | `order_cancelled`, then `netted` if it applies |
| [`sell_note`](#sell_note) | No | No | `order_placed` |
| [`withdraw_collateral`](#withdraw_collateral) | Yes, if the loan has debt | One token | `collateral_withdrawn` |
| [`redeem`](#redeem) | No | USDC | `redeemed` |
| [`withdraw`](#withdraw) | No | One token | `withdrawn` |

The examples use maturity `"1795766400000000000"` (2026-11-27 08:00 UTC).

## `borrow`

Places a `borrow` ask **without escrow**, against the collateral the signer's loan in `maturity` already holds. Use it to borrow more on an existing loan.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | Maturity of the signer's loan |
| `max_rate_bps` | `u32` number | yes | Highest APR accepted, in bps |
| `principal` | `U128` string | yes | USDC to receive. Greater than zero |
| `expires_at` | `U64` string or `null` | no | Time (ns) after which the order no longer fills |

```json
{"action":"borrow","data":{"maturity":"1795766400000000000","max_rate_bps":800,"principal":"250000000","expires_at":"1795000000000000000"}}
```

**Preconditions:** the signer's loan in `maturity` holds collateral (so an order that could never fill isn't placed), `maturity` is listed and in the future, `expires_at` (if set) is in the future.

**Effect:** creates an order like a transfer `borrow` whose `collateral` is `{}`. Nothing is checked against prices now. At fill time the loan as it stands then, with the new debt added, must pass the max LTV check. If the borrower withdrew collateral meanwhile, the fill is skipped (`cannot_open`).

**Events:** `order_placed` with `kind: "borrow"` and `collateral: {}`.

**Rejected with:** `No collateral in loan`, `Principal must be positive`, `Unknown maturity`, `Maturity has passed`, `Expiry has passed`.

## `cancel`

Removes one of the signer's open orders and returns what it holds.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `order_id` | `U64` string | yes | The order to cancel |

```json
{"action":"cancel","data":{"order_id":"42"}}
```

**Precondition:** the signer owns the order. Cancelling is allowed at any time, also after the order expired or the maturity passed, so escrow is never stuck.

**Effect by order kind:**

| Kind | What happens |
|---|---|
| `lend` | The remaining USDC is paid to the signer's Intents balance |
| `borrow` (transfer) | The remaining escrow is paid back, one `mt_transfer` per token |
| `borrow` (against the loan) | Nothing to return. The order is just removed |
| `sell_note` | The locked shares are unlocked into the signer's free shares, then netted against the signer's own debt in that maturity, if any |

Netting after a `sell_note` cancel matters: unlocking is the only way free shares grow outside a fill, and without it notes and debt in the same maturity could stay apart past maturity, when no fill can net them any more.

**Events:** `order_cancelled` with `refunded` (`{token_id: amount}`, `{}` for `sell_note`) and `unlocked_shares` (`sell_note` only), then `netted` if netting applied.

**Rejected with:** `Order not found`, `Not the order owner`.

## `sell_note`

Offers notes for sale before maturity. The seller names a note **value**, and the buyer's bid pays principal at the fill rate. This is how a lender exits early.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | Maturity of the notes |
| `value` | `U128` string | yes | Note value to sell, in USDC units. Greater than zero, and at most the value of the signer's free shares |
| `max_rate_bps` | `u32` number | yes | Highest APR the seller accepts, in bps. A higher rate means a lower price |
| `expires_at` | `U64` string or `null` | no | Time (ns) after which the order no longer fills |

```json
{"action":"sell_note","data":{"maturity":"1795766400000000000","value":"1050000000","max_rate_bps":650,"expires_at":"1795000000000000000"}}
```

**Effect:** `shares_for(value)` shares, rounded **up**, move from the signer's free shares to locked shares, and a `sell_note` ask is created whose `remaining` is that number of shares. Locked shares can't be netted or redeemed until the order fills or is cancelled.

When a fill hits the ask, the bid's principal is converted to note value at the fill rate (rounded down) and then to shares (rounded down), which move to the buyer. So some exact share counts can't be reached by any principal, and up to about one unit of value may stay locked after the last fill. Cancelling the order unlocks it. See [Matching](./matching.md#lend--sell_note-notes-change-hands).

**Events:** `order_placed` with `kind: "sell_note"` and `size` = the locked shares.

**Rejected with:** `Value must be positive`, `Value exceeds free notes`, `Unknown maturity`, `Maturity has passed`, `Expiry has passed`.

## `withdraw_collateral`

Takes one collateral token out of the signer's loan, back to the signer's Intents balance.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | Maturity of the signer's loan |
| `collateral_token` | string | yes | Asset ID of the token to withdraw |
| `amount` | `U128` string | yes | Amount to withdraw. Greater than zero, at most what the loan holds of that token |

```json
{"action":"withdraw_collateral","data":{"maturity":"1795766400000000000","collateral_token":"nep141:arb.omft.near","amount":"250000000000000000"}}
```

**Without debt** (the loan was repaid or netted to zero): the token is paid out immediately. No price is needed, and it works at any time, also after maturity.

**With debt:**

1. Rejected at once if `block_time ≥ maturity + grace` (the debt is overdue and belongs to the liquidator).
2. Otherwise the contract calls the oracle, and the callback `on_withdraw_collateral_prices` re-reads the loan.
3. The withdrawal goes through only if what is left still passes the max LTV check at conservative prices (`Σ collateral × (price − conf) × max_ltv ≥ debt × (price + conf)`), and it is still before `maturity + grace`. Frozen tokens give no borrowing power, so they don't count here. If the debt was repaid while the oracle call was in flight, no price is needed.

One token per call. To empty a loan with several tokens, send one `withdraw_collateral` per token (they can share one signed payload).

**Events:** `collateral_withdrawn` with the token and amount.

**Rejected with:** `Amount must be positive`, `No loan`, `Amount exceeds collateral`, `Debt is overdue`, `No price`, `Withdrawal exceeds max LTV`.

## `redeem`

Pays out matured notes from the maturity's redemption pool.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | A maturity that has passed |
| `value` | `U128` string or `null` | no | Note value to redeem. `null` = all free shares |

```json
{"action":"redeem","data":{"maturity":"1795766400000000000","value":null}}
```

```json
{"action":"redeem","data":{"maturity":"1795766400000000000","value":"500000000"}}
```

**Preconditions:** `block_time ≥ maturity`. The requested value is greater than zero and at most the value of the signer's free shares. Shares locked in a `sell_note` order must be unlocked first by cancelling it.

**Effect:**

- `paid = min(value, redemption_pool)`. If the pool holds less than asked, only that much is paid, and the rest stays as shares until repayments or liquidations refill the pool. Redeem again later.
- The shares burned for `paid` round **up** (against the redeemer). When `paid` equals the whole value of the signer's free shares, all of them are burned, so no dust entry is left.
- `paid` USDC goes to the signer's Intents balance.

**Events:** `redeemed` with `value` (paid) and `shares` (burned).

**Rejected with:** `Not matured`, `Unknown maturity`, `Nothing to redeem`, `Value exceeds free notes`, `Redemption pool is empty`.

## `withdraw`

Withdraws the signer's internal free balance of one token. The free balance only holds payouts that failed (`payout_failed` events). `get_free_balances` shows it.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `token_id` | string | yes | Asset ID |
| `amount` | `U128` string or `null` | no | Amount. `null` = all |

```json
{"action":"withdraw","data":{"token_id":"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","amount":null}}
```

```json
{"action":"withdraw","data":{"token_id":"nep141:arb.omft.near","amount":"1"}}
```

**Effect:** the balance is reduced (and deleted when it reaches zero), and the amount is paid to the signer's Intents balance. If that payout fails again, it returns to the free balance.

This `withdraw` only moves tokens from Setllend to the user's Intents balance. Moving tokens out of NEAR Intents to another chain or a NEAR account is a separate step, covered in [Withdraw](../../guides/withdraw.md).

**Events:** `withdrawn`, and `payout_failed` if the payout fails again.

**Rejected with:** `Nothing to withdraw`, `Amount exceeds free balance`.
