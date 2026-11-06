---
title: Transfer messages
description: The five actions that arrive with tokens through a transfer intent and mt_on_transfer - lend, borrow, add_collateral, repay, and liquidate.
---

Actions that bring tokens into Setllend arrive as a NEAR Intents `transfer` intent to `setllend.near` with a `msg`. `intents.near` moves the tokens from the signer's Intents balance to Setllend's, then calls:

```rust
pub fn mt_on_transfer(
    &mut self,
    sender_id: AccountId,              // the signer of the transfer intent: the owner of the funds
    previous_owner_ids: Vec<AccountId>, // ignored
    token_ids: Vec<String>,            // Intents asset IDs
    amounts: Vec<U128>,
    msg: String,                       // {"action": ..., "data": {...}} as a string
) -> PromiseOrValue<Vec<U128>>         // the refund per token
```

The return value is one refund amount per token, in the order of `token_ids`. A fully accepted transfer returns `"0"` for each token, and `intents.near` refunds whatever the return value says to the sender's Intents balance.

## Rules for every transfer action

- **The caller must be `intents.near`.** Anything else panics with `Caller must be the intents contract`.
- **The owner is `sender_id`,** the account that signed the `transfer` intent. `previous_owner_ids` is not used.
- **Tokens.** `lend`, `repay`, and `liquidate` take exactly one token, the debt token (USDC). `borrow` and `add_collateral` take one or more tokens, each a listed collateral token that is not frozen, each listed once. Every amount must be greater than zero.
- **Invalid input panics, and a panic refunds everything.** The panic reverts all of Setllend's state changes in that call, and `intents.near` then refunds the full amount of every token. Nothing is ever kept from a transfer that failed. See [Errors](./errors.md#refunds-from-mt_on_transfer).
- **Placing an order** (`lend`, `borrow`) also requires that `maturity` is in the contract's list and still in the future, and that `expires_at`, when set, is in the future. There are no size limits, deposit caps, order-count limits, or rate limits.
- **`min_gas`.** `intents.near` guarantees the call only the intent's `min_gas`: 30 Tgas by default. That is enough for `lend`, `borrow`, `add_collateral`, and `repay`, which settle inside `mt_on_transfer`. `liquidate` makes an oracle call and pays out collateral, so set `min_gas` to `"100000000000000"` (100 Tgas). See [Gas](./gas.md).

The examples below use maturity `"1795766400000000000"` (2026-11-27 08:00 UTC). The debt token is native USDC, `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`.

## The surrounding intent

The `transfer` intent sits inside the payload the user signs. This is the full payload of a `lend` of 1,000 USDC, as an EVM wallet signs it with `personal_sign` (ERC-191). A NEAR wallet signs the same intents with NEP-413. Building the nonce and signing are covered in [Signing intents](../signing-intents.mdx).

```json
{
  "signer_id": "0x1111111111111111111111111111111111111111",
  "verifying_contract": "intents.near",
  "deadline": "2026-11-10T00:00:00.000Z",
  "nonce": "<base64 of the 32-byte versioned nonce>",
  "intents": [
    {
      "intent": "transfer",
      "receiver_id": "setllend.near",
      "tokens": {"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "1000000000"},
      "msg": "{\"action\":\"lend\",\"data\":{\"maturity\":\"1795766400000000000\",\"min_rate_bps\":700,\"expires_at\":null}}"
    }
  ]
}
```

| Field of the `transfer` intent | Value |
|---|---|
| `intent` | `"transfer"` |
| `receiver_id` | `"setllend.near"` |
| `tokens` | `{asset ID: amount}`. One entry for `lend`, `repay`, `liquidate`; one or more for `borrow`, `add_collateral` |
| `msg` | The Setllend message, a JSON object serialized into a string |
| `min_gas` | Optional decimal string of gas units. Default 30 Tgas, minimum 5 Tgas. Set `"100000000000000"` for `liquidate` |

## `lend`

Places a bid: lends USDC at a fixed APR of at least `min_rate_bps` until `maturity`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | Maturity of the book |
| `min_rate_bps` | `u32` number | yes | Lowest APR the lender accepts, in bps |
| `expires_at` | `U64` string or `null` | no | Time (ns) after which the order no longer fills. `null` = good until cancelled |

**Tokens:** exactly one, the debt token. The amount is the principal to lend.

```json
{"action":"lend","data":{"maturity":"1795766400000000000","min_rate_bps":700,"expires_at":null}}
```

With an expiry:

```json
{"action":"lend","data":{"maturity":"1795766400000000000","min_rate_bps":700,"expires_at":"1795000000000000000"}}
```

