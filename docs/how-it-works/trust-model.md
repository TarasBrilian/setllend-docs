---
title: Trust model
description: What the operator can and cannot do, how users exit without the operator, what the oracle guards stop, and what powers the contract owner holds.
---

Setllend is built so that the people running it can't take user funds or change a user's position. This page sets out exactly what you trust, and whom. For the risks that remain, see [Risks](./risks.md).

There are two roles:

- The **operator** runs the backend (event follower, matcher, relayer, keeper, 1Click wrapper, API) from the account `backend.setllend.near`, and the web app.
- The **owner** is the account named `owner_id` in the contract's config. For the deployed contract the owner is the contract account itself, `setllend.near`. You can read it with the `get_config` view.

## The operator can't steal funds

- **Every fund movement starts with a user's signature.** Tokens move into Setllend only through a `transfer` intent the user signed, and out only to the account the contract's records name: the order owner, the borrower, the note holder, or the liquidator who paid off the debt. `intents.near` verifies each signature, nonce, and deadline before the contract sees anything. The relayer submits payloads but can't change them: any change breaks the signature.
- **The matcher can only propose fills the contract accepts.** The contract checks that the orders cross, that the maturity is open, that neither order has expired, and that the borrower's collateral covers the new debt at the oracle's prices. It sets the fill rate itself, the maker's limit rate, so no order ever fills at a rate worse than its own limit.
- **The operator's keys are narrow.** The relayer's key can only call `execute_intents`, the matcher's only `match_orders`. Neither can sign for a user. The keeper's key signs only for the operator's own Intents balance.
- **The backend holds no user funds.** Its database is a mirror of contract state and a log of what it sent. Books and loans are always read back from the contract.

## Exit without the operator

If the operator disappears, every position can still be closed:

- **Cancel, redeem, withdraw collateral, and withdraw free balances** are `auth_call` intents. Any NEAR account can submit a signed payload to `intents.near` with `execute_intents`, paying the gas (each transaction prepays up to 300 Tgas, which needs about 0.3 NEAR on hand, while far less is actually burned). A NEAR user can submit their own.
- **Repay** is a `transfer` intent, submitted the same way.
- **Matching** is permissionless: anyone can run a matcher that reads the orders from the contract's views and calls `match_orders`.
- **Liquidations** are open to anyone with USDC on `intents.near`.
- **Leaving NEAR Intents.** A NEAR account can withdraw USDC and NEAR to itself with `ft_withdraw` and `native_withdraw`. An EVM account can use 1Click directly, without Setllend's backend (at 1Click's standard fee without a partner key). ETH collateral can also return to Arbitrum or Base through the NEAR Intents bridge withdrawal, without 1Click; the app doesn't build that path itself. Native NEAR USDC has no same-asset route to Base or Arbitrum, so turning it into USDC there always needs a swap, normally through 1Click.

What you lose without the operator is convenience: the app reads its data from the operator's API, so without it you build and sign payloads yourself. The formats are documented in [Signing intents](../developers/signing-intents.mdx) and [Messages](../developers/contract/messages.md).

## No admin pause

The contract has no pause switch, and no account can stop users from acting. The only thing that stops actions on its own is the oracle.

Every action that needs a price asks `aggregate-oracle.near` once and validates each feed in the callback: the price must be positive, its confidence interval at most 1% of the price, and its publish time within 60 seconds of the block time. When a feed fails these checks:

| Stops | Keeps working |
|---|---|
| New loans (fills of `borrow` orders) | Placing and cancelling orders |
| Liquidations, including overdue loans after maturity | Repaying |
| Withdrawing collateral from a loan with debt | Adding collateral |
| | Note sales (`sell_note` fills need no price) |
| | Redeeming notes after maturity |
| | Withdrawing collateral from a loan with no debt |
| | Withdrawing free balances |

So with a stale oracle, risk-taking actions wait and every exit stays open. See [Oracle](../concepts/oracle.md).

## What the owner can do

The owner manages the list of maturities and collateral tokens with these methods:

| Method | Effect |
|---|---|
| `add_maturity` | Opens a new maturity (in the future only). Can't touch existing loans |
| `add_collateral_token` | Lists a new collateral token with its decimals, price feed, max LTV, liquidation threshold, and liquidation bonus |
| `update_collateral_token` | Changes a token's max LTV, liquidation threshold, and liquidation bonus |
| `freeze_collateral_token` / `unfreeze_collateral_token` | A frozen token takes no new escrow or top-ups and gives no borrowing power. Open loans keep it, and it still counts for their health |

:::danger Parameter changes apply at once, to open loans too
`update_collateral_token` takes effect in the same block, with no delay and no notice period. Lowering a token's liquidation threshold can make an open loan liquidatable immediately, and the keeper picks such loans up on its next scan. Freezing a token removes its borrowing power at once: a loan backed only by that token can't borrow more or withdraw collateral until it repays or adds another token.
:::

The contract bounds every parameter set: `0 < max_ltv < liq_threshold`, and `liq_threshold × (1 + liq_bonus) < 100%`, so collateral at the threshold still covers the debt plus the bonus. Each change emits an event (`collateral_token_updated`, `collateral_token_frozen`, and so on), so it is visible on chain. See [Owner methods](../developers/contract/owner.md) and [Risk parameters](../reference/risk-parameters.md).

What these methods **can't** do: move funds, change a loan's debt or a note's value, remove a token, or change a token's decimals or price feed once it is listed.

### The contract account's full-access key

`setllend.near` still has a full-access key, which you can see with a `view_access_key_list` RPC call. Whoever holds it can deploy new code to the contract account, and new code could change any rule on this page. It is kept so that bugs can be fixed on mainnet, where NEAR Intents has no testnet. A code change would show up on chain as a new code hash, and [Verify the contract](../verify/verify-contract.md) shows how to check that the running code is the published source.

## Matcher ordering and front-running

Setllend runs a continuous order book with a single public matcher run by the operator. The matcher sorts orders by price and then time, but **the contract doesn't enforce that order**: it checks each fill on its own terms. So the matcher decides which crossing orders fill first, and could in principle delay an order or fill another ahead of it.

What bounds this:

- Every fill is at the maker's limit rate, so an order never fills worse than its own limit, whoever matched it.
- Orders are escrowed on chain the moment they are placed and are public to everyone at once; the operator has no private view of them.
- Anyone can run a competing matcher; whichever valid fill executes first on chain wins.
- A user can cancel an unfilled order at any time.

## Summary

| You trust | For | If they fail |
|---|---|---|
| `intents.near` (NEAR Intents) | Holding balances and verifying signatures | Everything depends on it |
| The Setllend contract's code | Every lending rule | See [smart-contract risk](./risks.md#smart-contract-risk) |
| The holder of `setllend.near`'s full-access key | Not deploying harmful code | Rules can change |
| The owner | Sensible collateral parameters | Loans can become liquidatable at once |
| `aggregate-oracle.near` (Rhea) | Correct, fresh prices | Wrong prices can open bad loans or trigger liquidations; stale prices pause risky actions |
| Bridges and 1Click | Moving assets between chains | Deposits and withdrawals to other chains stop or are at risk |
| The operator | Liveness: matching, relaying, liquidating | Slower fills and exits; liquidation delays can create bad debt |
