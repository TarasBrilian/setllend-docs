---
title: Verify the contract
description: Check that the code running at setllend.near is a reproducible build of a public commit, by reading its source metadata, rebuilding it, and comparing code hashes.
---

The Setllend contract on NEAR mainnet, `setllend.near`, was built reproducibly: the same source, built in the same Docker image, gives byte-identical wasm. The contract also says where its source is, following [NEP-330](https://github.com/near/NEPs/blob/master/neps/nep-0330.md). So you don't have to trust anyone's word about what runs on chain: read the metadata, rebuild from that commit, and compare the hash of your build with the code hash NEAR stores for the account.

| | |
|---|---|
| Contract | [`setllend.near`](https://nearblocks.io/address/setllend.near) |
| Deploy transaction | [`DgAcsj1cjT2TnrNNt4e2hAtHauBpdaN6CYovTKpfLkPn`](https://nearblocks.io/txns/DgAcsj1cjT2TnrNNt4e2hAtHauBpdaN6CYovTKpfLkPn) |
| Source commit | [`49fcc47`](https://github.com/TarasBrilian/setllend/tree/49fcc47e0167b7a7b4958078a3fedb07354bbd90) (`49fcc47e0167b7a7b4958078a3fedb07354bbd90`) |
| Build image | `sourcescan/cargo-near:0.22.0-rust-1.99.1`, digest `sha256:c9655eaf7436b90c87ea8b25739f91063032c5c30ba24cfeafe72c142943b5bb` |
| Code hash | `GsN51wYVvYPrjF9kinyJcssjxaWgdu6nEb5AZMA8oWkz` |
| Wasm SHA-256 (hex) | `ebc62adc0fe7cf095b3f86c1bccc5100a2cd6fb0d48005062185772c68e8b64b` |
| Wasm size | 432,033 bytes |

## 1. Read the source metadata

The contract's `contract_source_metadata` view returns the NEP-330 record that `cargo near` embedded at build time. It costs nothing and needs no account.

With [near-cli-rs](https://github.com/near/near-cli-rs):

```bash
near contract call-function as-read-only setllend.near contract_source_metadata json-args '{}' network-config mainnet now
```

With plain JSON-RPC (`args_base64` `e30=` is `{}`; the result comes back as a byte array, which the `python3` part turns into text):

```bash
curl -s https://free.rpc.fastnear.com -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": "1", "method": "query",
  "params": {"request_type": "call_function", "finality": "final",
             "account_id": "setllend.near", "method_name": "contract_source_metadata", "args_base64": "e30="}
}' | python3 -c 'import sys, json; print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'
```

Either returns:

```json
{
  "version": "0.1.0",
  "link": "https://github.com/TarasBrilian/setllend/tree/49fcc47e0167b7a7b4958078a3fedb07354bbd90",
  "standards": [{ "standard": "nep330", "version": "1.3.0" }],
  "build_info": {
    "build_environment": "sourcescan/cargo-near:0.22.0-rust-1.99.1@sha256:c9655eaf7436b90c87ea8b25739f91063032c5c30ba24cfeafe72c142943b5bb",
    "build_command": ["cargo", "near", "build", "non-reproducible-wasm", "--locked"],
    "contract_path": "contracts/setllend",
    "source_code_snapshot": "git+https://github.com/TarasBrilian/setllend?rev=49fcc47e0167b7a7b4958078a3fedb07354bbd90",
    "output_wasm_path": "/home/near/code/contracts/target/near/setllend/setllend.wasm"
  }
}
```

What the fields mean:

| Field | Meaning |
|---|---|
| `link`, `source_code_snapshot` | The repository and the exact commit the wasm was built from |
| `build_environment` | The Docker image, pinned by digest, that ran the build |
| `build_command` | The command run inside that image. `cargo near build reproducible-wasm` on your machine starts the image and runs this inside it |
| `contract_path` | The folder of the contract crate within the repository |
| `output_wasm_path` | Where the wasm was written inside the container (the repository is mounted at `/home/near/code`) |

## 2. Read the on-chain code hash

NEAR stores the hash of every account's code. Read it with `view_account`:

```bash
curl -s https://free.rpc.fastnear.com -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": "1", "method": "query",
  "params": {"request_type": "view_account", "finality": "final", "account_id": "setllend.near"}
}' | python3 -c 'import sys, json; print(json.load(sys.stdin)["result"]["code_hash"])'
```

```text
GsN51wYVvYPrjF9kinyJcssjxaWgdu6nEb5AZMA8oWkz
```

The code hash is the **base58 encoding of the SHA-256 of the wasm**. If the account ever got new code, this value would change.

You can also download the deployed wasm itself with `view_code` and hash it in step 4:

```bash
curl -s https://free.rpc.fastnear.com -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": "1", "method": "query",
  "params": {"request_type": "view_code", "finality": "final", "account_id": "setllend.near"}
}' | python3 -c 'import sys, json, base64; r = json.load(sys.stdin)["result"]; open("onchain.wasm", "wb").write(base64.b64decode(r["code_base64"])); print(r["hash"])'
```

This writes `onchain.wasm` (432,033 bytes) and prints the same hash.

## 3. Rebuild from source

You need [Docker](https://docs.docker.com/get-docker/) running, [rustup](https://rustup.rs), and [`cargo-near`](https://github.com/near/cargo-near) 0.22. The build itself runs inside the pinned image, so your local Rust version doesn't affect the output.

```bash
git clone https://github.com/TarasBrilian/setllend.git
cd setllend
git checkout 49fcc47e0167b7a7b4958078a3fedb07354bbd90
cd contracts/setllend
cargo near build reproducible-wasm
```

`cargo near` reads the image and its digest from `[package.metadata.near.reproducible_build]` in `contracts/setllend/Cargo.toml`, pulls the image, and builds with `--locked`, so dependency versions come from the committed `Cargo.lock`. It refuses to run in a git tree with uncommitted changes, so build from a fresh clone. The build takes a couple of minutes, plus the image download the first time.

The wasm is written to `contracts/target/near/setllend/setllend.wasm`.

## 4. Hash your build and compare

Compute the hash the way NEAR does, base58 of the SHA-256 of the file. This uses only the Python standard library:

```bash
python3 - contracts/target/near/setllend/setllend.wasm <<'EOF'
import hashlib, sys
data = open(sys.argv[1], "rb").read()
digest = hashlib.sha256(data).digest()
alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
n, out = int.from_bytes(digest, "big"), ""
while n:
    n, r = divmod(n, 58)
    out = alphabet[r] + out
out = "1" * (len(digest) - len(digest.lstrip(b"\0"))) + out
print(len(data), "bytes")
print("sha256 (hex):   ", digest.hex())
print("code hash (b58):", out)
EOF
```

Run it from the repository root (or pass another path, such as `onchain.wasm` from step 2). The build matches the deployed code when it prints:

```text
432033 bytes
sha256 (hex):    ebc62adc0fe7cf095b3f86c1bccc5100a2cd6fb0d48005062185772c68e8b64b
code hash (b58): GsN51wYVvYPrjF9kinyJcssjxaWgdu6nEb5AZMA8oWkz
```

For a quick check without the script, `shasum -a 256 contracts/target/near/setllend/setllend.wasm` (or `sha256sum`) prints the hex form, which must equal `ebc62adc0fe7cf095b3f86c1bccc5100a2cd6fb0d48005062185772c68e8b64b`. The base58 form is what NEAR shows as the code hash.

If you downloaded `onchain.wasm`, `cmp onchain.wasm contracts/target/near/setllend/setllend.wasm` prints nothing when the two files are identical.

## What this proves, and what it doesn't

A matching hash proves that the code running at `setllend.near` right now is exactly commit `49fcc47`, built with `near-sdk` 5.30.1 and Rust 1.99.1. You can read that source, its tests, and its history on GitHub.

It doesn't prove the code is correct, and it doesn't freeze it: `setllend.near` keeps a full-access key, so new code could be deployed later. Re-run step 2 at any time; a different code hash means different code. See [Trust model](../how-it-works/trust-model.md#the-contract-accounts-full-access-key).

To check the deployed configuration as well, call the `get_config`, `get_maturities`, and `get_collateral_tokens` views the same way as in step 1. See [Views](../developers/contract/views.md).
