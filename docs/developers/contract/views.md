---
title: Views
description: Every read-only method of setllend.near with its arguments and example responses, including live output from mainnet.
---

Views are free, read-only calls. They make no cross-contract calls, so they return stored state only: a loan's health factor is not a view, it is computed off-chain from `get_loan`, `get_collateral_tokens`, and fresh oracle prices with the formula in [Math](./math.md#health-factor).

All amounts are decimal strings in the token's smallest unit, timestamps are nanoseconds as decimal strings, and rates and ratios are bps numbers. See [Units and encoding](./overview.md#units-and-encoding).

## Calling a view

With `curl` against a public RPC. `args_base64` is the base64 of the JSON arguments, and the result is an array of bytes holding the JSON response:

```bash
ARGS=$(printf '{"maturity":"1795766400000000000"}' | base64)
curl -s https://rpc.mainnet.near.org -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "query",
  "params": {
    "request_type": "call_function", "finality": "final",
    "account_id": "setllend.near", "method_name": "get_pool",
    "args_base64": "'"$ARGS"'"
  }
}' | python3 -c 'import sys, json; print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'
```

With NEAR CLI:

```bash
near contract call-function as-read-only setllend.near get_pool \
  json-args '{"maturity":"1795766400000000000"}' network-config mainnet now
```

The responses marked **live** below were read from mainnet. The others are example shapes with placeholder accounts like `0x1111…1111`.

## Summary

