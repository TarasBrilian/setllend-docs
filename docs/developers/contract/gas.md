---
title: Gas and storage
description: How much gas each setllend.near action needs, how min_gas and static gas work, the 300 Tgas limit, prepaid versus burnt gas, and who pays for storage.
---

Users who sign intents pay no NEAR gas for Setllend actions: whoever submits the intent to `intents.near` pays it. Setllend's relayer, matcher, and keeper submit from `backend.setllend.near`. This page is for anyone who submits transactions themselves or sizes `min_gas` on an intent.

One teragas (Tgas) is 10^12 gas units. On the wire, gas is a decimal string of gas units: `"100000000000000"` is 100 Tgas.

## The limits that matter

- **300 Tgas per transaction.** NEAR caps the prepaid gas of one function call at 300 Tgas. Everything that call spawns (the Setllend call, the oracle call, callbacks, payouts) shares it. Setllend's relayer attaches 300 Tgas to every `execute_intents` and `match_orders` transaction.
- **`min_gas` on the intent.** When `intents.near` calls Setllend, it gives the call the intent's `min_gas` as static gas, plus a share of whatever gas the receipt has left, split evenly across the promises it creates. Only `min_gas` is guaranteed.

| Intent | `min_gas` default | Setllend needs |
|---|---|---|
| `transfer` with `lend`, `borrow`, `add_collateral`, `repay` | 30 Tgas (minimum 5 Tgas) | The default. These settle inside `mt_on_transfer` with no further calls |
| `transfer` with `liquidate` | 30 Tgas | **100 Tgas**: an oracle round trip, then one payout per seized token |
| `auth_call` (every action) | 10 Tgas | **100 Tgas**: payouts reserve 15 Tgas each, and `withdraw_collateral` with debt about 30 Tgas more for the oracle round trip |

Setllend's relayer refuses an `auth_call` or a `liquidate` transfer with `min_gas` below 100 Tgas, and any other transfer that sets it below 30 Tgas.

:::warning
Too little gas fails the Setllend call before it changes anything, so funds are safe, but the action doesn't happen. With an `auth_call` the intent batch still succeeds, because the call is detached, so the failure is easy to miss. Always read the `on_auth` receipt's outcome.
:::

## Static gas reserved by the contract

Each promise the contract creates reserves static gas, set in the code. Unused gas is then shared among the promises that have an unused-gas weight.

| Promise | Static gas | Also gets unused gas |
|---|---|---|
| `intents.near::mt_transfer` (each payout) | 10 Tgas | yes |
| `on_payout` callback (each payout) | 5 Tgas | yes |
| `aggregate-oracle.near::list_prices_no_older_than` | 10 Tgas | no |
| `on_match_prices` callback | 10 Tgas | yes |
| `on_liquidate_prices` callback | 20 Tgas | yes |
| `on_withdraw_collateral_prices` callback | 20 Tgas | yes |

So **every payout reserves 15 Tgas**, and an oracle round trip about 30 Tgas (10 for the call, 20 for a loan callback, or 10 for the matching callback). Prepaid gas, not burnt gas, therefore sets how much fits into one call: static gas must be on hand when a promise is created, even though most of it is never burnt.

Payouts per action:

| Action | Payouts |
|---|---|
| `match_orders` | One per fill (USDC to the ask owner) |
| `cancel` | One per escrowed token: one for `lend`, one per collateral token for a transfer `borrow` (so up to 45 Tgas reserved with three tokens), none for `sell_note` or a borrow against the loan |
| `withdraw_collateral`, `redeem`, `withdraw` | One |
| `liquidate` | One per seized token |
| `lend`, `borrow`, `add_collateral`, `repay`, `sell_note`, auth call `borrow` | None |

## Measured gas

The numbers below were measured in the sandbox, against mock `intents.near` and oracle contracts. The real contracts cost more, which is why the off-chain settings above keep wide headroom.

### `match_orders`

| Batch | Burnt in the call | Burnt in total | Prepaid gas needed |
|---|---|---|---|
| 1 `sell_note` fill | 3.6 Tgas | 7.7 Tgas | |
| 10 `sell_note` fills | 13.0 Tgas | 48.4 Tgas (with payouts) | about 165 Tgas |
| 1 `borrow` fill | 2.6 Tgas | 14.2 Tgas (with oracle and payout) | |
| 10 `borrow` fills | 2.7 Tgas | 62.2 Tgas (with oracle and payouts) | about 170 Tgas |
| 1 `borrow` fill escrowing two tokens | | 13.8 Tgas | |

A `sell_note` fill costs about 1.0 Tgas in the call (1.2 Tgas when the buyer also nets) and about 4.5 Tgas in total with its payout. For a `borrow` batch the call itself only schedules the oracle call, and the work happens in `on_match_prices`. Extra collateral tokens add little.

Setllend's matcher sends at most 10 fills per `match_orders` with 300 Tgas attached. After a failed call it halves the batch (10, 5, 2, 1) and goes back to 10 after a batch that goes through.

### `liquidate`

| Loan | Burnt in total | `min_gas` used |
|---|---|---|
| One collateral token | about 16.4 Tgas | 100 Tgas |
| Two collateral tokens | about 20.8 Tgas | 100 Tgas |

The total includes `mt_on_transfer`, the oracle call, `on_liquidate_prices`, and the payouts. A loan with three tokens pays out three times.

## Prepaid gas versus gas burnt

NEAR checks that the signer can pay for the **whole prepaid gas** before a transaction runs, priced at the protocol's minimum gas price of 10^9 yoctoNEAR per gas unit, which is **0.001 NEAR per Tgas**. The gas actually burnt is charged at the block's gas price, and the rest is refunded after execution.

| Transaction | Must be on hand | Charged |
|---|---|---|
| 300 Tgas prepaid, 12 Tgas burnt, gas price 10^8 yoctoNEAR | 0.3 NEAR plus any deposit | 0.0012 NEAR |
| 100 Tgas prepaid, 16.4 Tgas burnt, gas price 10^8 yoctoNEAR | 0.1 NEAR plus any deposit | about 0.0016 NEAR |

A transaction from an account that holds less than the prepaid gas plus attached deposits is refused with `NotEnoughBalance`, even though it would burn far less. Fund submitting accounts for what they attach, not for what they burn. The gas price changes with network load.

This matters to users only for transactions they sign with a NEAR wallet themselves, such as a deposit of NEAR or the one-time registration of their key on `intents.near`. Signed intents cost the user no gas.

## Storage

Users never attach NEAR to Setllend. The contract pays the storage of every order, loan, note balance, and free balance from its own NEAR balance:

- An order is deleted when it is fully filled or cancelled.
- A loan, and its index entry, is deleted when it holds no collateral and no debt.
- A note entry is deleted when both its free and locked shares are zero.
- A token disappears from a loan's or an order's token map once its amount reaches zero.
- A free balance entry is deleted when it is withdrawn in full.

Deletion frees the storage again. There is no per-account storage limit. The contract's free NEAR (its balance minus `storage_usage` × the byte cost of 10^19 yoctoNEAR) has to stay positive: if it runs out, any call that writes new entries fails, including the `on_payout` callback that records a failed payout. The operator monitors the free NEAR and tops it up.

`auth_call` intents keep `attached_deposit` at 0: Setllend needs no deposit, and `on_auth` rejects one.
