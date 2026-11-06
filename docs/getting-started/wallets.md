---
title: Wallets and accounts
description: How EVM wallets and NEAR wallets work with Setllend, what each one signs and pays for, and how to switch between them.
---

Setllend works with two kinds of wallets: any **EVM wallet** (MetaMask, Rabby, and other browser wallets) and **NEAR wallets** (Meteor, MyNearWallet, Intear). Each wallet is its own Setllend account, with its own Intents balance, orders, loans, and notes. This page explains what each kind signs, what it pays for, and what to watch out for.

## Your account is an Intents account

Setllend keeps no balances of its own for you. Your funds sit in your **Intents balance**: your entry on the `intents.near` ledger, the shared multi-token ledger of NEAR Intents. Setllend's orders, loans, and notes are keyed to the same account ID.

You act by signing an **intent**: a JSON message that says, for example, "transfer 1,000 USDC from my Intents balance to `setllend.near` with this lend order". `intents.near` checks your signature and executes it. Setllend's relayer submits the signed message and pays the NEAR gas, so you never send a NEAR transaction for an order. See [NEAR Intents](../how-it-works/near-intents.md) for the mechanics.

| | EVM account | NEAR account |
|---|---|---|
| Wallets | Any browser wallet the app finds (MetaMask, Rabby, others) | Meteor, MyNearWallet, Intear |
| Account ID on `intents.near` | Your `0x` address in lowercase | Your NEAR account ID (`alice.near`, or a 64-character implicit account) |
| How it signs | `personal_sign` (ERC-191) | `signMessage` (NEP-413) |
| Setup | None | Register your key on NEAR Intents once (one NEAR transaction), unless it is an implicit account |
| Needs NEAR tokens | Never | Yes, about 0.15 NEAR on hand for the transactions you send yourself |
| Deposit from | Arbitrum or Base through 1Click (or from a NEAR wallet, see below) | NEAR directly, or Arbitrum or Base through 1Click |
| Withdraw to | Arbitrum or Base through 1Click | Your NEAR account directly, or Arbitrum or Base through 1Click |

## EVM accounts

### Connecting

Click **Connect** and pick your wallet under **EVM wallet**. The app finds every installed browser wallet through EIP-6963, the standard that lets several wallets announce themselves side by side, so there is no fixed list. If none appears, the menu says "Looking for EVM wallets. If none appear, install MetaMask, Rabby, or another browser wallet." The app connects to injected browser wallets only; it does not offer WalletConnect or other QR-code connections.

Once connected, the button shows the chain (Arbitrum or Base) and your short address. The app uses these two chains; the menu offers **Switch to Base** or **Switch to Arbitrum**.

### Your account ID

Your Setllend account is the **implicit Eth account** on `intents.near`: your `0x` address, written in lowercase. It exists without any registration. **Copy address** in the account menu copies it.

### What you sign

Every action asks your wallet to sign a message with `personal_sign`. The wallet shows the message text: a JSON object naming you as `signer_id`, `intents.near` as `verifying_contract`, a `deadline` 10 minutes ahead, a one-time `nonce`, and the `intents` to run. A lend order looks like this:

```json
{
  "signer_id": "0xabc…",
  "verifying_contract": "intents.near",
  "deadline": "2026-11-10T00:00:00.000Z",
  "nonce": "<base64 one-time nonce>",
  "intents": [
    {
      "intent": "transfer",
      "receiver_id": "setllend.near",
      "tokens": {"nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "1000000000"},
      "msg": "{\"action\":\"lend\",\"data\":{\"maturity\":\"1795766400000000000\",\"min_rate_bps\":700,\"expires_at\":null}}"
    }
  ]
}
```

This one moves 1,000 USDC (amounts are in base units, 6 decimals for USDC) into a lend order at a minimum of 7.00% APR. A signature is not a transaction: nothing happens until the relayer submits it, and the nonce makes it usable only once. Developers can find the full format in [Signing intents](../developers/signing-intents.mdx).

### What you pay

