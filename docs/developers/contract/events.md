---
title: Events
description: The NEP-297 log format of setllend.near and every event it emits, with fields and when each is written.
---

The contract writes a log line for every state change, in the NEP-297 event format. Setllend's event follower reads them to know which books and loans to reload, and any indexer can do the same.

## Format

Each event is one log line: the prefix `EVENT_JSON:` followed by a JSON object.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"<name>","data":[{...}]}
```

| Field | Value |
|---|---|
| `standard` | `"setllend"` |
| `version` | `"0.1.0"` |
| `event` | The event name, below |
| `data` | An array holding exactly one object with the event's fields |

Encoding follows the rest of the contract: amounts, shares, timestamps, maturities, and order IDs are decimal strings; `rate_bps`, ratios, and `decimals` are numbers; token maps are `{asset ID: amount}` objects.

:::warning
Read events only from receipts whose outcome is a success. A receipt that panics can still list the logs it wrote before the panic, and none of its state changes happened. Treat events as a signal of what changed, not as a ledger: to rebuild a book or a loan, read the [views](./views.md) at the block height of the event. A view at block `H` already includes the receipts executed in block `H`.
:::

## Events

| Event | Fields | Emitted when |
|---|---|---|
| `maturity_added` | `maturity` | The owner adds a maturity |
| `order_placed` | `order_id`, `owner`, `kind`, `maturity`, `rate_bps`, `size`, `collateral`, `expires_at` | A `lend`, `borrow` (transfer or auth call), or `sell_note` order is placed |
| `order_cancelled` | `order_id`, `owner`, `refunded`, `unlocked_shares` | The owner cancels an order |
| `order_filled` | `bid`, `ask`, `ask_kind`, `maturity`, `rate_bps`, `principal`, `face`, `bid_remaining`, `ask_remaining` | A fill in `match_orders` settles |
| `fill_skipped` | `bid`, `ask`, `reason` | A fill in `match_orders` fails a check and is skipped |
| `netted` | `account`, `maturity`, `value`, `shares` | An account's free notes cancel against its own debt in a maturity |
| `repaid` | `borrower`, `payer`, `maturity`, `amount`, `debt_remaining` | A `repay` applies USDC to a loan |
| `liquidated` | `borrower`, `liquidator`, `maturity`, `repaid`, `seized` | A liquidation settles |
| `bad_debt_realized` | `borrower`, `maturity`, `amount`, `total_value_after` | A liquidation empties a loan's collateral while debt remains |
| `collateral_added` | `account`, `maturity`, `collateral` | `add_collateral` adds tokens to a loan |
| `collateral_withdrawn` | `account`, `maturity`, `collateral_token`, `amount` | `withdraw_collateral` takes a token out of a loan |
| `redeemed` | `account`, `maturity`, `value`, `shares` | `redeem` pays matured notes |
| `withdrawn` | `account`, `token_id`, `amount` | `withdraw` takes tokens out of the free balance |
| `payout_failed` | `account`, `token_id`, `amount` | A payout's `mt_transfer` failed, and the amount was credited to the free balance |
| `collateral_token_added` | `token_id`, `decimals`, `feed_id`, `max_ltv`, `liq_threshold`, `liq_bonus` | The owner adds a collateral token |
| `collateral_token_updated` | `token_id`, `max_ltv`, `liq_threshold`, `liq_bonus` | The owner changes a token's risk parameters |
| `collateral_token_frozen` | `token_id` | The owner freezes a token |
| `collateral_token_unfrozen` | `token_id` | The owner unfreezes a token |

## Order of events in one action

| Action | Events, in order |
|---|---|
| Fill | `order_filled`, then `netted` for the buyer and then the seller when it applies. `payout_failed` later if the payout fails |
| Cancel of a `sell_note` | `order_cancelled`, then `netted` if the owner had debt in that maturity |
| Cancel of a `lend` or `borrow` | `order_cancelled`, then `payout_failed` later per token whose payout fails |
| Liquidation | `liquidated`, then `bad_debt_realized` if it applies |
| `withdraw`, `redeem`, `withdraw_collateral` | Their event, then `payout_failed` later if the payout fails |

`payout_failed` always comes from the `on_payout` callback, a later receipt than the action itself.

## Fields and examples

Accounts in the examples are placeholders. `<USDC>` stands for the USDC asset ID `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`; the real logs carry the full ID.

### `maturity_added`

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"maturity_added","data":[{"maturity":"1795766400000000000"}]}
```

### `order_placed`

`size` is the principal for `lend` and `borrow`, or the locked shares for `sell_note`. `collateral` is the escrow of a `borrow` (`{}` for a borrow against the loan) and `null` for other kinds.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"order_placed","data":[{"order_id":"0","owner":"0x1111111111111111111111111111111111111111","kind":"lend","maturity":"1795766400000000000","rate_bps":700,"size":"1000000000","collateral":null,"expires_at":null}]}
```

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"order_placed","data":[{"order_id":"1","owner":"0x2222222222222222222222222222222222222222","kind":"borrow","maturity":"1795766400000000000","rate_bps":800,"size":"1000000000","collateral":{"nep141:arb.omft.near":"1000000000000000000","nep141:wrap.near":"100000000000000000000000000"},"expires_at":"1795000000000000000"}]}
```

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"order_placed","data":[{"order_id":"2","owner":"0x1111111111111111111111111111111111111111","kind":"sell_note","maturity":"1795766400000000000","rate_bps":650,"size":"999999","collateral":null,"expires_at":null}]}
```

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"order_placed","data":[{"order_id":"3","owner":"0x2222222222222222222222222222222222222222","kind":"borrow","maturity":"1795766400000000000","rate_bps":800,"size":"250000000","collateral":{},"expires_at":null}]}
```