**Effect:** the whole amount is escrowed in a new `lend` order with `remaining` = the amount. Nothing is refunded (returns `["0"]`). When the order fills, the lender receives note shares worth the face of the filled principal at the fill rate. The order can be cancelled at any time for the unfilled USDC.

**Events:** `order_placed` with `kind: "lend"` and `size` = the amount.

**Rejected with:** `Expected exactly one token`, `Wrong token`, `Unknown maturity`, `Maturity has passed`, `Expiry has passed`, `Invalid msg`.

## `borrow`

Places an ask that issues new notes: borrows `principal` USDC at a fixed APR of at most `max_rate_bps`, against the collateral sent with it.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | Maturity of the book and of the loan |
| `max_rate_bps` | `u32` number | yes | Highest APR the borrower accepts, in bps |
| `principal` | `U128` string | yes | USDC to receive, in the smallest unit. Must be greater than zero |
| `expires_at` | `U64` string or `null` | no | As for `lend` |

**Tokens:** one or more listed, non-frozen collateral tokens, each once. The amounts are the collateral to escrow.

```json
{"action":"borrow","data":{"maturity":"1795766400000000000","max_rate_bps":800,"principal":"1000000000","expires_at":null}}
```

A `borrow` of 1,000 USDC with two collateral tokens in one intent:

```json
{
  "intent": "transfer",
  "receiver_id": "setllend.near",
  "tokens": {
    "nep141:arb.omft.near": "500000000000000000",
    "nep141:wrap.near": "200000000000000000000000000"
  },
  "msg": "{\"action\":\"borrow\",\"data\":{\"maturity\":\"1795766400000000000\",\"max_rate_bps\":800,\"principal\":\"1000000000\",\"expires_at\":null}}"
}
```

**Effect:** the collateral is escrowed in a new `borrow` order, with `remaining` = `principal`. There is **no price check at placement**: the oracle is consulted at fill time, when the loan as a whole must pass the max LTV check. Nothing is refunded (returns `"0"` per token).

When a fill takes part of the order, each escrowed token moves into the borrower's loan pro rata to what is left:

```
moved_i = escrow_left_i × filled_principal / remaining_principal     (rounded down per token)
```

