---
title: "DApps — Decentralized Applications"
description: "Security review basics for decentralized apps: wallet signatures, exposed RPC endpoints, contract reentrancy, and frontend trust assumptions."
phase: Web
order: 27
tags:
  - dapps
  - web3
  - blockchain
  - smart-contracts
tools:
  - burp suite
  - browser devtools
updated: 2026-10-01
---

A DApp review runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: audit the frontend-to-wallet flow, exposed RPC, and on-chain calls, then demonstrate an issue on a testnet you own.

## 1. Fingerprint the stack

```bash
# Frontend and provider hints
curl -s -I "https://target.com/" | grep -i -E "server|x-powered-by"
curl -s "https://target.com/" | grep -ioE "window.ethereum|ethers|web3|wagmi|walletconnect" | sort -u

# Discover contract addresses and chain IDs in the bundle
curl -s "https://target.com/assets/index.js" | grep -oE "0x[a-fA-F0-9]{40}" | sort -u
curl -s "https://target.com/assets/index.js" | grep -oE "chainId[\"']?[: ]+[0-9]+"
```

## 2. Enumerate exposed RPC

```bash
# Probe common JSON-RPC methods against the app's provider
curl -s -X POST "https://rpc.target.com/" -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'

curl -s -X POST "https://rpc.target.com/" -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_accounts","params":[]}'

# Check for unlocked/admin methods that should be disabled
curl -s -X POST "https://rpc.target.com/" -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"personal_listAccounts","params":[]}'

curl -s -X POST "https://rpc.target.com/" -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"debug_traceTransaction","params":[]}'
```

## 3. Inspect wallet signature flows

Signature phishing is a frequent DApp issue: opaque `eth_sign` / `personal_sign` payloads or unbounded token approvals.

```bash
# With cast, decode what a signature request actually authorizes
cast wallet address --private-key "$PK"
cast sig "approve(address,uint256)"

# Read the current allowance a victim granted
cast call 0xTOKEN "allowance(address,address)(uint256)" 0xOWNER 0xSPENDER --rpc-url "$RPC"
```

Check the frontend for `signTypedData` with mismatched `domain.chainId` or `verifyingContract`, and for approvals set to `type(uint256).max`.

## 4. Review contract interactions

```bash
# Read contract metadata and bytecode
cast code 0xCONTRACT --rpc-url "$RPC" | head -c 120
cast call 0xCONTRACT "owner()(address)" --rpc-url "$RPC"
cast call 0xCONTRACT "paused()(bool)" --rpc-url "$RPC"

# Trace a suspicious transaction
cast run 0xTXHASH --rpc-url "$RPC" | head -50
```

Flag missing access control on privileged functions, unguarded `delegatecall`, and reentrancy where external calls precede state updates.

## 5. Check frontend trust boundaries

```bash
# Are contract addresses hardcoded or loaded from a mutable API?
curl -s "https://target.com/config.json" | jq .
curl -s "https://target.com/assets/index.js" | grep -oE "https?://[a-zA-Z0-9./-]+" | sort -u
```

A frontend that fetches the target address or ABI from an unauthenticated API can be swapped for a malicious contract.

## 6. Validate on a local fork

```bash
# Fork the chain so no real funds move
anvil --fork-url "$RPC" --fork-block-number 19000000

# Replay the interaction you suspect
cast call 0xCONTRACT "withdraw(uint256)" 1 --from 0xATTACKER --rpc-url http://127.0.0.1:8545
```

## Full pipeline

```bash
# 1. Fingerprint
curl -s -I "https://target.com/" | grep -i -E "server|x-powered-by"
curl -s "https://target.com/assets/index.js" | grep -oE "0x[a-fA-F0-9]{40}" | sort -u

# 2. Exposed RPC
curl -s -X POST "https://rpc.target.com/" -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"eth_accounts","params":[]}'
curl -s -X POST "https://rpc.target.com/" -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"personal_listAccounts","params":[]}'

# 3. Signature and allowance review
cast code 0xCONTRACT --rpc-url "$RPC" | head -c 120
cast call 0xTOKEN "allowance(address,address)(uint256)" 0xOWNER 0xSPENDER --rpc-url "$RPC"

# 4. Contract reads
cast call 0xCONTRACT "owner()(address)" --rpc-url "$RPC"
cast call 0xCONTRACT "paused()(bool)" --rpc-url "$RPC"

# 5. Frontend trust
curl -s "https://target.com/config.json" | jq .

# 6. Local fork validation
anvil --fork-url "$RPC" --fork-block-number 19000000
```

## Ethics & legality

- Only test contracts, RPC, and frontends within the authorized scope and on testnets.
- Never move mainnet funds or front-run real users; use local forks for exploits.
- Do not act on leaked private keys beyond reporting the exposure.
- Record transaction hashes, calldata, and fork traces as evidence.