| Method | Arguments | Returns |
|---|---|---|
| [`get_config`](#get_config) | none | `Config` |
| [`get_maturities`](#get_maturities) | none | Every maturity, ascending |
| [`get_collateral_tokens`](#get_collateral_tokens) | none | Every collateral token, in the order added |
| [`get_pool`](#get_pool) | `maturity` | Note pool of one maturity, or `null` |
| [`get_order`](#get_order) | `order_id` | One order, or `null` |
| [`get_orders`](#get_orders) | `maturity`, `from_index?`, `limit?` | A page of one book |
| [`get_order_count`](#get_order_count) | `maturity` | Open orders in one book |
| [`get_orders_by_account`](#get_orders_by_account) | `account_id` | Open orders of one account |
| [`get_loan`](#get_loan) | `account_id`, `maturity` | One loan, or `null` |
| [`get_loans_by_account`](#get_loans_by_account) | `account_id` | All loans of one account |
| [`get_loans`](#get_loans) | `from_index?`, `limit?` | A page of all loans |
| [`get_loan_count`](#get_loan_count) | none | Number of loans |
| [`get_notes`](#get_notes) | `account_id` | Note balances of one account, per maturity |
| [`get_free_balances`](#get_free_balances) | `account_id` | Failed payouts waiting to be withdrawn |
| `contract_source_metadata` | none | Build and source information (NEP-330) |

## `get_config`

The parameters fixed at initialization.

**Live:**

```json
{
  "owner_id": "setllend.near",
  "intents_contract": "intents.near",
  "oracle_contract": "aggregate-oracle.near",
  "debt_token": "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "debt_feed_id": "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  "grace": "3600000000000",
  "oracle_max_age": 60,
  "oracle_max_conf": 100
}
```

| Field | Meaning |
|---|---|
| `owner_id` | Account allowed to call the [owner methods](./owner.md) |
| `intents_contract` | The only account allowed to call `mt_on_transfer` and `on_auth`, and the target of payouts |
| `oracle_contract` | Price source |
| `debt_token` | Asset ID of USDC, the only debt token |
| `debt_feed_id` | Oracle feed of USDC/USD |
| `grace` | Nanoseconds after maturity before unpaid debt becomes liquidatable: 1 hour |
| `oracle_max_age` | Seconds a price may be away from the block time |
| `oracle_max_conf` | Highest `conf / price` accepted, in bps: 1% |

## `get_maturities`

Every maturity ever added, past and future, ascending. Clients compare with the current time to tell which are open.

**Live:**

```json
["1794124800000000000","1794556800000000000","1795766400000000000","1798185600000000000"]
```

These are 2026-11-08, 2026-11-13, 2026-11-27, and 2026-12-25, each at 08:00 UTC.

## `get_collateral_tokens`

Every collateral token, frozen ones included, in the order added.

**Live:**

```json
[
  {"token_id":"nep141:arb.omft.near","decimals":18,"feed_id":"ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace","max_ltv":7000,"liq_threshold":8000,"liq_bonus":500,"frozen":false},
  {"token_id":"nep141:base.omft.near","decimals":18,"feed_id":"ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace","max_ltv":7000,"liq_threshold":8000,"liq_bonus":500,"frozen":false},
  {"token_id":"nep141:wrap.near","decimals":24,"feed_id":"c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750","max_ltv":7000,"liq_threshold":8000,"liq_bonus":500,"frozen":false}
]
```

Both ETH tokens share the ETH/USD feed. `max_ltv`, `liq_threshold`, and `liq_bonus` are bps: 70%, 80%, and 5%.

## `get_pool`

```json
{"maturity": "1795766400000000000"}
```

The note pool of one maturity, or `null` for an unknown maturity.

**Live** (no positions yet in that maturity):

```json
{"redemption_pool":"0","total_value":"0","total_shares":"0","bad_debt_total":"0"}
```

Example with positions:

```json
{"redemption_pool":"0","total_value":"1004602739","total_shares":"1004602739","bad_debt_total":"0"}
```

| Field | Meaning |
|---|---|
| `redemption_pool` | USDC repaid or recovered for this maturity, paid out by `redeem` |
| `total_value` | `V`: total note value owed to all note holders |
| `total_shares` | `S`: total note shares. One share is worth `V / S` |
| `bad_debt_total` | All bad debt ever realized in this maturity |

## `get_order`

```json
{"order_id": "0"}
```

One order, or `null` once it was filled or cancelled.

```json
{
  "order_id": "0",
  "owner": "0x1111111111111111111111111111111111111111",
  "kind": "lend",
  "maturity": "1795766400000000000",
  "rate_bps": 700,
  "remaining": "1000000000",
  "remaining_value": null,
  "collateral": null,
  "created_at": "1794000000000000000",
  "expires_at": null
}
```

| Field | Meaning |
|---|---|
| `order_id` | Sequential ID. Lower means older, which decides the fill rate |
| `owner` | Account that placed it |
| `kind` | `"lend"`, `"borrow"`, or `"sell_note"` |
| `maturity` | Book it rests in |
| `rate_bps` | `min_rate_bps` for `lend`, `max_rate_bps` for `borrow` and `sell_note` |
| `remaining` | Principal for `lend` and `borrow`, **shares** for `sell_note` |
| `remaining_value` | `sell_note` only: current value of the remaining shares. `null` otherwise |
| `collateral` | `borrow` only: escrow left per token, `{}` for a borrow against the loan. `null` otherwise |
| `created_at` | Block time of placement |
| `expires_at` | Expiry, or `null` |

A `borrow` order escrowing ETH and NEAR:

```json
{
  "order_id": "1",
  "owner": "0x2222222222222222222222222222222222222222",
  "kind": "borrow",
  "maturity": "1795766400000000000",
  "rate_bps": 800,
  "remaining": "1000000000",
  "remaining_value": null,
  "collateral": {"nep141:arb.omft.near": "1000000000000000000", "nep141:wrap.near": "100000000000000000000000000"},
  "created_at": "1794000000000000000",
  "expires_at": "1795000000000000000"
}
```

A `sell_note` order after bad debt brought `V / S` to about 0.9 (999,999 shares worth 899,999 units):

```json
{
  "order_id": "2",
  "owner": "0x1111111111111111111111111111111111111111",
  "kind": "sell_note",
  "maturity": "1795766400000000000",
  "rate_bps": 650,
  "remaining": "999999",
  "remaining_value": "899999",
  "collateral": null,
  "created_at": "1794000000000000000",
  "expires_at": null
}
```

A `borrow` against the loan's collateral has `"collateral": {}`.

## `get_orders`

```json
{"maturity": "1795766400000000000", "from_index": 0, "limit": 100}
```

A page of the open orders of one book: `limit` orders starting at position `from_index` of the book's index. Both are optional `u32` numbers: `from_index` defaults to 0, and without `limit` the rest of the book is returned. Returns an array of orders as in `get_order`, or `[]`.

Results are in **index order, not `order_id` order**: removing an order moves the last one into its slot. To load a whole book consistently, read `get_order_count` and every page at the same block height (use `"block_id"` instead of `"finality"` in the RPC query), then sort by `order_id` yourself.

## `get_order_count`

```json
{"maturity": "1795766400000000000"}
```

Number of open orders in one book, a `u32` number, e.g. `0`.

## `get_orders_by_account`

```json
{"account_id": "0x1111111111111111111111111111111111111111"}
```

Open orders of one account across all maturities, ascending by `order_id`. `[]` when there are none.

## `get_loan`

```json
{"account_id": "0x2222222222222222222222222222222222222222", "maturity": "1795766400000000000"}
```

```json
{
  "collateral": {"nep141:arb.omft.near": "1000000000000000000", "nep141:wrap.near": "100000000000000000000000000"},
  "debt_face": "1004602740"
}
```

`collateral` maps each token in the loan to its amount; tokens at zero are left out. `debt_face` is what is owed at maturity. `null` when there is no loan: a loan is deleted once it holds no collateral and no debt.

## `get_loans_by_account`

```json
{"account_id": "0x2222222222222222222222222222222222222222"}
```

All loans of one account, by maturity:

```json
[
  {
    "maturity": "1795766400000000000",
    "collateral": {"nep141:arb.omft.near": "1000000000000000000", "nep141:wrap.near": "100000000000000000000000000"},
    "debt_face": "1004602740"
  }
]
```

## `get_loans`

```json
{"from_index": 0, "limit": 100}
```

A page of every loan of every account, so a keeper can find all positions from state alone:

```json
[
  {
    "account_id": "0x2222222222222222222222222222222222222222",
    "maturity": "1795766400000000000",
    "collateral": {"nep141:arb.omft.near": "1000000000000000000", "nep141:wrap.near": "100000000000000000000000000"},
    "debt_face": "1004602740"
  }
]
```

Paged and ordered like `get_orders`: index order, and a deleted loan's slot takes the last one, so page at one block height.

## `get_loan_count`

No arguments. Number of loans, a `u32` number, for paging `get_loans`.

## `get_notes`

```json
{"account_id": "0x1111111111111111111111111111111111111111"}
```

Note balances per maturity, keyed by the maturity as a decimal string:

```json
{
  "1795766400000000000": {
    "free_shares": "1004602739",
    "locked_shares": "0",
    "free_value": "1004602739",
    "locked_value": "0"
  }
}
```

`free_*` can be netted, redeemed, or put up for sale. `locked_*` sits in open `sell_note` orders. Values are `shares × V / S`, rounded down. `{}` for an account without notes. UIs should show values, not shares.

## `get_free_balances`

```json
{"account_id": "0x3333333333333333333333333333333333333333"}
```

Tokens from failed payouts, waiting for an auth call [`withdraw`](./auth-call.md#withdraw). Only non-zero balances are listed:

```json
{"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "5"}
```

`{}` in the normal case.

## `contract_source_metadata`

The NEP-330 source metadata, which names the exact commit and build image of the deployed code. **Live** (abridged):

```json
{
  "version": "0.1.0",
  "link": "https://github.com/TarasBrilian/setllend/tree/49fcc47e0167b7a7b4958078a3fedb07354bbd90",
  "standards": [{"standard": "nep330", "version": "1.3.0"}],
  "build_info": {
    "build_environment": "sourcescan/cargo-near:0.22.0-rust-1.99.1@sha256:c9655eaf7436b90c87ea8b25739f91063032c5c30ba24cfeafe72c142943b5bb",
    "contract_path": "contracts/setllend",
    "source_code_snapshot": "git+https://github.com/TarasBrilian/setllend?rev=49fcc47e0167b7a7b4958078a3fedb07354bbd90"
  }
}
```

See [Verify the contract](../../verify/verify-contract.md).
