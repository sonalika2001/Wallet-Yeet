# WalletYeet

> Yeet your wallet. Three AI agents handle the rest.

> **AI usage disclaimer.** Anthropic's Claude was used as a coding assistant for parts of this project. AI-written contributions are either (a) committed under an AI-authored commit (e.g. project scaffolding, installation, generated boilerplate) or (b) marked inline with a `<Written by AI.>` annotation in the relevant file. Everything else is human-written.

## What is this?

WalletYeet is an AI-orchestrated wallet migration tool with **three specialized agents** working together: Scout discovers your assets, Auditor scores risks, Planner builds a safe migration plan. You stay in control — pick what migrates, choose multiple destinations, set your strategy. After a one-time approval per asset, a single bundled migration transaction does the rest, with transparent per-operation reporting.

## The Problem

Migrating an Ethereum wallet today is awful:
- Manually send each ERC-20 token (often dozens)
- Transfer NFTs one by one
- Forget to revoke risky approvals on the old wallet
- Lose ENS subnames to squatters
- Abandon dust tokens you can't afford to migrate
- Send everything to one wallet when you really want to split

It's tedious, error-prone, and incomplete. The result: stale wallets full of risky approvals, dust, and forgotten value.

## The Solution

```
1. Connect old wallet
2. Specify destination(s) — split assets across multiple wallets
3. Three AI agents work in parallel:
   🔍 Scout finds everything you own
   ⚠️ Auditor scores risks
   📋 Planner builds the safe migration sequence
4. You review and customize (per-asset selection, dust conversion toggle, scheduling)
5. Approve each asset, then sign the bundled migration transaction
6. Watch each operation execute, with transparent success/failure reporting
```

## Key Features

- **Three specialized AI agents** — Scout, Auditor, Planner each focused on one job
- **Multi-destination routing** — split assets across up to 5 wallets in one migration
- **Per-asset control** — keep what you want where you want it
- **Dust auto-conversion** — sub-$1 tokens get swapped to USDC via Uniswap (saves abandoned value)
- **ENS-aware** — properly migrates subnames and resolver settings
- **Batched execution** — every transfer bundled into one migration transaction, with transparent per-operation reporting (resilient: one weird asset doesn't break the whole migration)
- **Optional scheduling** — defer migration to when gas is cheap
- **Audit trail** — verifiable on-chain log of what moved when

## Why It Matters

- Wallet drainers exploit forgotten approvals on old wallets
- Lost ENS subnames get squatted by speculators
- Dust tokens get abandoned (worth more than gas to transfer individually)
- Most users migrate to one wallet because splitting is too painful

WalletYeet is the first crypto **reorganization** tool, not just a migration tool.

## Tech Stack

- **Smart Contracts**: Solidity / Foundry
- **Frontend**: Next.js + TypeScript + wagmi + viem
- **AI Agents**: Anthropic Claude (Scout/Auditor/Planner pipeline)
- **Asset Discovery**: Alchemy SDK
- **Execution Layer**: KeeperHub (MCP server, retry logic, MEV protection)
- **DEX Routing**: Uniswap V3 Universal Router (dust auto-conversion)
- **Identity Layer**: ENS (subname migration as first-class feature)
- **Hosting**: Vercel (single deployment for frontend + agent APIs)
- **Network**: Sepolia testnet

## Architecture (High Level)

```
User → Frontend → Three Agents (Scout/Auditor/Planner)
                       ↓
                  Migration Plan
                       ↓
                User Customizes
                       ↓
                  KeeperHub MCP (retry, MEV protect, optional schedule)
                       ↓
                MigrationVault.sol (Sepolia)
                  • ERC-20/721/1155 transfers
                  • Approval revocations
                  • ENS subname transfers
                  • Uniswap dust conversions
```

## Gas Optimization

The biggest gas optimization in WalletYeet is the architecture itself: instead of N separate transfer transactions, the migration runs as **one batched `executeMigration` call**. For a typical demo wallet with 12 assets:

| Path | Total gas | Transactions |
|---|---|---|
| Manual (12 separate transfers) | ~1,090,000 | 12 |
| WalletYeet (one `executeMigration`) | ~680,000 | 1 |

**~410,000 gas saved**, almost entirely from skipping the per-tx 21,000-gas base cost twelve times. Plus: one mempool entry, one nonce, one confirmation to wait for instead of twelve.

Also baked into the v1 contract:

- `immutable` state variables for router/registry addresses (~3 gas per read vs ~2,100 for storage)
- `calldata` operations array (no memory copy)
- Per-operation `try/catch` so one failing asset doesn't waste the gas of the rest
- No separate audit-log contract call — events emit directly from the vault

For mainnet, the bigger wins live in the roadmap:

- **EIP-7702** to bundle the prerequisite approvals into the same transaction — saves another ~900,000 gas per migration (~13 approval txs each avoiding 21k base + ~50k for `approve`)
- **L2 deployment** (Base, Arbitrum, Optimism) for the same gas units at 10–100× cheaper real cost
- **EIP-2612 `permit()`** to convert ERC-20 approvals from on-chain txs into free off-chain typed-data signatures
- **Gas-aware dust threshold** — only swap dust when its value exceeds the gas cost (avoids the mainnet trap of paying $20 in gas to swap $0.40 of dust)

Sepolia gas is free, so the v1 demo doesn't *need* these optimizations — but the architecture is set up so they slot in cleanly when targeting mainnet.

## Status

🚧 In development for ETHGlobal Open Agents Hackathon (April 24 - May 3, 2026)

## License

MIT
