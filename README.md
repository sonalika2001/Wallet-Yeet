# WalletYeet

> Yeet your wallet. Three AI agents handle the rest.

## What is this?

WalletYeet is an AI-orchestrated wallet migration tool with **three specialized agents** working together: Scout discovers your assets, Auditor scores risks, Planner builds a safe migration plan. You stay in control — pick what migrates, choose multiple destinations, set your strategy. One signature, one transaction, with transparent per-operation reporting.

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
5. Sign one transaction
6. Watch each operation execute, with transparent success/failure reporting
```

## Key Features

- **Three specialized AI agents** — Scout, Auditor, Planner each focused on one job
- **Multi-destination routing** — split assets across up to 5 wallets in one migration
- **Per-asset control** — keep what you want where you want it
- **Dust auto-conversion** — sub-$1 tokens get swapped to USDC via Uniswap (saves abandoned value)
- **ENS-aware** — properly migrates subnames and resolver settings
- **Batched execution** — one signature, one transaction, with transparent per-operation reporting (resilient: one weird asset doesn't break the whole migration)
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

## Status

🚧 In development for ETHGlobal Open Agents Hackathon (April 24 - May 3, 2026)

## License

MIT
