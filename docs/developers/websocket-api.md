---
title: WebSocket API
description: Live order books, trades, account events, relayer outcomes, and 1Click status changes pushed over one WebSocket.
---

The backend pushes changes over a WebSocket so a client doesn't have to poll the [REST API](./rest-api.md). You subscribe to **topics**; the server then sends a JSON message every time something on that topic changes. The messages use the same shapes as the REST responses.

**URL:** `wss://setllend-production.up.railway.app/ws`

## Subscribing

Send one JSON object with a `subscribe` list:

```json
{ "subscribe": ["book:1795766400000000000", "trades:1795766400000000000", "account:alice.near"] }
```

| Topic | Pushes |
|---|---|
| `book:<maturity>` | `book` messages: the full aggregated book of that maturity |
| `trades:<maturity>` | `trade` messages: each fill in that maturity |
| `account:<account_id>` | `event`, `intent`, and `oneclick` messages for that account |

`<maturity>` is the decimal nanosecond timestamp from `GET /api/maturities`; `<account_id>` is the lowercase Intents account (`0x1234…abcd` or `alice.near`).

Rules of the protocol:

- **No acknowledgement.** A valid subscribe message gets no reply; you simply start receiving pushes. Only an invalid one gets an [`error`](#error) reply.
- **No snapshot.** The server sends changes only. Load the current state over REST (`GET /api/book/:maturity`, `GET /api/accounts/:account`, and so on) when you subscribe, then apply pushes.
- **Subscriptions add up.** You can send several subscribe messages on one socket. There is no unsubscribe: to drop topics, close the socket and open a new one with the topics you still want.
- **At most 50 topics per socket.** A subscribe that would pass 50 is refused with an `error` message and adds nothing.
- A topic is only checked for its format, not for existence: subscribing to a maturity that isn't listed is accepted and never pushes anything.
- Account topics are public. Anyone can subscribe to any account, just as anyone can read its history over REST or on chain.

## When pushes happen

The backend's event follower reads each final NEAR block that contains Setllend events. After each such round it reloads the affected order books from contract views and then pushes:

1. a `book` message for every maturity whose book was reloaded,
2. a `trade` message for every `order_filled` event,
3. an `event` message to every account an event names (for a fill, the owners of both orders).

So a push arrives a few seconds after the block is final. `intent` messages come from the relayer and `oneclick` messages from the 1Click status poller, independently of blocks.

## Messages

Every message has a `type`.

### `book`

The full book of one maturity after a reload, the same as `GET /api/book/:maturity` plus `type`. Books are small, so the server sends them whole rather than as diffs: replace your copy.

```json
{
  "type": "book",
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

### `trade`

One fill: the `order_filled` event's data, plus the block time as `timestamp` (ns). The same shape as a row of `GET /api/trades/:maturity`.

```json
{
  "type": "trade",
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
```

### `event`

A contract event that names the account: orders placed and cancelled, fills of its orders, repayments, collateral moves, liquidations, redemptions, withdrawals. `event` holds the event name, its `data`, and the `block_height`, `timestamp` (ns), and `tx_hash` it came from. Every event's `data` is documented in [Events](./contract/events.md).

```json
{
  "type": "event",
  "account": "alice.near",
  "event": {
    "event": "repaid",
    "data": {
      "borrower": "alice.near",
      "payer": "alice.near",
      "maturity": "1794124800000000000",
      "amount": "500000",
      "debt_remaining": "500280"
    },
    "block_height": 223281861,
    "timestamp": "1793948397463898624",
    "tx_hash": "ExzKB…NfcG"
  }
}
```

Unlike the REST history, a pushed event has no `seq`, and an `order_filled` push has no `account_orders`: compare the fill's `bid` and `ask` with your own order IDs.

### `intent`

The final outcome of a payload that `POST /api/intents` answered with `202` and `error.code: "pending"` (not every receipt had finished within 30 seconds). It is the same body as the HTTP answer, plus `type` and `account`, and is pushed to `account:<signer_id>` once every receipt has executed. Match it to your request by `tx_hash`.

```json
{
  "type": "intent",
  "account": "0x1234567890abcdef1234567890abcdef12345678",
  "tx_hash": "<NEAR transaction hash>",
  "ok": true,
  "actions": ["cancel"],
  "events": [
    {
      "event": "order_cancelled",
      "data": {
        "order_id": "7",
        "owner": "0x1234567890abcdef1234567890abcdef12345678",
        "refunded": { "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "100000000" },
        "unlocked_shares": null
      }
    }
  ],
  "error": null
}
```

Only pending payloads are pushed; every other outcome is in the HTTP answer. The relayer follows a pending transaction for up to 10 minutes. If no `intent` message arrives by then, or your socket reconnected in between, treat the outcome as unknown: read the account's history and balances, or look the transaction up by `tx_hash`, before signing again. Subscribe to the account topic **before** you call `POST /api/intents`, so you can't miss the push.

### `oneclick`

A change of one of the account's 1Click quotes: its status, swap details, intent hash, or deposit hash. The message is the full row, as returned by `GET /api/oneclick/:id` ([1Click rows](./rest-api.md#1click-rows)), plus `type`.

```json
{
  "type": "oneclick",
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
  "status": "PROCESSING",
  "intent": null,
  "intent_hash": null,
  "deposit_tx": null,
  "details": null,
  "created_at": 1793948007451,
  "updated_at": 1793948040000
}
```

### `error`

The reply to a subscribe message the server can't accept. Nothing in that message is subscribed.

```json
{ "type": "error", "error": "invalid JSON" }
```

```json
{ "type": "error", "error": "expected {\"subscribe\": [\"book:<maturity>\", \"trades:<maturity>\", \"account:<account_id>\"]}" }
```

```json
{ "type": "error", "error": "at most 50 subscriptions" }
```

## Example client

```ts
const WS_URL = "wss://setllend-production.up.railway.app/ws";
const API = "https://setllend-production.up.railway.app";

function connect(topics: string[], onMessage: (message: any) => void) {
  let retryMs = 1_000;
  let opened = false;

  const open = () => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      retryMs = 1_000;
      ws.send(JSON.stringify({ subscribe: topics }));
      // Pushes sent while the socket was down are lost: reload state after every reconnect.
      if (opened) onMessage({ type: "reconnected" });
      opened = true;
    };
    ws.onmessage = (event) => onMessage(JSON.parse(String(event.data)));
    ws.onclose = () => {
      setTimeout(open, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };
  };
  open();
}

const maturity = "1795766400000000000";
let book = await (await fetch(`${API}/api/book/${maturity}`)).json();

connect([`book:${maturity}`, `trades:${maturity}`], async (message) => {
  if (message.type === "book") book = message;
  if (message.type === "trade") console.log(`filled ${message.principal} at ${message.rate_bps} bps`);
  if (message.type === "reconnected") book = await (await fetch(`${API}/api/book/${maturity}`)).json();
  if (message.type === "error") console.error(message.error);
});
```

## Reconnecting

The server may close a socket at any time (a deploy, a network change). A robust client:

- reconnects with a backoff, for example starting at 1 second and doubling up to 30 seconds, as the Setllend app does;
- sends its subscribe list again on every new socket, since subscriptions belong to the socket;
- reloads over REST whatever it shows after a reconnect, because pushes sent while it was disconnected are not replayed;
- treats a `pending` intent whose `intent` push may have been missed during a reconnect as unknown, and checks the account's history before acting again.