- **Nothing on NEAR.** You never hold NEAR tokens and never pay NEAR gas.
- **Your own deposit transfer** on Arbitrum or Base: when you deposit, your wallet sends ETH or USDC to a 1Click deposit address on that chain, and you pay that chain's gas.
- **1Click fees** on deposits and withdrawals, shown in the form before you confirm. See [Deposit](../guides/deposit.md#fees-and-timing).

## NEAR accounts

### Connecting

Click **Connect** and pick **Meteor**, **MyNearWallet**, or **Intear** under **NEAR wallet**. The button then shows your account ID; **Copy account ID** copies it.

### Register your key on NEAR Intents (once)

`intents.near` accepts a NEAR account's signature only from a key registered for that account on `intents.near`. The first time you sign any action, the steps include **Register your key on NEAR Intents (first time only)**: one NEAR transaction from your wallet that calls `add_public_key` on `intents.near`, with 1 yoctoNEAR attached and 30 Tgas of gas. It costs a fraction of a cent in gas. After that, the step is skipped.

- An **implicit account** (64 hex characters) never needs it: `intents.near` already accepts the account's own key.
- Registration is per key. If you later sign from another device or wallet that uses a different key for the same account, that key is registered the same way on its first action.

### What you sign

Actions are signed with `signMessage` (NEP-413) in your wallet's popup or extension. The message holds the same `signer_id`, `deadline`, and `intents` as above, with `intents.near` as the recipient.

### What you pay

A NEAR account sends a few NEAR transactions itself, and pays their gas:

| Transaction | When | Attached |
|---|---|---|
| Key registration (`add_public_key` on `intents.near`) | Once, before the first signed action | 1 yoctoNEAR |
| Deposit NEAR (`near_deposit` and `ft_transfer_call` on `wrap.near`) | Each deposit of NEAR | The NEAR deposited, plus 0.00125 NEAR the first time for storage on `wrap.near` |
| Deposit USDC (`ft_transfer_call` on the USDC contract) | Each deposit of USDC from the NEAR account | 1 yoctoNEAR |
| Register on USDC (`storage_deposit` on the USDC contract) | Once, before the first USDC withdrawal to the NEAR account | 0.00125 NEAR |

Orders, cancels, repayments, redemptions, and withdrawals to your NEAR account are signed messages that the relayer submits, so they cost you nothing.

### Keep about 0.15 NEAR for gas

:::warning
Keep about **0.15 NEAR** in your NEAR account beyond what you deposit.
:::

NEAR refuses a transaction unless the sender holds enough to pay for **all of its prepaid gas** at the minimum gas price (0.001 NEAR per Tgas), even though the gas actually burnt is far less and the rest is refunded. A NEAR deposit attaches up to 120 Tgas, so it needs about 0.12 NEAR on hand while the gas it actually burns costs far less. If you deposit your whole balance, the transaction fails with `NotEnoughBalance` before it runs. Your wallet usually shows this as an error; nothing is lost.

### An implicit account that isn't on chain yet

An implicit NEAR account exists on chain only once it has received NEAR. Until then it can sign intents but cannot send transactions, so the **Register on USDC** step stops with: "Your NEAR account doesn't exist on chain yet. Withdraw some NEAR to it first, which creates it, then try again." Withdrawing NEAR to the account (see [Withdraw](../guides/withdraw.md)) creates it.

## Using both, and switching

You can connect an EVM wallet and a NEAR wallet at the same time. They stay **separate accounts**: funds, orders, and loans of one are not visible to the other. The last one you connected is the active one, and the app remembers your choice on reload.

- To switch, open the account menu and click **Use NEAR account …** or **Use EVM wallet …**.
- **Disconnect** in the same menu disconnects the active wallet and falls back to the other if it is connected.

An EVM account can also **deposit from NEAR**: in the Deposit modal, choose **From: NEAR** and connect a NEAR wallet there. That wallet only signs the deposit transaction and pays for it; the funds are credited to the active EVM account, which stays active.

## What "gasless" means here

- **Orders and account actions are gasless for every account.** You sign a message; Setllend's relayer submits it to `intents.near` with `execute_intents` and pays the NEAR gas. The form says so under the submit button: "Your wallet signs. Setllend's relayer pays the gas."
- **Gasless does not mean free of all costs.** Moving money between chains goes through 1Click, which charges a small fee, and an EVM deposit is a normal transfer on Arbitrum or Base that your wallet pays gas for. A NEAR account pays gas for the few NEAR transactions listed above.
- **The relayer is a convenience, not a gatekeeper.** It only submits what you signed and cannot change it. Anyone can submit a signed intent to `intents.near` directly. See the [trust model](../how-it-works/trust-model.md).