### `order_cancelled`

`refunded` is the escrow paid back: USDC for `lend`, collateral for `borrow`, `{}` for `sell_note` and for a borrow against the loan. `unlocked_shares` is set for `sell_note` only.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"order_cancelled","data":[{"order_id":"0","owner":"0x1111111111111111111111111111111111111111","refunded":{"<USDC>":"1000000000"},"unlocked_shares":null}]}
```

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"order_cancelled","data":[{"order_id":"2","owner":"0x1111111111111111111111111111111111111111","refunded":{},"unlocked_shares":"999999"}]}
```

### `order_filled`

`rate_bps` is the fill rate (the maker's). `face` is the note value bought at that rate, rounded down, before conversion to shares. `ask_kind` is `"borrow"` or `"sell_note"`. `bid_remaining` is principal; `ask_remaining` is principal for `borrow` and shares for `sell_note`.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"order_filled","data":[{"bid":"0","ask":"1","ask_kind":"borrow","maturity":"1795766400000000000","rate_bps":700,"principal":"1000000000","face":"1004602739","bid_remaining":"0","ask_remaining":"0"}]}
```

### `fill_skipped`

`reason` is one of the skip reasons listed in [Matching](./matching.md#skip-reasons).

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"fill_skipped","data":[{"bid":"3","ask":"4","reason":"cannot_open"}]}
```

### `netted`

`value` left both the debt and the note pool, `shares` were burned.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"netted","data":[{"account":"0x2222222222222222222222222222222222222222","maturity":"1795766400000000000","value":"1000","shares":"999"}]}
```

### `repaid`

`amount` is what was applied (the overpayment, refunded, is not included). `payer` is the sender; it differs from `borrower` when someone repays for someone else.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"repaid","data":[{"borrower":"0x2222222222222222222222222222222222222222","payer":"0x2222222222222222222222222222222222222222","maturity":"1795766400000000000","amount":"4602740","debt_remaining":"1000000000"}]}
```

### `liquidated`

`repaid` is the debt face repaid. `seized` lists every token taken; tokens whose share rounded to 0 are left out. Here 21% of a loan of 1 ETH and 1,000 NEAR was seized for 1,000 USDC:

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"liquidated","data":[{"borrower":"0x2222222222222222222222222222222222222222","liquidator":"0x3333333333333333333333333333333333333333","maturity":"1795766400000000000","repaid":"1000000000","seized":{"nep141:arb.omft.near":"210000000000000000","nep141:wrap.near":"210000000000000000000000000"}}]}
```

### `bad_debt_realized`

`amount` is the debt written off, `total_value_after` the maturity's `V` after the write-off.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"bad_debt_realized","data":[{"borrower":"0x2222222222222222222222222222222222222222","maturity":"1795766400000000000","amount":"12345","total_value_after":"1004590394"}]}
```

### `collateral_added`

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"collateral_added","data":[{"account":"0x2222222222222222222222222222222222222222","maturity":"1795766400000000000","collateral":{"nep141:wrap.near":"50000000000000000000000000"}}]}
```

### `collateral_withdrawn`

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"collateral_withdrawn","data":[{"account":"0x2222222222222222222222222222222222222222","maturity":"1795766400000000000","collateral_token":"nep141:arb.omft.near","amount":"475000000000000000"}]}
```

### `redeemed`

`value` is the USDC paid, `shares` the shares burned.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"redeemed","data":[{"account":"0x1111111111111111111111111111111111111111","maturity":"1795766400000000000","value":"500000000","shares":"500000000"}]}
```

### `withdrawn` and `payout_failed`

Same shape.

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"withdrawn","data":[{"account":"0x3333333333333333333333333333333333333333","token_id":"nep141:arb.omft.near","amount":"1"}]}
```

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"payout_failed","data":[{"account":"0x3333333333333333333333333333333333333333","token_id":"<USDC>","amount":"2"}]}
```

### Collateral token events

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"collateral_token_added","data":[{"token_id":"nep141:wrap.near","decimals":24,"feed_id":"c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750","max_ltv":7000,"liq_threshold":8000,"liq_bonus":500}]}
```

An update (values for illustration only):

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"collateral_token_updated","data":[{"token_id":"nep141:wrap.near","max_ltv":6500,"liq_threshold":7500,"liq_bonus":750}]}
```

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"collateral_token_frozen","data":[{"token_id":"nep141:wrap.near"}]}
```

```
EVENT_JSON:{"standard":"setllend","version":"0.1.0","event":"collateral_token_unfrozen","data":[{"token_id":"nep141:wrap.near"}]}
```
