---
title: Owner methods
description: What the owner of setllend.near can and cannot change - maturities, collateral tokens and their risk parameters, freezing - and the parameters fixed at deploy.
---

The contract has a small set of owner-only methods for adding markets and managing collateral tokens. Everything else, including the grace period and the oracle guards, was fixed when the contract was initialized.

The owner is `owner_id` in `get_config`, which is **`setllend.near` itself**. Owner methods are plain function calls signed by that account. Any other caller gets `Owner only`.

:::warning
**A risk-parameter update applies at once, to open loans too.** Lowering a token's liquidation threshold can make existing loans liquidatable in the same block, with no notice period. Setllend's keeper picks such loans up on its next scan. Borrowers should keep a margin above the liquidation threshold.
:::

## What the owner can and cannot do

| The owner can | The owner cannot |
|---|---|
| Add a new maturity | Remove or change a maturity |
| Add a collateral token with its risk parameters | Remove a collateral token |
| Change a token's `max_ltv`, `liq_threshold`, and `liq_bonus` | Change a token's `decimals` or `feed_id` once added |
| Freeze and unfreeze a token | Change the debt token, the oracle, the grace period, or the oracle guards |
| | Pause the contract (there is no pause) |
| | Move user escrow, collateral, or notes through any contract method |

`setllend.near` also holds a full-access key, and with it the account holder can deploy new code to the account. The contract itself has no upgrade method and no timelock. To check what code is running, compare its hash with a reproducible build of the published source; see [Verify the contract](../../verify/verify-contract.md) and [Trust model](../../how-it-works/trust-model.md).

## `add_maturity`

```rust
pub fn add_maturity(&mut self, maturity: U64)
```

```json
{"maturity": "1795766400000000000"}
```

Adds a maturity (nanoseconds) with an empty book and an empty note pool. It must be in the future and not listed yet. Adding a maturity can't touch existing loans. Maturities are never removed. Once a maturity passes, it accepts no new orders and no fills, but `repay`, `add_collateral` (until `maturity + grace`), `liquidate`, `redeem`, `cancel`, and withdrawals keep working.

**Event:** `maturity_added`.
**Errors:** `Owner only`, `Maturity must be in the future`, `Maturity exists`.

The maturities on mainnet:

| Maturity (UTC) | Timestamp |
|---|---|
| 2026-11-08 08:00 | `1794124800000000000` |
| 2026-11-13 08:00 | `1794556800000000000` |
| 2026-11-27 08:00 | `1795766400000000000` |
| 2026-12-25 08:00 | `1798185600000000000` |

## `add_collateral_token`

```rust
pub fn add_collateral_token(
    &mut self,
    token_id: String,    // Intents asset ID
    decimals: u8,
    feed_id: String,     // oracle feed of the token's USD price
    max_ltv: u32,        // bps
    liq_threshold: u32,  // bps
    liq_bonus: u32,      // bps
)
```

```json
{"token_id":"nep141:wrap.near","decimals":24,"feed_id":"c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750","max_ltv":7000,"liq_threshold":8000,"liq_bonus":500}
```

Adds a token to the end of the collateral list, not frozen. **Checks:**

- `token_id` is not the debt token and not listed yet.
- `feed_id` is not empty.
- `0 < max_ltv < liq_threshold`.
- `liq_threshold × (1 + liq_bonus) < 100%`, so a liquidation at the threshold can still pay the bonus out of the collateral. With 80% and 5%: 0.80 × 1.05 = 0.84, which passes.

These check the owner's own parameters; they are not limits on users. `decimals` and `feed_id` are fixed once added, because the amounts and prices of open loans depend on them.

**Event:** `collateral_token_added`.
**Errors:** `Owner only`, `Debt token cannot be collateral`, `Collateral token exists`, `Feed ID is empty`, `Require 0 < max_ltv < liq_threshold`, `Require liq_threshold * (1 + liq_bonus) < 100%`.

