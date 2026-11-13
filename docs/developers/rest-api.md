---
title: REST API
description: Every public endpoint of the Setllend backend, with request parameters, real response examples, and error codes.
---

The Setllend backend serves a small JSON API over HTTPS. It is what the app at https://www.setllend.xyz uses: market data read from the contract, account views, the relayer that submits signed intents, and a wrapper around 1Click for deposits and withdrawals to other chains. Everything it returns can also be read from the chain directly; the API saves you the view calls and the bookkeeping.

**Base URL:** `https://setllend-production.up.railway.app`

Live updates (books, trades, account events) come over the [WebSocket API](./websocket-api.md) on the same host.

## Conventions

- **Amounts** are decimal strings in the token's smallest unit, exactly as on chain (`"1000000"` is 1 USDC). Decimals per token are in [Asset IDs](./asset-ids.md).
- **Timestamps and maturities** from the chain are decimal strings of **nanoseconds** since the Unix epoch (`"1795766400000000000"` is 2026-11-27 08:00 UTC). Times the backend itself records (`created_at`, `updated_at` of 1Click and withdrawal rows) are numbers of **milliseconds**.
- **Rates** are numbers in basis points (`700` = 7.00% APR).
- **Account IDs** must be valid NEAR account IDs: an EVM address in **lowercase** (`0x1234…abcd`), or a NEAR account (`alice.near`). A checksummed address answers `400 {"error": "account must be a valid lowercase NEAR account ID"}`.
- **Every answer with a body is JSON**, errors included. An error is `{"error": "<message>"}` with a 4xx or 5xx status; only `POST /api/intents` answers its own [relay body](#post-apiintents). Each endpoint lists its own errors under it, and every endpoint can also give the [common errors](#common-errors) below. An endpoint without an Errors table gives only those.
- **Paths are exact.** A trailing slash makes another path: `/api/maturities/` answers 404.

### Common errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "limit must be a positive integer"}` and similar | A malformed parameter. The message names it; each endpoint's messages are listed under it |
| 404 | `{"error": "Unknown endpoint: GET /api/markets. See https://docs.setllend.xyz/developers/rest-api"}` | No endpoint has this path. The message repeats the method and path you sent |
| 404 | `{"error": "Unknown maturity"}`, `{"error": "Unknown 1Click quote"}` | The path is right, but the maturity or quote doesn't exist |
| 405 | `{"error": "Use POST for /api/oneclick/quote"}`, with the header `Allow: POST` | The path exists, but not for this method. `Allow` and the message name the method to use |
| 429 | `{"error": "Too many requests; try again in a minute"}` | A flood guard (see [Rate limits](#rate-limits)) |
| 502 | `{"error": "Upstream error"}` | The backend's NEAR RPC call failed. Retry |
| 503 | `{"error": "Loading"}` or `{"error": "The Setllend contract is not deployed yet"}` | The backend is starting and hasn't read the contract yet. Endpoints that read the contract answer this until `/health` shows `contract: "ready"` |

### CORS

Every response carries `Access-Control-Allow-Origin: *`, with methods `GET` and `POST` and the header `Content-Type`. Preflight `OPTIONS` requests answer 204. The API uses no cookies or logins, so you can call it from any web page.

### Rate limits

Only the endpoints that spend something are limited, per client IP and per sliding minute:

| Endpoint | Limit |
|---|---|
| `POST /api/intents` | 30 requests (the relayer pays gas for each one it sends) |
| `POST /api/oneclick/quote` with `"dry": true` | 60 requests (form previews) |
| `POST /api/oneclick/quote` (stored), `POST /api/oneclick/:id/submit`, `POST /api/oneclick/:id/deposit-tx` | 30 requests together |

The read endpoints have no limit of their own. The limits protect the operator's gas and 1Click quota, not the protocol: anyone can call `execute_intents` on `intents.near` directly.

## Health

### `GET /`

A short index, so the base URL opened in a browser shows where to go.

```json
{ "name": "Setllend API", "docs": "https://docs.setllend.xyz/developers/rest-api", "health": "/health" }
```

### `GET /health`

The backend's status. Always answers, even before the contract is loaded.

```json
{
  "ok": true,
  "contract": "ready",
  "height": 223281864,
  "follower": { "cursor": 223287934, "final": 223287934, "lag": 0, "catchingUp": false, "error": null },
  "relayer": { "intents": true, "matcher": true },
  "matcher": {
    "in_flight": null,
    "last_batch": { "tx_hash": "5aein…ffCb", "fills": 1, "skipped": 0, "height": 223281563, "error": null },
    "fill_limit": 10,
    "paused": false
  },
  "keeper": {
    "signing": true,
    "in_flight": null,
    "capital": "1599791",
    "last_scan": { "height": 223287924, "loans": 1, "eligible": 0, "unpriced": 0, "top": [], "error": null },
    "last_liquidation": null,
    "storage": { "free": "4015141558140648399999998", "alert": false }
  },
  "oneclick": { "enabled": true, "open": 1 }
}
```

| Field | Meaning |
|---|---|
| `ok` | `false` when the event follower has stopped with an error |
| `contract` | `checking`, `not_deployed`, `loading`, or `ready`. Until `ready`, contract-backed endpoints answer 503 and `POST /api/intents` answers `not_ready`. The salt, 1Click endpoints, and the withdrawal list work earlier |
| `height` | Block height the order books were last read at |
| `follower` | The event follower's cursor, the latest final height, the `lag` between them in blocks, whether it is catching up, and its stop `error` |
| `relayer` | Whether the relayer's `execute_intents` key (`intents`) and the matcher's `match_orders` key (`matcher`) are configured. Without one, that half is read-only |
| `matcher` | The `match_orders` batch in flight, the last finished batch (fills, skips, the height its books were reloaded at, `error`), the current fill limit per batch, and whether matching is paused after a failed one-fill batch |
| `keeper` | Whether it can sign, the liquidation in flight, its USDC on `intents.near` (`capital`), the last scan of loans (`eligible` loans and the first ten in `top`, each with `reason` `overdue` or `unhealthy`, `health`, planned `repay`, and `skip`), the last liquidation, and the contract's free NEAR for storage with an `alert` flag |
| `oneclick` | Whether 1Click is configured, and how many quotes are still being polled |

## Market data

### `GET /api/config`

The contract's fixed configuration (`get_config`).

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

`grace` is the grace period after maturity in nanoseconds (1 hour). `oracle_max_age` is in seconds, `oracle_max_conf` the largest accepted `conf / price` in bps.

### `GET /api/stats`

Protocol totals in USDC: `total_supplied` (note value outstanding plus open `lend` orders) and `active_loans` (total debt face). Recomputed when books and loans reload, not per request.

```json
{ "total_supplied": "1000279", "active_loans": "500280" }
```

### `GET /api/maturities`

Every listed maturity with its totals. `open` is `true` while the maturity is in the future.

```json
[
  { "maturity": "1794124800000000000", "open": true, "total_supplied": "1000279", "active_loans": "500280" },
  { "maturity": "1794556800000000000", "open": true, "total_supplied": "0", "active_loans": "0" },
  { "maturity": "1795766400000000000", "open": true, "total_supplied": "0", "active_loans": "0" },
  { "maturity": "1798185600000000000", "open": true, "total_supplied": "0", "active_loans": "0" }
]
```

### `GET /api/collateral-tokens`

The accepted collateral tokens with their risk parameters (`get_collateral_tokens`). Ratios are bps. A `frozen` token can't be used for new borrows or top-ups.

```json
[
  {
    "token_id": "nep141:arb.omft.near",
    "decimals": 18,
    "feed_id": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "max_ltv": 7000,
    "liq_threshold": 8000,
    "liq_bonus": 500,
    "frozen": false
  },
  {
    "token_id": "nep141:base.omft.near",
    "decimals": 18,
    "feed_id": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "max_ltv": 7000,
    "liq_threshold": 8000,
    "liq_bonus": 500,
    "frozen": false
  },
  {
    "token_id": "nep141:wrap.near",
    "decimals": 24,
    "feed_id": "c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750",
    "max_ltv": 7000,
    "liq_threshold": 8000,
    "liq_bonus": 500,
    "frozen": false
  }
]
```

### `GET /api/book/:maturity`

The order book of one maturity, aggregated into rate levels, best first. **Bids** are `lend` orders, lowest rate first (the lender willing to accept the least is best for a borrower). **Asks** are `borrow` and `sell_note` orders, highest rate first. Within a level, orders are in `order_id` order, which is also fill priority.

`size` is the level's USDC principal. A `sell_note` ask holds note shares; its principal is its `remaining_value` discounted at its own rate to now (for display only).

```json
{
  "maturity": "1795766400000000000",
  "bids": [
    {
      "rate_bps": 700,
      "size": "100000000",
      "orders": [
        {
          "order_id": "7",
          "owner": "0x1234567890abcdef1234567890abcdef12345678",
          "kind": "lend",
          "maturity": "1795766400000000000",
          "rate_bps": 700,
          "remaining": "100000000",
          "remaining_value": null,
          "collateral": null,
          "created_at": "1794300000000000000",
          "expires_at": null
        }
      ]
    }
  ],
  "asks": []
}
```

Each order is the contract's order view: `remaining` is principal for `lend` and `borrow` and shares for `sell_note`; `collateral` is the escrow left by token for a `borrow` (`{}` for a borrow against an existing loan) and `null` otherwise. Field details: [Views](./contract/views.md).

#### Errors

| Status | Body | When |
|---|---|---|
| 404 | `{"error": "Unknown maturity"}` | `:maturity` is not one of the listed maturities (see [`GET /api/maturities`](#get-apimaturities)), including a value that isn't a number |

### `GET /api/trades/:maturity`

Fills (`order_filled` events) of one maturity, newest first, each with its block time as `timestamp` (ns).

| Query | Default | Meaning |
|---|---|---|
| `since` | none | Only fills at or after this time (ns) |
| `limit` | 100 | Page size, at most 1,000 |

```json
[
  {
    "bid": "0",
    "ask": "1",
    "ask_kind": "borrow",
    "maturity": "1794124800000000000",
    "rate_bps": 500,
    "principal": "1000000",
    "face": "1000279",
    "bid_remaining": "500000",
    "ask_remaining": "0",
    "timestamp": "1793948214598256640"
  }
]
```

`principal` is the USDC the lender paid, `face` the note value bought at the fill rate (for a `borrow` fill, the new debt is `face` or one unit more, since debt rounds up).

#### Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "maturity must be a u64 decimal string"}` | `:maturity` is not a whole number without leading zeros. A well-formed maturity that isn't listed answers `[]`, not an error |
| 400 | `{"error": "since must be nanoseconds"}` | `since` is not a whole number of nanoseconds since the Unix epoch (a date string, for example) |
| 400 | `{"error": "limit must be a positive integer"}` | `limit` is not a whole number of at least 1. Above 1,000 is not an error: the page is cut to 1,000 |

### `GET /api/prices`

Oracle prices as the contract would accept them now, by asset ID: the debt token and every collateral token with a usable price. `price`, `conf`, and `expo` are the raw oracle values (`price × 10^expo` USD), so you can reproduce the contract's conservative valuation (`price − conf` for collateral, `price + conf` for debt). `usd` is the mid price and `age_s` the age of the oracle update in seconds. A token whose feed is stale or too uncertain is left out. The backend reads the oracle at most once every 5 seconds.

```json
{
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": {
    "price": "99978337", "conf": "138663", "expo": -8, "usd": 0.99978337, "age_s": 28
  },
  "nep141:arb.omft.near": {
    "price": "222597774497", "conf": "286058836", "expo": -8, "usd": 2225.97774497, "age_s": 16
  },
  "nep141:base.omft.near": {
    "price": "222597774497", "conf": "286058836", "expo": -8, "usd": 2225.97774497, "age_s": 16
  },
  "nep141:wrap.near": {
    "price": "368953914", "conf": "264419", "expo": -8, "usd": 3.68953914, "age_s": 16
  }
}
```

## Accounts

### `GET /api/accounts/:account`

Everything the contract holds for one account, plus its Intents balances.

```json
{
  "account": "alice.near",
  "orders": [],
  "loans": [
    {
      "maturity": "1794124800000000000",
      "collateral": {
        "nep141:arb.omft.near": "500000000000000",
        "nep141:wrap.near": "300000000000000000000000"
      },
      "debt_face": "500280",
      "health_factor": 3.545731446
    }
  ],
  "notes": {},
  "free_balances": {},
  "deposits": {
    "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "500000"
  },
  "fill_totals": [
    { "maturity": "1794124800000000000", "side": "borrow", "principal": "1000000", "face": "1000279", "avg_rate_bps": 500 }
  ]
}
```

| Field | Meaning |
|---|---|
| `orders` | Open orders, in the same shape as the book's orders |
| `loans` | One loan per maturity: collateral by token and `debt_face` (USDC owed at maturity). `health_factor` uses each token's liquidation threshold and conservative prices, the keeper's own test: below 1 the loan can be liquidated. Overdue loans (past maturity plus the grace period) can be liquidated at any health. `null` when the loan has no debt or no usable price |
| `notes` | By maturity: `free_shares`, `locked_shares` (in `sell_note` orders), and their current `free_value` and `locked_value` in USDC |
| `free_balances` | Tokens the contract holds for the account after a failed payout. Recover them with the `withdraw` action |
| `deposits` | The account's Intents balance per token on `intents.near` (non-zero only). This is the money available to sign intents with |
| `fill_totals` | Per maturity and side, the account's filled principal, face, and principal-weighted rate. `lend` counts fills of its `lend` orders, `borrow` fills of its `borrow` orders. `sell_note` sales are left out, since they close a lend position |

The concepts behind these fields are in [Collateral and health](../concepts/collateral-and-health.mdx) and [Zero-coupon notes](../concepts/zero-coupon-notes.md).

#### Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "account must be a valid lowercase NEAR account ID"}` | `:account` is not a NEAR account ID, or an EVM address with capital letters (use the lowercase address) |

### `GET /api/accounts/:account/history`

Every contract event that names the account, newest first: orders placed and cancelled, fills of its orders, repayments, collateral moves, liquidations, redemptions, withdrawals from the free balance. Each event carries `seq`, `block_height`, `timestamp` (ns), and `tx_hash`.

| Query | Default | Meaning |
|---|---|---|
| `before` | none | The `next` value of the previous page |
| `limit` | 100 | Page size, at most 1,000 |

```json
{
  "events": [
    {
      "event": "repaid",
      "data": {
        "borrower": "alice.near",
        "payer": "alice.near",
        "maturity": "1794124800000000000",
        "amount": "500000",
        "debt_remaining": "500280"
      },
      "seq": 23,
      "block_height": 223281861,
      "timestamp": "1793948397463898624",
      "tx_hash": "ExzKB…NfcG"
    },
    {
      "event": "order_filled",
      "data": {
        "bid": "0", "ask": "1", "ask_kind": "borrow", "maturity": "1794124800000000000",
        "rate_bps": 500, "principal": "1000000", "face": "1000279", "bid_remaining": "500000", "ask_remaining": "0"
      },
      "seq": 11,
      "block_height": 223281560,
      "timestamp": "1793948214598256640",
      "tx_hash": "5aein…ffCb",
      "account_orders": [{ "order_id": "1", "kind": "borrow" }]
    },
    {
      "event": "order_placed",
      "data": {
        "order_id": "1", "owner": "alice.near", "kind": "borrow", "maturity": "1794124800000000000",
        "rate_bps": 600, "size": "1000000",
        "collateral": { "nep141:arb.omft.near": "500000000000000", "nep141:wrap.near": "300000000000000000000000" },
        "expires_at": null
      },
      "seq": 8,
      "block_height": 223281551,
      "timestamp": "1793948209128348672",
      "tx_hash": "AdTxF…Rya6"
    }
  ],
  "next": null
}
```

A fill names only order IDs, so an `order_filled` row also carries `account_orders`: this account's orders in the fill, with their kind. An `order_cancelled` row carries `order`: `{kind, maturity, rate_bps}` of the cancelled order, or `null` if its placement isn't known to the backend. `next` is `"<block_height>:<seq>"` of the last row when the page is full, `null` on the last page. Every event's `data` is documented in [Events](./contract/events.md).

#### Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "account must be a valid lowercase NEAR account ID"}` | `:account` is not a NEAR account ID, or an EVM address with capital letters (use the lowercase address) |
| 400 | ``{"error": "before must be the `next` value of a previous page"}`` | `before` is not a `next` value this endpoint returned |
| 400 | `{"error": "limit must be a positive integer"}` | `limit` is not a whole number of at least 1. Above 1,000 is not an error: the page is cut to 1,000 |

1Click transfers and withdrawals to a NEAR account are not contract events; they have their own lists below.

### `GET /api/accounts/:account/withdrawals`

The account's withdrawals to its own NEAR account that went through the relayer (`ft_withdraw` and `native_withdraw` intents), newest first. Same `before` and `limit` parameters; `next` is a row number.

```json
{
  "items": [
    {
      "tx_hash": "<NEAR transaction hash>",
      "token": "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
      "amount": "5000000",
      "status": "ok",
      "error": null,
      "created_at": 1794300000000,
      "updated_at": 1794300004000
    }
  ],
  "next": null
}
```

`token` is the asset ID; a NEAR withdrawal shows as `nep141:wrap.near`, though it arrives as native NEAR. `status` is `ok`, `failed`, `error`, `sent`, or `pending`; `error` is `null` or `{code, reason}`. `sent` and `pending` mean the outcome isn't known to the backend (it follows a transaction for 10 minutes at most): check the NEAR account and the Intents balance. A withdrawal submitted to `intents.near` some other way is not listed.

#### Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "account must be a valid lowercase NEAR account ID"}` | `:account` is not a NEAR account ID, or an EVM address with capital letters (use the lowercase address) |
| 400 | ``{"error": "before must be the `next` value of a previous page"}`` | `before` is not a `next` value this endpoint returned |
| 400 | `{"error": "limit must be a positive integer"}` | `limit` is not a whole number of at least 1. Above 1,000 is not an error: the page is cut to 1,000 |

### `GET /api/accounts/:account/oneclick`

The account's started 1Click quotes, newest first: those where 1Click has seen the deposit (status left `PENDING_DEPOSIT`) or has accepted the account's signature. A quote that was created but never used is not listed, because anyone can create a quote for any account. Same `before` and `limit` parameters. Rows are described under [1Click rows](#1click-rows).

```json
{ "items": [ { "id": "0x6a75…35ee", "direction": "deposit", "status": "SUCCESS", "...": "..." } ], "next": null }
```

#### Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "account must be a valid lowercase NEAR account ID"}` | `:account` is not a NEAR account ID, or an EVM address with capital letters (use the lowercase address) |
| 400 | ``{"error": "before must be the `next` value of a previous page"}`` | `before` is not a `next` value this endpoint returned |
| 400 | `{"error": "limit must be a positive integer"}` | `limit` is not a whole number of at least 1. Above 1,000 is not an error: the page is cut to 1,000 |

## Signed intents (relayer)

### `GET /api/intents/salt`

The current salt of `intents.near` for building a versioned nonce, cached for 60 seconds. See [Signing intents](./signing-intents.mdx#the-nonce).

```json
{ "salt": "252812b3" }
```

### `POST /api/intents`

Submits one signed payload through the relayer, which pays the gas. The body is the signed object of either standard, wrapped in `signed`:

```json
{ "signed": { "standard": "erc191", "payload": "<the signed JSON string>", "signature": "secp256k1:<base58>" } }
```

```json
{
  "signed": {
    "standard": "nep413",
    "payload": { "message": "<JSON string>", "nonce": "<base64, 32 bytes>", "recipient": "intents.near" },
    "public_key": "ed25519:<base58>",
    "signature": "ed25519:<base58>"
  }
}
```

How to build and sign it is on [Signing intents](./signing-intents.mdx). The relayer:

1. Checks the payload without spending gas: well-formed, `intents.near` as verifying contract, a future deadline, a lowercase `signer_id`, and either only Setllend intents (`transfer` to `setllend.near` with a valid `msg` and the right tokens, or `auth_call` to `setllend.near` with a valid `msg` and no deposit) or exactly one withdrawal to the signer's own NEAR account. Unknown fields are refused.
2. Checks `min_gas`: at least 100 Tgas on every `auth_call` and `liquidate` transfer; other transfers may leave it out but not set it below 30 Tgas.
3. For a withdrawal, checks the receiver: storage on the USDC contract for `ft_withdraw`, existence of a named account for `native_withdraw`.
4. Runs `simulate_intents` at the latest block.
5. Sends `execute_intents` with 300 Tgas, one payload per transaction, and reads every receipt.

Every answer has the same body:

```json
{
  "tx_hash": "<NEAR transaction hash or null>",
  "ok": true,
  "actions": ["lend"],
  "events": [{ "event": "order_placed", "data": { "order_id": "7", "...": "..." } }],
  "error": null
}
```

| Field | Meaning |
|---|---|
| `tx_hash` | The NEAR transaction, once one was signed |
| `ok` | `true` only when the action is known to have happened |
| `actions` | The `msg` action of each intent in order, or `ft_withdraw` / `native_withdraw` for a withdrawal |
| `events` | Setllend events of the contract's successful receipts (`order_placed` gives the new `order_id`). Empty for a withdrawal |
| `error` | `null` or `{code, reason}` |

#### Error codes

| `error.code` | HTTP | Meaning and what to do |
|---|---|---|
| `invalid_payload` | 400 | The payload can't be parsed: bad JSON, a missing or malformed field, an unknown `standard`, a passed deadline, a zero or malformed withdrawal amount. Fix and sign again |
| `not_setllend` | 400 | A well-formed intent the relayer won't relay: another receiver, another intent kind, an invalid `msg`, an unknown field, wrong or frozen tokens, an `attached_deposit`, a withdrawal that isn't alone or isn't to the signer, an EVM account withdrawing to NEAR |
| `min_gas_too_low` | 400 | An `auth_call` or `liquidate` without 100 Tgas of `min_gas`, or a transfer below 30 Tgas |
| `storage_missing` | 400 | `ft_withdraw` to an account without storage on the USDC contract. Call `storage_deposit` on the USDC contract first (0.00125 NEAR) |
| `receiver_missing` | 400 | `native_withdraw` to a named account that doesn't exist |
| `simulation_failed` | 400 | `simulate_intents` refused it; `reason` is the verifier's message, for example `insufficient balance or overflow`, `invalid signature`, or a used nonce. No gas spent |
| `rate_limited` | 429 | More than 30 requests in a minute from your IP |
| `submit_failed` | 502 | The simulation or a withdrawal check couldn't run (an RPC error), or the transaction couldn't be sent. `tx_hash` is set if it was signed: check it before signing again |
| `not_ready` | 503 | The backend hasn't loaded the contract yet, or runs without a relayer key |
| `rejected` | 200, `ok: false` | Executed, and the action failed; `reason` is the contract's message (for example `Order not found`, `Not the order owner`, `Withdrawal exceeds max LTV`). Tokens sent with a `transfer` were refunded in full |
| `payout_failed` | 200, `ok: true` | The action happened, but a payout to the Intents balance failed; the tokens are in the account's free balance and the `withdraw` action recovers them |
| `pending` | 202 | Sent, but not every receipt finished within 30 seconds. The relayer keeps following it for up to 10 minutes and pushes the final body to WebSocket topic `account:<signer_id>` as `type: "intent"` ([WebSocket API](./websocket-api.md#intent)) |

Example of a payload that failed simulation (a `lend` from an account with no USDC):

```json
{
  "tx_hash": null,
  "ok": false,
  "actions": ["lend"],
  "events": [],
  "error": { "code": "simulation_failed", "reason": "insufficient balance or overflow" }
}
```

The contract's error messages are listed in [Errors](./contract/errors.md).

## 1Click deposits and withdrawals

These endpoints wrap 1Click, the NEAR Intents swap and bridge service, for moving funds between a wallet on Arbitrum or Base and the account's Intents balance. A withdrawal to the user's own NEAR account is not a 1Click route: it is a signed intent through `POST /api/intents`.

### Routes

The request names the asset that leaves (`asset`), the other chain (`chain`), and, for a swap, what arrives (`to`). Any other combination answers 400.

| `direction` | `asset` | `chain` | `to` | Moves | Default `slippage_bps` |
|---|---|---|---|---|---|
| `deposit` | `USDC` | `arbitrum`, `base` | none | That chain's USDC → native NEAR USDC | 50 |
| `deposit` | `ETH` | `arbitrum`, `base` | none | That chain's ETH → the same ETH token in Intents | 50 |
| `deposit` | `USDC`, `ETH` | `arbitrum`, `base` | `NEAR` | That chain's asset → wNEAR (`nep141:wrap.near`) | 100 |
| `withdraw` | `USDC` | `arbitrum`, `base` | none | Native NEAR USDC → that chain's USDC | 50 |
| `withdraw` | `ETH` | `arbitrum`, `base` | none | ETH in Intents → the same chain (ETH from Arbitrum only to Arbitrum, from Base only to Base) | 50 |
| `withdraw` | `NEAR` | `arbitrum`, `base` | `USDC` (required) | wNEAR → that chain's USDC | 100 |

`address` is the refund address of a deposit, or the recipient of a withdrawal, on `chain`: a `0x` address (checksummed or not). An EVM account may leave it out to use its own address; a NEAR account must give one.

### `POST /api/oneclick/quote`

| Field | Required | Meaning |
|---|---|---|
| `account` | yes | The Intents account (lowercase) |
| `direction` | yes | `deposit` or `withdraw` |
| `asset`, `chain`, `to` | `asset`, `chain` | A route from the table above |
| `amount` | yes | Base units, a positive decimal string: of `asset` for `EXACT_INPUT`, of what arrives for `EXACT_OUTPUT` |
| `address` | see above | Refund address (deposit) or recipient (withdrawal) on `chain` |
| `swap_type` | no | `EXACT_INPUT` (default) or `EXACT_OUTPUT`. Withdrawals are always `EXACT_INPUT` |
| `slippage_bps` | no | Integer from 0 to 10,000; defaults per route |
| `dry` | no | `true` for a preview: nothing is stored |

A dry quote answers only the amounts:

```bash
curl -s -X POST https://setllend-production.up.railway.app/api/oneclick/quote \
  -H 'content-type: application/json' \
  -d '{"account":"alice.near","direction":"deposit","asset":"USDC","chain":"base","amount":"5000000","address":"0x1234567890abcdef1234567890abcdef12345678","dry":true}'
```

```json
{ "quote": { "amount_in": "5000000", "min_amount_in": "5000000", "amount_out": "4999450", "min_amount_out": "4974452", "time_estimate": 35 } }
```

Without `dry`, the quote is stored and returned as a [row](#1click-rows) with status `PENDING_DEPOSIT`.

- **Deposit:** send `amount_in` of the asset to `deposit_address` on `chain` from your wallet. 1Click credits the account's Intents balance. With `EXACT_OUTPUT`, `amount_in` includes the slippage buffer and 1Click refunds any excess to the refund address.
- **Withdrawal:** the row's `intent` holds the payload to sign, `{standard, payload}`, built by 1Click and checked by the backend: exactly one `transfer` of the quoted amount to the deposit address, signed by the account, for `intents.near`. Sign it as-is (`erc191` for an EVM account with `personal_sign`, `nep413` for a NEAR account with `signMessage`, the same way as in [Signing intents](./signing-intents.mdx)), then call `submit`.

#### Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "body must be a JSON object"}` | The body is missing, isn't valid JSON, or is an array or a string |
| 400 | `{"error": "account must be a valid lowercase NEAR account ID"}` | `account` is missing, not a NEAR account ID, or an EVM address with capital letters |
| 400 | `{"error": "direction must be deposit or withdraw"}` | `direction` is missing or another value |
| 400 | `{"error": "no 1Click route: deposit DOGE from base"}` | `asset`, `chain`, and `to` don't form a route in the [table above](#routes). The message repeats what you asked: `withdraw NEAR to base` without `to` is refused, `withdraw NEAR to base as USDC` is a route. Names are case-sensitive (`USDC`, `base`) |
| 400 | `{"error": "amount must be a decimal string in base units"}` | `amount` is missing, a JSON number instead of a string, has a decimal point, a sign, or a leading zero, or is larger than a u128 |
| 400 | `{"error": "amount must be positive"}` | `amount` is `"0"` |
| 400 | `{"error": "swap_type must be EXACT_INPUT or EXACT_OUTPUT"}` | `swap_type` is another value |
| 400 | `{"error": "a withdrawal is always EXACT_INPUT"}` | `swap_type` is `EXACT_OUTPUT` on a `withdraw` |
| 400 | `{"error": "slippage_bps must be an integer from 0 to 10000"}` | `slippage_bps` is a string, a fraction, negative, or above 10,000 |
| 400 | `{"error": "dry must be a boolean"}` | `dry` is a string such as `"true"` instead of `true` |
| 400 | `{"error": "address must be a string"}` | `address` is present but not a string |
| 400 | `{"error": "a NEAR account needs a 0x address on base"}` | A NEAR `account` without `address`: only an EVM account defaults to its own address. The message names the chain |
| 400 | `{"error": "address must be a 0x address on base"}` | `address` is not `0x` followed by 40 hex characters |
| 400 | `{"error": "1Click: <its message>"}` | 1Click refused the quote, for example an amount too small to bridge. Nothing is stored |
| 429 | `{"error": "Too many requests; try again in a minute"}` | More than 60 dry quotes, or 30 stored quotes, submits, and deposit hashes together, in a minute from your IP |
| 502 | `{"error": "1Click returned an unexpected answer"}` | 1Click answered something the backend won't pass on: also `1Click returned a quote without a deposit address`, `1Click quoted another amount than asked`, `1Click returned an unexpected payload` (a withdrawal payload that isn't exactly the quoted transfer), or `1Click refused the request`. Nothing is stored; try again later |
| 503 | `{"error": "1Click is temporarily unavailable"}` | 1Click is down, limiting the backend, or timed out. Orders, cancels, and repayments don't depend on it |
| 503 | `{"error": "1Click is not configured"}` | The backend runs without a 1Click key; `/health` shows `oneclick.enabled: false` |

The fields are checked in the order of the 400 rows above, and only the first problem found is answered. The flood guard (429) comes before them. A dry quote is checked the same way.

### `POST /api/oneclick/:id/submit`

Submits a withdrawal's stored payload with the user's signature. `:id` is the row's `id` (its deposit address).

| Standard | Body |
|---|---|
| `erc191` | `{"signature": "0x…"}` (the wallet's 65-byte signature; `v` is normalized for you) or `{"signature": "secp256k1:…"}` |
| `nep413` | `{"signature": "ed25519:…", "public_key": "ed25519:…"}` |

Answers the updated row, with `intent_hash` set. A NEAR account must have registered its key on `intents.near` first, as for any NEP-413 intent.

#### Errors

| Status | Body | When |
|---|---|---|
| 404 | `{"error": "Unknown 1Click quote"}` | `:id` is not a stored quote. Use the `id` exactly as the quote returned it, with its capital letters |
| 400 | `{"error": "only a withdrawal is signed"}` | `:id` is a deposit |
| 409 | `{"error": "this withdrawal was already submitted"}` | A second submit of the same withdrawal, or one while the first is still being sent |
| 400 | `{"error": "the payload's deadline has passed; get a new quote"}` | The signed payload expired. Ask for a new quote and sign its payload |
| 400 | `{"error": "body must be {signature, public_key?}"}` | The body is not JSON, or `signature` is missing or not a string |
| 400 | `{"error": "signature must be the wallet's 0x signature (65 bytes) or secp256k1:<base58>"}` | An `erc191` row with a signature in another format |
| 400 | `{"error": "signature must be ed25519:<base58>"}` | A `nep413` row with a signature in another format |
| 400 | `{"error": "public_key must be ed25519:<base58>"}` | A `nep413` row without `public_key`, or with one in another format |
| 400 | `{"error": "1Click: <its message>"}` | 1Click refused the signed payload, for example a wrong signature, a key not registered on `intents.near`, or a balance too low. The row stays unsubmitted, so you can sign again |
| 429, 502, 503 | As for a quote | See the [quote's errors](#post-apioneclickquote) |


### `POST /api/oneclick/:id/deposit-tx`

Tells 1Click the hash of the deposit transaction, `{"tx_hash": "0x…"}` (64 hex characters, `0x` optional), so it sees the deposit sooner. Optional: 1Click finds the deposit anyway. Answers the row.

#### Errors

| Status | Body | When |
|---|---|---|
| 404 | `{"error": "Unknown 1Click quote"}` | `:id` is not a stored quote |
| 400 | `{"error": "only a deposit has a deposit transaction"}` | `:id` is a withdrawal |
| 400 | `{"error": "tx_hash must be a transaction hash"}` | The body is not JSON, or `tx_hash` is missing or not 64 hex characters |
| 400, 429, 502, 503 | As for a quote | `1Click: <its message>` when 1Click refuses the hash; the rest as in the [quote's errors](#post-apioneclickquote) |


### `GET /api/oneclick/:id`

The stored row. The backend polls 1Click for every open row (every 5 seconds while a swap runs, every 15 seconds in a quote's first hour, every 10 minutes after that) and stops at a final status, so this endpoint only reads the database. Changes are also pushed over the WebSocket as `type: "oneclick"`.

#### Errors

| Status | Body | When |
|---|---|---|
| 404 | `{"error": "Unknown 1Click quote"}` | `:id` is not a stored quote. A dry quote is never stored, so it has no row |
| 405 | `{"error": "Use POST for /api/oneclick/quote"}` | `GET /api/oneclick/quote`: quotes are asked for with `POST` |


### 1Click rows

```json
{
  "id": "0x6a75…35ee",
  "account": "alice.near",
  "direction": "deposit",
  "asset_in": "nep141:arb.omft.near",
  "asset_out": "nep141:arb.omft.near",
  "chain": "arbitrum",
  "swap_type": "EXACT_INPUT",
  "slippage_bps": 50,
  "amount_in": "500000000000000",
  "min_amount_in": "500000000000000",
  "amount_out": "500000000000000",
  "min_amount_out": "497500000000000",
  "address": "0x1234…abcd",
  "deposit_address": "0x6a75…35ee",
  "deadline": "2026-11-09T07:53:27.451Z",
  "time_estimate": 25,
  "status": "SUCCESS",
  "intent": null,
  "intent_hash": null,
  "deposit_tx": null,
  "details": {
    "amount_in": "500000000000000",
    "amount_out": "500000000000000",
    "refunded_amount": "28800000000000",
    "refund_reason": null,
    "origin_tx_hashes": ["0xd044…0b95"],
    "destination_tx_hashes": [],
    "near_tx_hashes": ["C8vto…kjxpR"]
  },
  "created_at": 1793948007451,
  "updated_at": 1793948055190
}
```

| Field | Meaning |
|---|---|
| `id`, `deposit_address` | The same value: 1Click's unique deposit address for this quote. On an EVM chain it may be checksummed; use it exactly as returned |
| `asset_in`, `asset_out` | Asset IDs of what leaves and what arrives |
| `amount_in`, `min_amount_in` | What to send, and the least 1Click accepts |
| `amount_out`, `min_amount_out` | The estimate, and the least that arrives |
| `deadline` | 1Click's deadline (ISO 8601) |
| `time_estimate` | 1Click's estimate in seconds |
| `status` | `PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, `PROCESSING`, `INCOMPLETE_DEPOSIT`, `SUCCESS`, `REFUNDED`, or `FAILED`. The last three are final |
| `intent` | A withdrawal's payload to sign, `{standard, payload}`; `null` for a deposit |
| `intent_hash` | Set once 1Click accepted a withdrawal's signature |
| `deposit_tx` | The hash given to `deposit-tx`, if any |
| `details` | 1Click's swap details once it reports any, else `null` |

### 1Click errors

| Status | Body | When |
|---|---|---|
| 400 | `{"error": "no 1Click route: deposit DOGE from base"}` and the other field messages | The request doesn't match a route or a field is malformed. Every message is listed under [`POST /api/oneclick/quote`](#post-apioneclickquote) |
| 400 | `{"error": "1Click: <its message>"}` | 1Click refused the quote, for example an amount too small |
| 404 | `{"error": "Unknown 1Click quote"}` | Unknown `:id` |
| 409 | `{"error": "this withdrawal was already submitted"}` | A second submit |
| 429 | `{"error": "Too many requests; try again in a minute"}` | Flood guard |
| 502 | `{"error": "1Click returned an unexpected payload"}` and similar | 1Click answered something the backend won't pass on; nothing is stored |
| 503 | `{"error": "1Click is temporarily unavailable"}` | 1Click is down, limiting, or timed out. Orders, cancels, and repayments don't depend on it |