The fill that completes the order moves all remaining escrow, so no dust stays behind. The borrower has one loan per maturity: every `borrow` fill in that maturity adds to the same loan. See [Matching](./matching.md#lend--borrow-new-notes-and-debt).

**Events:** `order_placed` with `kind: "borrow"`, `size` = `principal`, and `collateral` = the escrow per token.

**Rejected with:** `No tokens`, `Wrong token` (not a listed collateral token), `Collateral token is frozen`, `Duplicate token`, `Principal must be positive`, `Unknown maturity`, `Maturity has passed`, `Expiry has passed`, `Invalid msg`.

To borrow more against collateral a loan already holds, without sending tokens, use the auth call [`borrow`](./auth-call.md#borrow).

## `add_collateral`

Adds collateral to an existing loan with debt, raising its health factor.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | Maturity of the sender's loan |

**Tokens:** one or more listed, non-frozen collateral tokens, each once.

```json
{"action":"add_collateral","data":{"maturity":"1795766400000000000"}}
```

**Effect:** the tokens are added to the sender's loan in `maturity` at once. No price is needed, since adding collateral can only raise health. Nothing is refunded.

**Preconditions:**

- The loan must have debt (`debt_face > 0`). Otherwise the tokens would just sit in a loan with nothing to secure.
- The block time must be before `maturity + grace` (grace is 1 hour). After that the debt is liquidatable whatever its health, so a top-up would only go to the liquidator.

Tokens in the user's Intents balance are not collateral until they are escrowed with `borrow` or added with `add_collateral`.

**Events:** `collateral_added` with the tokens and amounts.

**Rejected with:** `No debt`, `Debt is overdue`, `No tokens`, `Wrong token`, `Collateral token is frozen`, `Duplicate token`, `Invalid msg`.

## `repay`

Repays USDC against a loan's debt face. Anyone may repay for anyone.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `maturity` | `U64` string | yes | Maturity of the loan |
| `borrower` | account ID or `null` | no | The loan to repay. Defaults to `sender_id` |

**Tokens:** exactly one, the debt token. The amount is the USDC to apply.

```json
{"action":"repay","data":{"maturity":"1795766400000000000","borrower":null}}
```

Repaying someone else's loan:

```json
{"action":"repay","data":{"maturity":"1795766400000000000","borrower":"0x2222222222222222222222222222222222222222"}}
```

**Effect:**

- `applied = min(amount, debt_face)` is subtracted from the debt face and added to the maturity's redemption pool, which pays note holders after maturity.
- The overpayment `amount − applied` is refunded through the return value, straight back to the payer's Intents balance.
- Collateral stays in the loan until the borrower withdraws it with [`withdraw_collateral`](./auth-call.md#withdraw_collateral). A loan with no debt and no collateral is deleted.
- Allowed before and after maturity, as long as debt remains, including after `maturity + grace` until the loan is liquidated.
- Repaying before maturity pays the full face. The cheaper early exit is buying notes back with a `lend` order: notes and debt in the same maturity net automatically. See [Exit early](../../guides/exit-early.md).

**Events:** `repaid` with `borrower`, `payer`, the applied `amount`, and `debt_remaining`.

**Rejected with:** `No debt` (no loan, or the loan has no debt), `Expected exactly one token`, `Wrong token`, `Invalid msg`.

## `liquidate`

Repays part or all of an unhealthy or overdue loan and receives collateral plus a bonus. This is how Setllend's keeper settles loans, and anyone may do it.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `borrower` | account ID | yes | Owner of the loan |
| `maturity` | `U64` string | yes | Maturity of the loan |

**Tokens:** exactly one, the debt token. The amount is the most USDC the liquidator offers. Anything not used is refunded.

```json
{"action":"liquidate","data":{"borrower":"0x2222222222222222222222222222222222222222","maturity":"1795766400000000000"}}
```

The intent should set `min_gas`:

```json
{
  "intent": "transfer",
  "receiver_id": "setllend.near",
  "tokens": {"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "1000000000"},
  "msg": "{\"action\":\"liquidate\",\"data\":{\"borrower\":\"0x2222222222222222222222222222222222222222\",\"maturity\":\"1795766400000000000\"}}",
  "min_gas": "100000000000000"
}
```

**How it runs:**

1. Before any oracle call, the contract checks the token is the debt token and the loan exists with debt. Otherwise it panics at once (full refund, no oracle call).
2. It calls `aggregate-oracle.near` for every feed, then the private callback `on_liquidate_prices`, which re-reads the loan (a repayment or another liquidation may have landed in between).
3. The loan is liquidatable if `block_time ≥ maturity + grace` (overdue, whatever its health), or if its health factor is below 1 at conservative prices (collateral at `price − conf`, debt at `price + conf`, each token at its liquidation threshold). Frozen tokens count toward health.
4. The contract repays `min(amount, debt_face)` and seizes **the same fraction of every collateral token**, worth the repaid value plus each token's liquidation bonus, at mid prices. Each token's share rounds down. A token whose share rounds to 0 is skipped. If the fraction reaches 100%, all collateral is seized and the repayment is cut to what the collateral is worth (`repay_for(all)`). Formulas and a worked example are in [Math](./math.md#liquidation-seizure).
5. The repaid USDC goes to the maturity's redemption pool. Each seized token is paid to the liquidator's Intents balance with its own `mt_transfer` (a failed payout lands in the liquidator's free balance).
6. If every collateral token reaches zero while debt remains, the rest is written off as bad debt and shared by that maturity's note holders. See [Bad debt](../../concepts/bad-debt.md).
7. The callback returns `[amount − repaid]`, which `intents.near` refunds to the liquidator.

The close factor is 100%: one liquidation may repay the whole loan.

**The callback panics, and the liquidator is refunded in full,** when the loan has no debt any more, is neither unhealthy nor overdue, lacks a usable price for any of its tokens (frozen ones included) or for USDC, or nothing at all would be seized.

**Events:** `liquidated` with `repaid` and `seized` per token, then `bad_debt_realized` when it applies.

**Rejected with:** `No loan`, `No debt`, `Loan is not liquidatable`, `No price`, `Nothing to seize`, `Expected exactly one token`, `Wrong token`, `Invalid msg`.

## Summary

| Action | Tokens | Escrowed | Refunded | Oracle | Events |
|---|---|---|---|---|---|
| `lend` | 1, USDC | All of it, in the order | Nothing | No | `order_placed` |
| `borrow` | 1 or more collateral | All of it, in the order | Nothing | At fill | `order_placed` |
| `add_collateral` | 1 or more collateral | Added to the loan | Nothing | No | `collateral_added` |
| `repay` | 1, USDC | Applied to debt | Overpayment | No | `repaid` |
| `liquidate` | 1, USDC | Applied to debt | Unused amount | Yes | `liquidated`, `bad_debt_realized` |

Any panic refunds all tokens of the transfer.
