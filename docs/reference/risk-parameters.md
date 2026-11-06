---
title: Risk parameters
description: Every parameter the Setllend contract runs with today, read from setllend.near on mainnet, with the reasons behind the values.
---

These are the values `setllend.near` runs with on NEAR mainnet. Setllend has only the parameters a lending mechanism needs, the same kind Aave and Morpho use. There are **no user-facing limits**: no minimum or maximum order size, no deposit caps, no limit on the number of orders, and no allowed rate range.

## Per-token parameters

Read with the `get_collateral_tokens` view.

| Token | Intents asset ID | Decimals | Oracle feed | Max LTV | Liquidation threshold | Liquidation bonus | Frozen |
|---|---|---|---|---|---|---|---|
| ETH (from Arbitrum) | `nep141:arb.omft.near` | 18 | ETH/USD | 70% (`7000`) | 80% (`8000`) | 5% (`500`) | No |
| ETH (from Base) | `nep141:base.omft.near` | 18 | ETH/USD | 70% (`7000`) | 80% (`8000`) | 5% (`500`) | No |
| NEAR | `nep141:wrap.near` | 24 | NEAR/USD | 70% (`7000`) | 80% (`8000`) | 5% (`500`) | No |

Values in brackets are what the contract stores, in basis points. Feed IDs are on [Oracle](../concepts/oracle.md#feeds).

:::warning The owner can change these at once
The contract owner (`setllend.near`) can update a token's max LTV, liquidation threshold, and liquidation bonus, and freeze or unfreeze it, at any time. **Changes apply immediately, to open loans too.** Lowering a threshold can make a loan liquidatable without warning. A token's decimals and oracle feed are fixed once it is added, and tokens are never removed.
:::

The contract rejects owner parameters that would break liquidations: every token needs `0 < max_ltv < liq_threshold` and `liq_threshold × (1 + liq_bonus) < 100%`, so that at the threshold the collateral still covers the debt plus the bonus.

### Why these values

- **Max LTV 70%.** Just below the effective limit for borrowing USDC against ETH or NEAR on Rhea Lend (a 75% collateral ratio times USDC's 95%, about 71%). Max LTV applies to the debt face, principal plus interest to maturity, so it is slightly stricter than it reads.
- **Liquidation threshold 80%.** Rhea liquidates at its borrow limit. Setllend adds 10 points of room, because the rate is fixed until maturity and an accepted price can be up to 60 seconds old. From a loan opened at max LTV, collateral must fall 12.5% before the loan can be liquidated.
- **Liquidation bonus 5%.** A common level for ETH collateral. At the threshold the collateral is 125% of the debt, so prices can fall about another 16% below the threshold (125% to 105%) before a liquidation stops being covered in full.

## Contract configuration

Read with the `get_config` view. These values are set when the contract is initialized, and no contract method changes them.

| Parameter | Value | On chain |
|---|---|---|
| Debt token | Native NEAR USDC, 6 decimals | `debt_token`: `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` |
| Oracle | `aggregate-oracle.near` | `oracle_contract` |
| Grace period after maturity | 1 hour | `grace`: `"3600000000000"` (nanoseconds) |
| Oracle max age | 60 seconds | `oracle_max_age`: `60` |
| Oracle max `conf / price` | 1% | `oracle_max_conf`: `100` (bps) |
| Owner | `setllend.near` | `owner_id` |
| Intents ledger | `intents.near` | `intents_contract` |

## Fixed in the contract's code

| Rule | Value |
|---|---|
| Interest | Simple interest on a 365-day year: `face = principal × (1 + APR × dt / 365 days)` |
| Rate unit and tick | APR in basis points, whole numbers, so a 1 bps tick |
| Fill rate | The maker's limit rate (the older order) |
| Close factor | 100%: one liquidation may repay the whole debt |
| Prices for borrowing limit and health | Collateral at `price − conf`, USDC at `price + conf` |
| Prices for seizure | Mid price |
| Rounding | Debt face up, note value down; shares minted down, burned up |
| Liquidatable | Health factor below 1, or unpaid at maturity + grace |

## Maturities

Read with the `get_maturities` view. Each has its own order book and note pool.

| Maturity (UTC) | Timestamp (ns) | Unpaid loans liquidatable from (UTC) |
|---|---|---|
| 2026-11-08 08:00 | `1794124800000000000` | 2026-11-08 09:00 |
| 2026-11-13 08:00 | `1794556800000000000` | 2026-11-13 09:00 |
| 2026-11-27 08:00 | `1795766400000000000` | 2026-11-27 09:00 |
| 2026-12-25 08:00 | `1798185600000000000` | 2026-12-25 09:00 |

The owner can add maturities in the future with `add_maturity`; none is ever removed.

## Backend settings

These belong to the operator's backend, not the contract, and only affect how fast things happen.

| Setting | Value |
|---|---|
| Fills per `match_orders` call | Up to 10, halved after a failed call and restored after one that succeeds |
| Matcher rounds | On every book change and every 5 seconds, with fresh prices each round |
| Keeper scan | Every 10 seconds |
| Smallest `min_gas` the relayer accepts on `auth_call` and `liquidate` intents | 100 Tgas |

## Check them yourself

Any NEAR RPC returns the live values. For example, the configuration:

```bash
curl -s https://rpc.mainnet.near.org -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "query",
  "params": {"request_type": "call_function", "finality": "final",
             "account_id": "setllend.near", "method_name": "get_config", "args_base64": "e30="}
}' | python3 -c 'import sys, json; print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'
```

Replace `get_config` with `get_collateral_tokens` or `get_maturities` for the other tables. `e30=` is `{}` in base64. More views: [Views](../developers/contract/views.md).