The tokens on mainnet, all at 70% max LTV, 80% liquidation threshold, and 5% liquidation bonus:

| Token | Asset ID | Decimals | Price feed |
|---|---|---|---|
| ETH (from Arbitrum) | `nep141:arb.omft.near` | 18 | ETH/USD |
| ETH (from Base) | `nep141:base.omft.near` | 18 | ETH/USD |
| NEAR | `nep141:wrap.near` | 24 | NEAR/USD |

The values follow Rhea Lend's effective borrow limit for the same assets against USDC (75% × 95% ≈ 71%): max LTV just below it, a threshold 10 points higher because rates are fixed until maturity and prices can be up to 60 seconds old, and a common 5% bonus. See [Risk parameters](../../reference/risk-parameters.md).

## `update_collateral_token`

```rust
pub fn update_collateral_token(&mut self, token_id: String, max_ltv: u32, liq_threshold: u32, liq_bonus: u32)
```

```json
{"token_id":"nep141:wrap.near","max_ltv":6500,"liq_threshold":7500,"liq_bonus":750}
```

Replaces the three risk parameters of a listed token, with the same checks as on add. **It applies immediately to every open loan and order:**

- A lower `liq_threshold` lowers the health factor of every loan holding the token, possibly below 1.
- A lower `max_ltv` reduces how much can be borrowed or withdrawn against the token from the next fill or withdrawal on.
- A new `liq_bonus` changes how much collateral the next liquidation seizes.

**Event:** `collateral_token_updated`.
**Errors:** `Owner only`, `Unknown collateral token`, and the two parameter checks above.

## `freeze_collateral_token` and `unfreeze_collateral_token`

```rust
pub fn freeze_collateral_token(&mut self, token_id: String)
pub fn unfreeze_collateral_token(&mut self, token_id: String)
```

```json
{"token_id":"nep141:wrap.near"}
```

A frozen token:

- can't be escrowed in a new `borrow` or added with `add_collateral` (`Collateral token is frozen`);
- **gives no borrowing power**: the max LTV check for `borrow` fills and for collateral withdrawals with debt leaves it out;
- still counts toward the health factor, so freezing never makes a loan liquidatable by itself;
- stays in open loans, which run on until repaid, withdrawn, or liquidated.

A loan backed only by a frozen token can't borrow more or withdraw any collateral while it has debt, until it repays or adds another token. Orders that escrowed the token before the freeze can still fill, but the token adds nothing to the max LTV check. This is how Aave v3.1 freezes a reserve.

Unfreezing restores the token completely.

**Events:** `collateral_token_frozen`, `collateral_token_unfrozen`.
**Errors:** `Owner only`, `Unknown collateral token`, `Already frozen`, `Not frozen`.

## Fixed at initialization

`new(config)` is `#[private]`, so only `setllend.near` itself could call it, and it ran in the same transaction as the code deploy ([transaction](https://nearblocks.io/txns/DgAcsj1cjT2TnrNNt4e2hAtHauBpdaN6CYovTKpfLkPn)). That transaction also added the four maturities and the three collateral tokens above. The `Config` it set can't be changed by any method:

| Field | Value on mainnet | Meaning |
|---|---|---|
| `owner_id` | `setllend.near` | Caller of the owner methods |
| `intents_contract` | `intents.near` | The only trusted caller, and the target of payouts |
| `oracle_contract` | `aggregate-oracle.near` | Price source |
| `debt_token` | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | USDC, native on NEAR |
| `debt_feed_id` | `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` | USDC/USD feed |
| `grace` | `"3600000000000"` (1 hour) | Time after maturity before unpaid debt becomes liquidatable |
| `oracle_max_age` | `60` seconds | Largest distance between a price's publish time and the block time |
| `oracle_max_conf` | `100` bps (1%) | Largest accepted `conf / price` |

Also fixed in code: the close factor (100%), simple interest on a 365-day year, and the rounding rules in [Math](./math.md).
