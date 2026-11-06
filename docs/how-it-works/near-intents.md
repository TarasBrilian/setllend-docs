---
title: NEAR Intents
description: The NEAR Intents primitives Setllend is built on, explained for newcomers, and why each one was chosen.
---

Setllend doesn't hold user funds in a contract of its own design. It builds on **NEAR Intents**, a shared ledger and signature verifier on NEAR mainnet at `intents.near`. This page explains the parts of NEAR Intents that Setllend uses, what each one does, and why it was the right tool.

For the exact JSON a client signs, see [Signing intents](../developers/signing-intents.mdx).

## The ledger and the Verifier

`intents.near` is a NEAR smart contract that keeps a balance per account and per token, much like a multi-token contract ([NEP-245](https://github.com/near/NEPs/blob/master/neps/nep-0245.md)). Tokens are identified by **asset IDs** such as `nep141:arb.omft.near` (ETH bridged from Arbitrum) or `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` (native USDC on NEAR). The full list is on [Asset IDs](../developers/asset-ids.md).

The same contract is also the **Verifier**: it accepts signed messages, called **intents**, checks them, and executes what they say. An intent is a JSON payload that names a signer, a deadline, a nonce, and a list of actions. Anyone can submit a signed payload with `execute_intents`; the submitter pays the NEAR gas, but the actions run on behalf of the signer only. That split is what lets Setllend's relayer pay gas for users without being able to act for them.

The Verifier checks:

- **The signature.** EVM wallets sign with ERC-191 (`personal_sign`), NEAR wallets with NEP-413 (`signMessage`).
- **The nonce.** Each nonce can be used once. It uses the versioned format, which includes a salt read from the `current_salt` view, so a client fetches the salt before signing.
- **The deadline.** A payload past its deadline is refused.

### Accounts

- **EVM wallets** get an account on `intents.near` with no setup: the lowercase `0x…` address is the account ID (an *implicit Eth account*). The Verifier recovers the address from the ERC-191 signature, so nothing is registered and the user never touches NEAR directly.
- **NEAR wallets** use their own NEAR account (for example `alice.near`). Before its first signed intent, the account registers its wallet key on `intents.near` with `add_public_key` (see [below](#add_public_key-registering-a-near-wallet-key)).

Setllend keys orders, loans, and notes to the same account ID the Verifier names as the signer.

## The primitives Setllend uses

| Primitive | What it does | Used in Setllend for |
|---|---|---|
| `transfer` with `msg` | Moves tokens from the signer to a receiver and notifies the receiver with `mt_on_transfer` | Placing `lend` and `borrow` orders, `add_collateral`, `repay`, `liquidate` |
| `auth_call` | Calls `on_auth` on a contract with the signer's verified account ID and a `msg` | `cancel`, `sell_note`, `borrow` against an existing loan, `withdraw_collateral`, `redeem`, `withdraw` |
| `mt_transfer` | A contract moves its own Intents balance to another account | Every payout from Setllend: borrowed USDC, refunds, sale proceeds, redemptions, collateral |
| `ft_withdraw`, `native_withdraw` | Take tokens out of the ledger to a NEAR account | A NEAR account withdrawing USDC or NEAR to itself |
| `add_public_key` | Registers a key that may sign for a NEAR account | A NEAR wallet's one-time setup |

### `transfer` + `msg`: deposit and order in one step

A `transfer` intent moves tokens from the signer's Intents balance to a receiver. When it carries a `msg`, `intents.near` calls the receiver's `mt_on_transfer(sender_id, previous_owner_ids, token_ids, amounts, msg)` after moving the tokens. The receiver returns how much of each token to refund; anything it doesn't refund it keeps.

Setllend uses this for every action that brings tokens in. A lend order is one intent:

```json
{
  "intent": "transfer",
  "receiver_id": "setllend.near",
  "tokens": { "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "1000000000" },
  "msg": "{\"action\":\"lend\",\"data\":{\"maturity\":\"1795766400000000000\",\"min_rate_bps\":700,\"expires_at\":null}}"
}
```

**Why:** the funds and the order arrive together, atomically. There is no approve-then-deposit sequence and no moment where funds sit in the contract without an order. If anything about the order is wrong (an unknown maturity, a frozen collateral token, a malformed `msg`), the contract panics, its state is rolled back, and `intents.near` refunds the full amount to the signer in the same transaction. The `sender_id` the Verifier passes is the signer, so the contract always knows whose funds arrived.

A `transfer` can carry several tokens at once, which is how a `borrow` escrows ETH and NEAR together. `lend`, `repay`, and `liquidate` accept exactly one token, the debt token USDC.

### `auth_call`: actions without a deposit

An `auth_call` intent makes `intents.near` call `on_auth(signer_id, msg)` on a contract. The contract receives the verified signer and nothing else: no tokens move with it.

```json
{
  "intent": "auth_call",
  "contract_id": "setllend.near",
  "msg": "{\"action\":\"cancel\",\"data\":{\"order_id\":\"42\"}}",
  "min_gas": "100000000000000"
}
```

**Why:** many actions only change records inside Setllend or ask it to pay something out: cancelling an order, listing notes for sale, redeeming notes, taking collateral back, or recovering a free balance. `auth_call` gives the contract a verified caller for these without a dummy token transfer. Setllend sets `min_gas` to 100 Tgas on every `auth_call`, because `intents.near` guarantees only `min_gas` to `on_auth` (10 Tgas by default) and some actions need an oracle round trip and a payout.

`auth_call` is **detached**: the outer `execute_intents` transaction succeeds even if `on_auth` fails. The relayer therefore reads the outcome of the `on_auth` receipt itself before telling the user the action worked. See [Backend services](./backend-services.md#relayer).

### `mt_transfer`: payouts from the contract's balance

The Setllend contract has its own account on `intents.near`. When it owes a user something, it calls `mt_transfer` on `intents.near` to move that amount from its balance to the user's, attaching exactly 1 yoctoNEAR as the call requires. The call is asynchronous, so the contract adds a callback, `on_payout`. If a payout fails, the callback credits the amount to the user's **free balance** inside Setllend and emits `payout_failed`; the user recovers it later with the `withdraw` action.

**Why:** payouts stay on the same ledger, cost the user nothing, and land in the user's Intents balance, from where they can be used for the next order or withdrawn to any supported chain.

### `ft_withdraw` and `native_withdraw`: out to a NEAR account

These intents take tokens off the ledger to a NEAR account:

- `ft_withdraw` sends a NEP-141 token, here USDC, with a plain `ft_transfer` to the receiver.
- `native_withdraw` takes the signer's wNEAR (`nep141:wrap.near`) and sends it as native NEAR.

Setllend's relayer relays these only to the signer's own NEAR account, alone in their payload, and without a `msg` or `storage_deposit`. **Why:** both shortcuts lose funds when they fail. An `ft_withdraw` with a `msg` that fails is not refunded, a `storage_deposit` is paid from wNEAR and never refunded, and NEAR sent to an account that doesn't exist is lost. Before submitting, the relayer checks that the receiver is registered on the USDC contract (or that a named receiver of NEAR exists). See [Withdraw](../guides/withdraw.md).

EVM accounts leave through 1Click instead, because their destination is another chain. See [Money flows](./money-flows.md#exits).

### `add_public_key`: registering a NEAR wallet key

An EVM signature is enough to recover the signer's address, which is the account ID. A NEAR wallet signs with an ed25519 key, and a named NEAR account's keys live in the NEAR protocol, not in `intents.near`, so the Verifier can't check on its own that a key belongs to `alice.near`. So a NEAR account tells `intents.near` which keys may sign for it by calling `add_public_key` with its wallet key, once, in a regular NEAR transaction from the wallet (1 yoctoNEAR attached, 30 Tgas). The app does this the first time the account submits a signed intent: the wallet signs first, and if `has_public_key` shows the key isn't registered yet, the app asks for the registration transaction before relaying the intent. After that, every Setllend action from that account is a signed message like an EVM user's.

**Why:** it lets a NEAR account use the same gasless signed-message flow as an EVM wallet. The registration is the only NEAR Intents transaction a NEAR user pays gas for.

## What Setllend deliberately doesn't use

- **`token_diff`** (atomic multi-party swaps). Notes are records inside the Setllend contract, not tokens, so a note sale settles inside the contract in one fill.
- **`ft_withdraw` with a `msg`** to a contract. It is not refunded on failure, so Setllend's relayer never relays it.
- **Token minting on the ledger.** Notes aren't minted as Intents tokens; the contract tracks them as shares of a maturity's redemption pool. See [Zero-coupon notes](../concepts/zero-coupon-notes.md).

## Simulation before execution

`intents.near` has a free view method, `simulate_intents`, that takes the same input as `execute_intents` and reports what would happen without changing state. The relayer runs it on every signed payload first, so a bad signature, a used nonce, a passed deadline, or an insufficient balance is refused before any gas is spent. It doesn't run the receiving contract's `mt_on_transfer`, so the relayer also checks each Setllend `msg` and its tokens itself.

## Fees

The NEAR Intents protocol fee is 1 pip (0.0001%). The Setllend contract charges no fee of its own. 1Click fees on deposits and withdrawals are covered in [Money flows](./money-flows.md#fees).
