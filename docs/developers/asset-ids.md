---
title: Asset IDs and accounts
description: Every token Setllend uses, with its NEAR Intents asset ID, decimals, origin chain, and role, plus the contract accounts an integrator talks to.
sidebar_label: Asset IDs
---

Setllend never holds tokens in its own NEP-141 accounts. Every amount lives on the `intents.near` ledger and is named by an **Intents asset ID**: the string `nep141:<token contract>`. The contract, the REST API, the WebSocket feed, and every signed intent use these IDs exactly as written below. This page lists them all, together with the decimals you need to convert amounts and the accounts you call.

All IDs below are copied from the backend's shared constants (`backend/src/shared/assets.ts` in the [repository](https://github.com/TarasBrilian/setllend)) and from the live contract's `get_config` and `get_collateral_tokens` views.

## Tokens

| Token | Intents asset ID | Decimals | Origin | Role in Setllend |
|---|---|---|---|---|
| USDC (native NEAR) | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | 6 | NEAR | **Debt token.** Every loan, `lend` order, note, repayment, and redemption is in this token |
| ETH (from Arbitrum) | `nep141:arb.omft.near` | 18 | Arbitrum | **Collateral** |
| ETH (from Base) | `nep141:base.omft.near` | 18 | Base | **Collateral** |
| NEAR (wrapped) | `nep141:wrap.near` | 24 | NEAR | **Collateral.** Held as wNEAR on the Intents ledger |
| USDC (Base) | `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near` | 6 | Base | **Deposit origin and exit destination only.** 1Click converts it to and from native NEAR USDC; the contract never sees it |
| USDC (Arbitrum) | `nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near` | 6 | Arbitrum | **Deposit origin and exit destination only**, as above |

:::warning Two different ETH tokens
ETH bridged from Arbitrum and ETH bridged from Base are separate tokens with separate asset IDs. Each is its own collateral token with its own balance. ETH from Arbitrum can only leave to Arbitrum, and ETH from Base only to Base: Setllend's 1Click routes send each one back to the chain it came from. Both are priced by the same ETH/USD oracle feed.
:::

### Converting amounts

Amounts are always **integers in the token's smallest unit, sent as decimal strings** (`"1000000"`, never `1000000` or `"1.0"`). Divide by `10^decimals` to display them.

| You mean | Send |
|---|---|
| 100 USDC | `"100000000"` (100 × 10^6) |
| 0.05 ETH | `"50000000000000000"` (0.05 × 10^18) |
| 2.5 NEAR | `"2500000000000000000000000"` (2.5 × 10^24) |

A NEAR amount in yoctoNEAR is larger than JavaScript's safe integer range, so use `bigint` (or a decimal library) for all arithmetic, never `Number`.

### Collateral parameters

Each collateral token carries its own risk parameters, set by the owner and readable live from `GET /api/collateral-tokens` (see [REST API](./rest-api.md#get-apicollateral-tokens)) or the contract's `get_collateral_tokens` view. At the time of writing all three tokens use the same values:

| Token | `max_ltv` | `liq_threshold` | `liq_bonus` | Oracle feed ID |
|---|---|---|---|---|
| `nep141:arb.omft.near` | 7000 (70%) | 8000 (80%) | 500 (5%) | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` (ETH/USD) |
| `nep141:base.omft.near` | 7000 (70%) | 8000 (80%) | 500 (5%) | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` (ETH/USD) |
| `nep141:wrap.near` | 7000 (70%) | 8000 (80%) | 500 (5%) | `c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750` (NEAR/USD) |

The debt token is priced by feed `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` (USDC/USD), the `debt_feed_id` of `get_config`. The owner can change these parameters or freeze a token at any time, so read them from the API rather than hard-coding them. What each parameter means is explained in [Risk parameters](../reference/risk-parameters.md).

## How each token gets in and out

| Token | Into the Intents balance | Out of the Intents balance |
|---|---|---|
| USDC (native NEAR) | 1Click from USDC on Base or Arbitrum; or `ft_transfer_call` on the USDC contract from a NEAR wallet | 1Click to USDC on Base or Arbitrum; or an `ft_withdraw` intent to the signer's own NEAR account |
| ETH (from Arbitrum) | 1Click from ETH on Arbitrum | 1Click to ETH on Arbitrum |
| ETH (from Base) | 1Click from ETH on Base | 1Click to ETH on Base |
| NEAR (wrapped) | 1Click swap from USDC or ETH on Base or Arbitrum; or `near_deposit` + `ft_transfer_call` on `wrap.near` from a NEAR wallet | 1Click swap to USDC on Base or Arbitrum; or a `native_withdraw` intent to the signer's own NEAR account (arrives as native NEAR) |

The 1Click routes and their request format are on the [REST API](./rest-api.md#1click-deposits-and-withdrawals) page; withdrawals to a NEAR account are signed intents, described in [Signing intents](./signing-intents.mdx#withdrawals-to-your-own-near-account).

When you deposit from a NEAR wallet with `ft_transfer_call` to `intents.near`, the `msg` argument is the Intents account that receives the tokens. An empty `msg` credits the sender itself.

## Reading a balance

The Intents balance of an account is the NEP-245 multi-token balance on `intents.near`, keyed by the same asset ID:

```bash
curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "query",
  "params": {
    "request_type": "call_function", "finality": "final",
    "account_id": "intents.near", "method_name": "mt_batch_balance_of",
    "args_base64": "'$(printf '{"account_id":"alice.near","token_ids":["nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","nep141:wrap.near"]}' | base64 | tr -d '\n')'"
  }
}'
```

The `result` field is an array of bytes; decoded as UTF-8 it is a JSON list of decimal strings in the order of `token_ids`, for example `["0","0"]`. `GET /api/accounts/:account` returns the same numbers as `deposits`, with zero balances left out.

## Accounts

| Account | What it is | You use it for |
|---|---|---|
| `setllend.near` | The Setllend contract. It is also the owner account | The `receiver_id` of every `transfer` intent and the `contract_id` of every `auth_call` intent; view calls such as `get_orders_by_account` |
| `intents.near` | The NEAR Intents verifier and ledger | `verifying_contract` (ERC-191) or `recipient` (NEP-413) of every signed payload; `execute_intents`, `simulate_intents`, `current_salt`, `add_public_key`, `has_public_key`, `mt_batch_balance_of` |
| `aggregate-oracle.near` | The price oracle (Pyth-format feeds) | Read by the contract; you only need it to check prices yourself |
| `wrap.near` | The wNEAR token contract | Wrapping NEAR before depositing it from a NEAR wallet |
| `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | The native USDC token contract on NEAR | `ft_transfer_call` deposits from a NEAR wallet, `storage_deposit` before a first USDC withdrawal to a NEAR account. In an `ft_withdraw` intent it is the `token` field, written without the `nep141:` prefix |
| `backend.setllend.near` | The operator's backend account | Pays gas for relayed intents and `match_orders`, and runs the keeper. You never need to call it |

## Account IDs of users

Setllend keys orders, loans, and notes by the user's Intents account:

- **EVM account:** the wallet's address in **lowercase**, for example `0x1234567890abcdef1234567890abcdef12345678`. Wallets return checksummed (mixed-case) addresses; a checksummed address is not a valid NEAR account ID and is rejected everywhere on the Intents side, including the REST API (`account must be a valid lowercase NEAR account ID`). Always lowercase it.
- **NEAR account:** the account itself, named (`alice.near`) or implicit (64 hex characters).

An EVM account and a NEAR account are separate Intents accounts with separate balances, even when one person owns both.
