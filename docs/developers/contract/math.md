---
title: Math
description: The exact formulas setllend.near uses - face, rounding, note shares, bad debt, conservative valuation, health factor, liquidation seizure, and price validation - each with a worked example.
---

Every number the contract computes is integer math with an explicit rounding direction. This page gives each formula as the code implements it, the reason for its rounding, and a worked example you can reproduce. Off-chain code that predicts the contract (a matcher, a keeper, a UI) must round exactly the same way.

General rules:

- **Checked math.** Note math is checked `u128`, collateral value math uses 512-bit intermediates. Overflow panics with `Math overflow`, which reverts the whole call, so a combination of inputs that can't be computed is rejected rather than computed wrongly.
- **Rounding goes against the account acting,** so other users are never diluted: debt rounds up, notes received round down, shares burned round up, collateral seized rounds down.
- **Units.** Amounts are in the token's smallest unit (USDC has 6 decimals), rates and ratios in bps (10,000 = 100%), time in nanoseconds.

## Face

A note's face is what it pays at maturity. A loan's debt face is what the borrower owes at maturity. Both come from the principal with simple interest on a 365-day year:

```
YEAR_NS = 365 × 24 × 3600 × 10^9          (31,536,000,000,000,000 ns)
dt      = maturity − block_timestamp       (must be > 0 at fill)

face(principal, rate_bps, dt) = principal × (10^4 × YEAR_NS + rate_bps × dt) / (10^4 × YEAR_NS)
```

The rate is the fill rate, the maker's limit rate. **Debt face rounds up and note face rounds down**, so the borrower never owes less than the lender is owed, and the difference (at most one unit) stays in the maturity's pool. Simple interest on a fixed year keeps the math exact and easy to check by hand.

**Worked example.** 1,000 USDC (`principal = 1000000000`) at 8% APR (`rate_bps = 800`) with exactly 21 days to maturity (`dt = 1814400000000000`):

```
growth  = 10^4 × YEAR_NS + 800 × 1,814,400,000,000,000
face    = 1,000,000,000 × growth / (10^4 × YEAR_NS) = 1,004,602,739.726…

note face (down) = 1004602739   → 1,004.602739 USDC
debt face (up)   = 1004602740   → 1,004.602740 USDC
```

In decimal terms: 1,000 × (1 + 0.08 × 21 / 365) ≈ 1,004.60 USDC. The [rates and prices](../../concepts/rates-and-prices.mdx) page has a calculator.

The worst case for `u128` is far away: a principal of 10^12 units (1 million USDC) times `10^4 × YEAR_NS` (about 3.2 × 10^20) is about 3.2 × 10^32, below `u128::MAX` (about 3.4 × 10^38).

## Note accounting

Notes are held as **shares** of a per-maturity note pool, like supply shares in Morpho Blue. This lets a loss be shared fairly by every holder of that maturity.

```
Per maturity:
  V = total note value (USDC face owed to all note holders)
  S = total note shares

value(shares)     = shares × V / S       (0 if S = 0; always rounded down)
shares_for(value) = value × S / V        (= value if S = 0, so 1 share = 1 unit at start)
```

| Operation | Effect on V and S | Rounding |
|---|---|---|
| New notes from a `lend` × `borrow` fill (value `f`) | `S += shares_for(f)`, `V += f` | Shares minted round **down** |
| Note sale fill (value `f`) | Shares move from seller to buyer. V and S unchanged | Shares moved = `shares_for(f)`, round **down** |
| `sell_note` placement (value `f`) | `shares_for(f)` move from free to locked | Round **up** |
| Netting (value `n`) | `S −= shares_for(n)`, `V −= n` | Shares burned round **up** |
| Redeem (value `f`) | `S −= shares_for(f)`, `V −= f` | Shares burned round **up** |
| Bad debt `B` realized | `V = max(V − B, 0)`, S unchanged | None |

Edge rules:

- **Burning the whole balance.** When netting or `redeem` burns a value equal to the full value of the account's free shares, all of its free shares are burned instead of `shares_for(value)`. No dust entry is left, and it still rounds against the account.
- **Last shares gone.** When `S` reaches 0, `V` is set to 0. Value left over from rounding has no holder, and the USDC behind it stays in the redemption pool.
- **Zero-share fills are rejected** (`zero_shares`): a fill whose value converts to 0 shares would take the bid's USDC for nothing.
- **Wiped out.** If `V = 0` while `S > 0`, new notes can't be priced, so the maturity accepts no more fills (`notes_wiped_out`).
- **Invariant:** `redemption_pool + Σ debt_face ≥ V`. Rounding surplus stays in the pool.

Without bad debt, `V / S` stays at 1 and shares equal value.

**Worked example.** A maturity holds `V = S = 1,000,000,000` (1,000 USDC of notes). A liquidation realizes 100 USDC of bad debt, so `V = 900,000,000` and `S` is unchanged:

