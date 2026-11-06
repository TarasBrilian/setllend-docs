---
title: Glossary
description: Short definitions of the terms used across the Setllend documentation, in alphabetical order.
---

Terms in alphabetical order. Names in `code` are what the contract, the API, or a signed message uses.

**1Click.** NEAR Intents' swap and bridge service. Setllend uses it to deposit USDC and ETH from Arbitrum or Base into a user's Intents balance, and to send funds back out to those chains. See [Deposit](../guides/deposit.md) and [Withdraw](../guides/withdraw.md).

**APR (fixed APR).** The yearly interest rate of a loan, fixed when the order fills. Quoted in basis points on the wire (`800` = 8.00%). Setllend uses simple interest on a 365-day year. See [Rates and prices](../concepts/rates-and-prices.mdx).

**Ask.** An order on the sell side of the book: a `borrow` order (issues new notes) or a `sell_note` order (sells existing notes). Its limit is a maximum rate, `max_rate_bps`.

**`auth_call`.** A NEAR Intents action that calls a contract on behalf of the signer without moving tokens. Setllend uses it to cancel orders, sell notes, borrow against a loan's collateral, withdraw collateral, redeem, and withdraw a free balance.

**Bad debt.** Debt left after all of a loan's collateral has been seized. It is written off and shared pro rata by the note holders of that maturity. See [Bad debt](../concepts/bad-debt.md).

**Basis point (bps).** One hundredth of a percent: 100 bps = 1%. Rates and risk parameters are stored in bps.

**Bid.** An order on the buy side of the book: a `lend` order, which buys notes with USDC. Its limit is a minimum rate, `min_rate_bps`.

