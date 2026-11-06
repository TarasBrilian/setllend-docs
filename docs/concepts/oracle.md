---
title: Oracle
description: Where Setllend gets its prices, how the contract validates them, and what keeps working when a price is stale.
---

Setllend reads USD prices from **`aggregate-oracle.near`**, a price contract on NEAR mainnet that also serves Rhea Lend, the main lending market on NEAR. The contract uses prices to decide whether a loan may borrow, whether it may be liquidated, and how much collateral a liquidation seizes. It never reads interest rates from outside: rates come only from Setllend's own [order book](./order-book.md).

## Why this oracle

`aggregate-oracle.near` was the only free price source on NEAR mainnet with fresh prices when Setllend was built. It publishes a new report about every 20 seconds. It has a Pyth-compatible interface and uses Pyth feed IDs; its reports aggregate several sources, including Pyth Pro. Other price contracts on NEAR were stale or returned no prices when checked.

## Feeds

| Feed | Used for | Feed ID |
|---|---|---|
| ETH/USD | ETH from Arbitrum and ETH from Base | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| NEAR/USD | NEAR (`wrap.near`) | `c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750` |
| USDC/USD | The debt, native NEAR USDC | `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |

USDC is priced too, not assumed to be worth exactly $1, so a USDC depeg is reflected in every check.

## What a price looks like

The contract calls `list_prices_no_older_than` with the feed IDs and a maximum age. Each feed comes back in the Pyth format, or `null` if it is older than the age asked for:

```json
{
  "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace": {
    "price": "222722138585",
    "conf": "253944748",
    "expo": -8,
    "publish_time": 1793951959
  }
}
```

The USD value is `price × 10^expo`: here ETH is $2,227.22. `conf` is the confidence interval in the same units, $2.54 or about 0.11% of the price. `publish_time` is in Unix seconds.

## How the contract uses prices

A NEAR contract can't read another contract synchronously. An action that needs prices makes one call to the oracle for the USDC feed and every collateral feed (frozen tokens included), with an age of 60 seconds, and finishes in a callback. The callback re-reads the state it depends on, because an order or a loan can change while the call is in flight.

Three actions need prices:

- `match_orders` with at least one `borrow` fill, to check max LTV;
- `liquidate`, to check health and compute the seizure;
- withdrawing collateral from a loan that still has debt, to check max LTV after the withdrawal.

### Validation

The oracle's own code isn't public, so the contract doesn't rely on the oracle's age filter alone. It accepts a price only if all of these hold:

| Check | Rule |
|---|---|
| Positive | `price > 0` |
| Tight | `conf / price ≤ 1%` (`oracle_max_conf` = 100 bps) |
| Fresh | `publish_time` within **60 seconds** of the block time, before or after (`oracle_max_age` = 60) |

Checking both directions, as Pyth does, means a reporter whose clock runs ahead can't keep a price looking fresh. The matcher and the keeper apply the same rules off chain, so they don't send transactions the contract would reject.

### Which price, for what

- **Borrowing limit and health factor** use conservative prices: collateral at `price − conf`, USDC at `price + conf`. See [Collateral and health](./collateral-and-health.mdx#conservative-prices).
- **Seizure** in a liquidation uses the mid `price`, without `conf`. See [Liquidation](./liquidation.mdx#how-much-is-seized).

## When a price is stale

If a price is missing, older than 60 seconds, or too uncertain, the actions that depend on it stop by themselves, and everything else keeps working. There is no admin pause.

| Stops until prices are fresh again | Keeps working |
|---|---|
| New borrowing: `borrow` fills are skipped with `no_price` | Note sales: `sell_note` fills need no price and still settle, even in the same batch |
| Liquidations, including overdue loans after maturity | Placing and cancelling orders |
| Withdrawing collateral from a loan that still has debt | Repaying, and adding collateral |
| | Redeeming notes after maturity |
| | Withdrawing collateral from a loan without debt |
| | Withdrawing a free balance |

Stopping new loans and liquidations is the safe failure: without a price nobody can tell whether a loan is safe, so nothing is decided on a guess. Borrowers can still make their loans safer, and lenders can still leave through the book.

## Risks

- **Operator.** `aggregate-oracle.near` is operated by Rhea, which can upgrade it. Its source code is not public.
- **Single reporter.** One reporter key submits the reports. The payloads are signed in the Pyth format, but without the source code it can't be confirmed that the contract verifies those signatures.
- **No moving average.** The oracle has no EMA price, so Setllend guards against bad prices with the confidence check and the 60-second age limit.
- **Liveness.** Liquidations, including the settlement of unpaid loans at maturity, wait while the oracle is stale. A long outage during a fast price move could turn a loan into [bad debt](./bad-debt.md).

More on the dependencies: [Risks](../how-it-works/risks.md).