```
holder with 250,000,000 shares:  value = 250,000,000 × 900,000,000 / 1,000,000,000 = 225,000,000   (225 USDC, was 250)

sell_note of value 100 USDC locks  shares_for(100,000,000, up)   = 111,111,112 shares
a buyer whose fill has face 50.123456 USDC gets
                                    shares_for(50,123,456, down) = 55,692,728 shares
                                    worth value(55,692,728)      = 50,123,455   (one unit below face)
```

Every holder lost the same 10%. This is why `order_filled.face` can be one unit above the value the buyer actually receives after bad debt.

## Bad debt

Bad debt is realized only inside a liquidation: if the loan's collateral (every token) reaches zero while debt remains, the rest `B` is written off.

```
debt_face        = 0
V                = max(V − B, 0)
bad_debt_total  += B
```

A loan gets there when its collateral is worth less than `debt × (1 + bonus)`: the liquidator repays only what the whole collateral is worth (`repay_for(all)`, below), takes all of it, and the rest becomes bad debt. Liquidation stays profitable at any size, so this always resolves. Holders who redeemed before the write-off were paid in full; everyone holding notes of that maturity afterwards shares the loss pro rata through the lower `V / S`. See [Bad debt](../../concepts/bad-debt.md).

**Worked example.** A loan has 1,100 USDC of debt face and collateral worth 1,000 USDC at mid prices, with a 5% bonus. The liquidator repays `repay_for(all) = 1,000 / 1.05 ≈ 952.380953` USDC and receives all the collateral. The remaining `1,100 − 952.380953 = 147.619047` USDC is bad debt, and `V` drops by that much.

## Conservative valuation

A loan holds one or more collateral tokens `i`, each with its own `max_ltv_i`, `liq_threshold_i`, and `liq_bonus_i`. Prices come from `aggregate-oracle.near` in Pyth format: `price × 10^expo` USD, with a confidence interval `conf`. For borrowing power and health, collateral is valued at the low end and debt at the high end:

```
collateral_value_i = amount_i × (price_i − conf_i) × 10^expo_i / 10^decimals_i
debt_value         = debt_face × (usdc_price + usdc_conf) × 10^usdc_expo / 10^6
```

A token whose `price − conf` is zero or negative counts as worth nothing.

### Max LTV check (`can_open`)

Used for every `borrow` fill and for every collateral withdrawal while debt remains:

```
can_open:   Σ (non-frozen i) collateral_value_i × max_ltv_i / 10^4  ≥  debt_value
```

Frozen tokens are left out: they give no borrowing power.

**Worked example.** A loan holds 0.5 ETH (`500000000000000000`). The oracle reports ETH at `price = 226333103391`, `conf = 212896609`, `expo = −8` (2,263.33103391 ± 2.12896609 USD), and USDC at `price = 99990000`, `conf = 10000`, `expo = −8` (0.9999 ± 0.0001).

```
collateral value = 0.5 × (2,263.33103391 − 2.12896609) = 1,130.60103391 USD
borrowing power  = 1,130.60103391 × 0.70              =   791.42072374 USD
debt price       = 0.9999 + 0.0001                     =     1.0000 USD

largest debt face that passes: 791420723  (791.420723 USDC)
```

The debt face, not the principal, is what is checked, so the limit includes interest to maturity and is slightly stricter than it looks.

## Health factor

```
health_factor = Σ (all i) collateral_value_i × liq_threshold_i / 10^4  /  debt_value

liquidatable:  debt_face > 0  AND  (health_factor < 1  OR  block_timestamp ≥ maturity + grace)
```

Frozen tokens count toward health, so freezing a token never makes a loan liquidatable. A health factor of exactly 1 is not liquidatable. After `maturity + grace` (1 hour), unpaid debt is liquidatable whatever its health: settlement at maturity is a liquidation.

The contract never computes the ratio itself. It checks `Σ collateral_value_i × liq_threshold_i ≥ debt_value` as one cross-multiplied comparison, the same function as `can_open` with each token's threshold instead of its max LTV. Off-chain code computes the ratio for display. See [Collateral and health](../../concepts/collateral-and-health.mdx) for a calculator.

**Worked example.** The 0.5 ETH loan above with a debt face of 700 USDC:

```
health_factor = 1,130.60103391 × 0.80 / (700 × 1.0000) = 904.48082713 / 700 ≈ 1.292
```

It becomes liquidatable when `0.5 × (price − conf) × 0.80 < 700`, that is when ETH's `price − conf` falls below 1,750 USD.

### Exact integer comparison

Neither side is divided. The code brings every term to the smallest power of ten among them, the common exponent:

```
exp_i    = expo_i − decimals_i          (ETH: −8 − 18 = −26;  NEAR: −8 − 24 = −32)
exp_debt = usdc_expo − 6                (USDC: −8 − 6 = −14)
common   = min(exp_debt, exp_i for all i)

lhs = Σ amount_i × (price_i − conf_i) × ratio_i × 10^(exp_i − common)
rhs = debt_face × (usdc_price + usdc_conf) × 10^4 × 10^(exp_debt − common)

passes  ⇔  lhs ≥ rhs
```