**`borrow` order.** An ask that borrows USDC at up to `max_rate_bps` for a given `principal`, with collateral in escrow (or against the collateral already in the borrower's loan). Each fill adds debt to the borrower's loan in that maturity.

**Borrowing power.** The most debt face a loan can carry: the sum of each non-frozen collateral token's value times its max LTV, at conservative prices.

**Close factor.** The share of a loan's debt one liquidation may repay. 100% on Setllend.

**Collateral token.** A token accepted as collateral, with its own oracle feed, max LTV, liquidation threshold, and liquidation bonus. Today: ETH from Arbitrum, ETH from Base, and NEAR. See [Collateral and health](../concepts/collateral-and-health.mdx).

**Confidence interval (`conf`).** The oracle's estimate of how far the true price may be from the reported price. The borrowing limit and health factor value collateral at `price − conf` and USDC at `price + conf`.

**Debt face.** What a borrower owes at maturity: the principal plus all fixed interest to maturity, rounded up. Max LTV and the health factor are measured against it.

**Discount price.** The price of a note today per 1 USDC of value at maturity, `1 / (1 + APR × days / 365)`. Always below 1 for a positive rate.

**Escrow.** Funds an open order holds on the contract: USDC for a `lend` order, collateral for a `borrow` order, locked note shares for a `sell_note` order. Returned when the order is cancelled.

**Event follower.** The backend component that reads Setllend's on-chain events and tells the matcher, keeper, and API which state to read again.

**EVM account.** A user who connects an EVM wallet (MetaMask, Rabby, and others) is the implicit account `0x…` (lowercase) on `intents.near` and signs intents with `personal_sign` (ERC-191). No NEAR wallet or NEAR gas is needed.

**Expiry.** An optional time (`expires_at`) after which an order no longer fills. Its escrow stays until the owner cancels. The app places orders without an expiry.

**Face.** The USDC a note or debt pays at maturity: `principal × (1 + APR × dt / 365 days)`. See note value and debt face.

**Fill.** One trade between a bid and an ask, of a given principal at the maker rate. An order can fill in several pieces.

**Free and locked shares.** A note balance is split into free shares, which can be sold, redeemed, or netted, and locked shares, which back an open `sell_note` order.

**Free balance.** An internal balance on the Setllend contract where a payout that failed is credited. The owner of the balance withdraws it with the `withdraw` action.

**Frozen token.** A collateral token the owner has frozen: it can't be escrowed or added to loans and gives no borrowing power, but it still counts toward health. Open loans that hold it run on.

**Grace period.** The time after maturity before an unpaid loan can be liquidated whatever its health: 1 hour.

**Health factor.** The sum of each collateral token's value times its liquidation threshold, divided by the debt value, at conservative prices. Below 1 the loan can be liquidated.

**Intents balance.** A user's balance of tokens on the `intents.near` ledger. Deposits land there, orders are funded from it, and payouts go back to it.

**`intents.near`.** The NEAR Intents verifier contract on NEAR mainnet. It holds users' Intents balances, checks their signatures, and executes their intents, including transfers to `setllend.near`.

**Keeper.** The backend component that finds liquidatable loans every 10 seconds and liquidates them from `backend.setllend.near`. Anyone else may liquidate too.

**`lend` order.** A bid that lends the escrowed USDC at no less than `min_rate_bps`. Each fill gives the lender notes in that maturity.

**Liquidation.** Repaying some or all of a loan's debt in exchange for its collateral plus the liquidation bonus. Allowed when the health factor is below 1, or when the loan is unpaid at maturity + 1 hour. See [Liquidation](../concepts/liquidation.mdx).

**Liquidation bonus.** The extra collateral a liquidator receives on top of the debt repaid: 5% today.

**Liquidation threshold.** The share of a collateral token's value that counts toward the health factor: 80% today.

**Maker.** Of two crossing orders, the one placed first (the lower `order_id`).

**Maker rate.** The limit rate of the maker. Every fill happens at the maker rate.

**Matcher.** The backend component that keeps a copy of each book, finds crossing orders, and sends fills to the permissionless `match_orders` method. The contract sets the rate and checks every fill.

**Maturity.** The fixed date and time when a book's notes pay out and its loans are due. Each maturity has its own book, note pool, and redemption pool. See [Maturities](../concepts/maturities.md).

**Max LTV.** Maximum loan to value: the share of a collateral token's value a loan may borrow against, measured on the debt face. 70% today.

**Mid price.** The oracle's reported price without the confidence interval. Used to compute how much a liquidation seizes.

**NEAR account.** A user who connects a NEAR wallet uses their NEAR account as their Intents account and signs intents with NEP-413, after registering their key on `intents.near` once.

**NEAR Intents.** The intent-based protocol on NEAR whose `intents.near` ledger holds users' funds and executes signed intents. Setllend is built on it.

**Netting.** When one account holds notes and debt in the same maturity, the two cancel out automatically, reducing both. It is how buying notes back repays a loan early.

**Note.** A claim to receive USDC from a maturity's redemption pool at maturity. Lenders buy notes, borrowers issue them. See [Zero-coupon notes](../concepts/zero-coupon-notes.md).

**Note shares.** The internal unit of note ownership in one maturity. A balance's value is `shares × V / S`.

**Note value.** What a holder's notes are worth at maturity, in USDC. Rounded down when notes are created.

**Oracle.** The price source, `aggregate-oracle.near`. See [Oracle](../concepts/oracle.md).

**Order book.** One per maturity: the bids and asks waiting to fill, ranked by rate, then by age. See [Order book](../concepts/order-book.md).

**Overdue.** A loan that still has debt at maturity + 1 hour. It can be liquidated at any health.

**Owner.** The account that administers the contract (`setllend.near`): it adds maturities and adds, freezes, and updates collateral tokens. Parameter updates apply at once.

**Partial fill.** A fill smaller than the order. The rest of the order keeps its place on the book.

**Principal.** The USDC a lender pays and a borrower receives when an order fills. Fill sizes are always in principal.

**Redeem.** After maturity, exchanging free notes for USDC from the redemption pool.

**Redemption pool.** The USDC a maturity holds for its note holders, filled by repayments and by liquidators' payments.

**Relayer.** The backend component that submits users' signed intents to `intents.near` and pays the gas. It relays only Setllend intents and withdrawals to the signer's own NEAR account.

**`sell_note` order.** An ask that sells existing notes at no more than `max_rate_bps`, which sets the lowest price the seller accepts. Its shares are locked while it is open.

**Taker.** Of two crossing orders, the newer one. It fills at the maker rate.

**Tick.** The smallest step between two rates: 1 bps.

**Total note value and shares (`V` and `S`).** The two totals of a maturity's note pool. Bad debt lowers `V` and leaves `S` alone, so every share loses the same fraction.

**`transfer` intent.** A NEAR Intents action that moves tokens from the signer's Intents balance to another account. With a `msg` to `setllend.near`, it places a `lend` or `borrow` order, adds collateral, repays, or liquidates.