Nothing is rounded. The products use **512-bit intermediates**: a NEAR amount in yoctoNEAR (24 decimals) times a price passes `u128::MAX` at about 1 million NEAR, and seizure multiplies two values. The unit tests value 100 million NEAR. Only an absurd exponent (more than a factor of 10^154 between two terms) panics with `Math overflow`.

## Liquidation seizure

Seizure uses **mid prices** (`price` without `conf`), as in Aave. Only the max LTV check and the health factor use the conservative prices.

```
value_i    = amount_i × price_i × 10^expo_i / 10^decimals_i        (mid prices)
V_c        = Σ value_i                                              (collateral value)
W          = Σ value_i × (1 + liq_bonus_i)
repaid     = min(offered, debt_face)
repaid_usd = repaid × usdc_price × 10^usdc_expo / 10^6

f          = repaid_usd × W / V_c²                                  (fraction of every token)
seized_i   = amount_i × f                                           (rounded down per token)
```

Every token loses the same fraction `f`. The total seized, `f × V_c = repaid_usd × W / V_c`, is the repaid value plus each token's bonus on its share of the value. With equal bonuses (every token today) it is simply `repaid_usd × (1 + bonus)`. Taking the same fraction keeps the loan's mix and empties every token at once when `f` reaches 1, so bad debt has a single trigger.

Rounding: each token's share rounds down, against the liquidator. A token whose share rounds to 0 is skipped, and the call panics with `Nothing to seize` only if nothing at all is seized.

**Worked example.** A loan holds 1 ETH and 1,000 NEAR. Mid prices: ETH 2,000 USD, NEAR 3 USD, USDC 1.00 USD. Both bonuses are 5%. The liquidator repays 1,000 USDC.

```
V_c = 2,000 + 3,000            = 5,000 USD
W   = 5,000 × 1.05             = 5,250 USD
f   = 1,000 × 5,250 / 5,000²   = 0.21

seized ETH  = 1 × 0.21         = 0.21 ETH     (210000000000000000)
seized NEAR = 1,000 × 0.21     = 210 NEAR     (210000000000000000000000000)
total seized = 1,050 USD = 1,000 repaid + 5% bonus
```

With one token the formula reduces to the familiar form: repaying 1,000 USDC against ETH at 2,000 USD with a 5% bonus seizes `1,000 × 1.05 / 2,000 = 0.525 ETH`. If USDC traded at 0.50 USD, the same repayment would seize half as much, 0.2625 ETH, because the repaid value is measured at USDC's price.

### Full liquidation: `repay_for(all)`

When `f ≥ 1`, all collateral is seized and the repayment is cut to what the collateral is worth after the bonus:

```
repay_for(all) = V_c² / (W × usdc_price)     in debt units, rounded up
               = V_c / (1 + bonus) / usdc_price   with equal bonuses
```

It rounds up, so a full liquidation never repays less than the collateral is worth. The liquidator is refunded `offered − repay_for(all)`. If debt remains after that, it is bad debt.

**Worked examples.**

```
1 ETH at 2,000 USD, 5% bonus:            repay_for(all) = 2,000 / 1.05 = 1,904.761905 USDC   (1904761905)
1 ETH + 1,000 NEAR (5,000 USD), 5%:      repay_for(all) = 5,000 / 1.05 = 4,761.904762 USDC   (4761904762)
```

Offering 5,000 USDC on the first loan seizes the whole 1 ETH, repays `1904761905`, and refunds `3095238095`. Offering one unit less than `1904761905` leaves a little ETH in the loan.

## Price validation

The contract makes one oracle call per action, `list_prices_no_older_than(price_ids, age)` on `aggregate-oracle.near`, for the USDC feed and every collateral feed (frozen tokens included, since their loans still need prices), with `age = oracle_max_age`. It then validates each price itself, because the oracle's own source is not public:

```
usable  ⇔  price > 0
       AND |block_time_s − publish_time| ≤ oracle_max_age        (60 s, either direction)
       AND conf × 10^4 ≤ price × oracle_max_conf                  (conf / price ≤ 1%)
```

The age is checked in both directions, as Pyth does, so a reporter clock running ahead can't keep a price fresh. A feed returned as `null`, a failed oracle call, or a price that fails a check means that feed has no usable price. Example response, with the USDC feed stale:

```json
{
  "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace": {"price": "226333103391", "conf": "212896609", "expo": -8, "publish_time": 1793517540},
  "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a": null
}
```

Without a usable price: `borrow` fills skip with `no_price`, `liquidate` and `withdraw_collateral` with debt panic with `No price`. Everything that needs no price keeps working: `lend`, `repay`, `add_collateral`, `cancel`, `sell_note` and its fills, `redeem`, `withdraw`, and collateral withdrawal from a loan without debt. See [Oracle](../../concepts/oracle.md).
