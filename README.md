# WalletYeet

> Yeet your wallet — AI agents discover, audit, plan; you route, we yeet.

> **AI usage disclaimer.** AI-written contributions are either (a) committed under an AI-authored commit (project scaffolding, generated boilerplate) or (b) marked inline with a `<Written by AI.>` annotation in the relevant file. Everything else is human-written.

## What is this?

WalletYeet is an AI-orchestrated wallet migration tool with **three specialized agents** plus **EIP-7702 single-signature execution**: Scout discovers your assets, Auditor scores risks, Planner builds a safe migration plan. You stay in control — pick what migrates, choose multiple destinations, decide which dust to swap. One signature in MetaMask executes the entire batched migration. Per-operation reporting means partial failures (one weird token, a wrapped-vs-unwrapped ENS mismatch) don't kill the rest.

## The Problem

Migrating an Ethereum wallet today is awful:
- Manually send each ERC-20 token (often dozens)
- Transfer NFTs one by one
- Lose ENS subnames or fail wrapped-vs-unwrapped transfer
- Abandon dust tokens you can't afford to migrate
- Leave native ETH behind because the manual flow is exhausting
- Send everything to one wallet when you really want to split

It's tedious, error-prone, and incomplete. The result: stale wallets full of dust and forgotten value.

## The Solution

```
1. Connect old wallet
2. Specify destinations — split assets across multiple wallets
3. Three AI agents stream their progress live:
   🔍 Scout finds tokens, NFTs, ENS subnames, native ETH
   ⚠️ Auditor scores risk, flags dust, identifies unmigratable items
   📋 Planner sequences ops + discovers Uniswap pools at any fee tier
4. You review and customize per-asset (toggle off, override destination)
5. One signature — MetaMask handles the EIP-7702 batched execution
6. Watch each sub-call land on Etherscan, with per-op success reporting
```

## Key Features

### Agent pipeline
- **Three GPT-4o-mini agents** (Microsoft Foundry Azure deployment) running sequentially with strict JSON-schema prompts. Each agent's structural output is built deterministically in TypeScript; the LLM only writes user-facing strings (riskReason, op explanations, plan summary). This means the "5 ops" count can never disagree with what the contract actually executes.
- **SSE-streamed progress** — each agent emits live phase events as it works (`Fetching ERC-20 balances from Alchemy…`, `Calling GPT-4o-mini for risk reasons…`, `Verifying Uniswap V3 pool existence for any dust swaps…`). The agents page reflects what's happening server-side, not a fake animated timeline.
- **Real per-agent telemetry** — wall-clock duration, model identifier (`gpt-4o-mini@azure`), and structured highlight pills shown on each card.
- **ENS-verified agent identity** — `scout/auditor/planner.walletyeet-demo.eth` resolve to a deployer-owned wallet with text records (`description`, `ai.model`, `ai.role`). The agents page shows a green ✓ verified badge when the on-chain lookup succeeds.

### Asset discovery
- **Auto-discovery of any ERC-20** — Scout fetches balances via Alchemy and resolves name/symbol/decimals via `alchemy_getTokenMetadata` for any token the curated list doesn't recognize. Faucet anything to the demo wallet and it shows up automatically.
- **Native ETH with dynamic gas reserve** — Scout fetches both balance and current gas price; the reserve is sized live as `1.5M gas × current price × 1.5 safety` (with a 0.001 ETH floor to protect against spikes between Scout time and signing time). The asset card shows the exact amount being held back.
- **Wrapped ENS subname support** — NameWrapper ERC-1155 tokens are detected and routed via `safeTransferFrom` instead of the registry's `setOwner`. Includes on-chain `NameWrapper.names()` lookup so subnames get a readable label even when Alchemy's NFT response leaves the `name` field empty.
### Multi-destination + dust
- **Multi-destination routing** — split assets across up to 5 wallets in one migration. Each row in the customize step has its own dropdown.
- **Dust = real economic definition** — only tokens with a curated price under $1 are tagged "Dust" in the UI.
- **Unknown tokens have their own toggle** — separate from dust, so users explicitly opt into swapping arbitrary tokens that have no price oracle. Off by default to avoid surprise swaps of valuable holdings.
- **Multi-fee-tier pool discovery** — Planner probes every Uniswap V3 fee tier (`0.01% / 0.05% / 0.30% / 1%`) × every USDC candidate (Circle's testnet USDC + seeded mock) in parallel. Picks the first pool with liquidity. Tokens with no pool gracefully downgrade to a plain transfer rather than reverting the whole batch.
- **Live plan summary** — toggle a row off and the plan summary updates immediately (deterministic count from the live op array, not a stale LLM string).

### EIP-7702 single-signature execution
- **One signature for everything** — under the hood we use `wallet_sendCalls` (EIP-5792) which delegates the user's EOA to a tiny `Batcher` contract via EIP-7702 for one transaction. No per-asset approvals required: every transfer / swap runs with `msg.sender == userEOA`, so plain `transfer`, `safeTransferFrom`, `setOwner`, etc. work directly.
- **Legacy fallback always available** — if a wallet doesn't support 7702, a one-click toggle switches to the original approve-then-vault flow. Same demo, multi-sig path, ~7-14 signatures, never blocked.
- **Honest partial-failure reporting** — per-call receipts decoded from the tx, displayed as ✓ / ✕ rows with a contextual hint (`Reverted on Uniswap router — no V3 pool for this token pair`).

## Why It Matters

- Lost ENS subnames get squatted by speculators
- Dust tokens get abandoned (worth more than gas to transfer individually on mainnet)
- Native ETH gets left behind because users forget to manually sweep it
- Most users migrate to one wallet because splitting is too painful

WalletYeet is the first crypto **reorganization** tool, not just a migration tool — multi-asset, multi-destination, single-signature, with AI doing the discovery and planning grunt work.

## Tech Stack

| Layer | Tech |
|---|---|
| Smart Contracts | Solidity 0.8.20 / Foundry — `MigrationVault.sol` (legacy multi-sig path) + `Batcher.sol` (EIP-7702 delegate) |
| Frontend | Next.js 14 App Router + TypeScript + wagmi v2 + viem v2 + RainbowKit |
| Agents | GPT-4o-mini via Microsoft Foundry (Azure OpenAI) — `openai` SDK with retry helper |
| Asset Discovery | Alchemy JSON-RPC (`alchemy_getTokenBalances`, `alchemy_getTokenMetadata`) + Alchemy NFT v3 + on-chain `NameWrapper.names()` |
| DEX | Uniswap V3 SwapRouter02 (Sepolia: `0x3bFA47…e48E`); pool discovery via V3 Factory `getPool` across all 4 fee tiers |
| Identity | ENS (Sepolia registry + NameWrapper); subnames + text records resolved on-chain via viem |
| Orchestration | Server-Sent Events from Next.js API route; per-agent timing + output samples + ENS identities streamed live |
| Hosting | Vercel (single deployment for frontend + agent APIs) |
| Network | Sepolia testnet |

## Architecture (High Level)

```
User → Next.js Frontend
            │
            │ POST /api/orchestrate (SSE)
            ▼
       ┌────────────┐ ┌─────────────┐ ┌─────────────┐
       │ 🔍 Scout   │→│ ⚠️ Auditor  │→│ 📋 Planner  │  (each emits live phase events)
       │ Alchemy    │ │ deterministic│ │ pool grid    │
       │ + GPT      │ │ + GPT polish │ │ search       │
       └────────────┘ └─────────────┘ └─────────────┘
            │                  │              │
            └──────────────────┴──────────────┘
                              │
                              ▼  Migration plan + per-agent identity/timing
                      User customizes assets/routes
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
    EIP-7702 path (default)           Legacy fallback (toggle)
    walletClient.sendCalls            Per-asset approvals
            │                                   │
            ▼                                   ▼
    User EOA delegates to              MigrationVault.sol
    Batcher.sol for ONE tx             executeMigration([])
            │                                   │
            └──────────┬────────────────────────┘
                       ▼
        ┌─────────────────────────────┐
        │ All operations land:        │
        │  • Native ETH transfers     │
        │  • ERC-20/721/1155 transfers│
        │  • ENS (registry OR Wrapper)│
        │  • Uniswap V3 dust swaps    │
        │ Per-op events emitted       │
        └─────────────────────────────┘
```

## Decisions we weighed

A short tour of the load-bearing tradeoffs we made and why:

| Decision | What we picked | What we rejected | Why |
|---|---|---|---|
| **Atomicity** | Batched-with-reporting (try/catch per op, success/failure events) | True all-or-nothing atomic | Real wallets have rebasing tokens, fee-on-transfer ERC-20s, wrapped-vs-unwrapped ENS. One bad asset shouldn't revert a 50-asset migration. |
| **LLM authority** | Deterministic structure + LLM-polished strings | LLM owns the operation list and counts | LLMs hallucinate counts. We caught GPT producing "5 ops" when there were really 11. Now structure is built in TypeScript; the LLM only writes the prose. |
| **EIP-7702 API** | `walletClient.sendCalls` (EIP-5792) | `walletClient.signAuthorization` directly | viem's `signAuthorization` only works with local accounts. MetaMask is a JSON-RPC account. EIP-5792 is the right user-facing API; it uses 7702 internally. |
| **Dust definition** | Curated price < $1 OR (unknown token + opt-in toggle) | Balance-magnitude heuristic ("< 100 of anything = dust") | Treating 1000 LINK as dust would be wrong. Two clean categories with separate user toggles is more honest than one fuzzy heuristic. |
| **Pool discovery** | Probe every (USDC candidate × every fee tier) in parallel, downgrade to plain transfer on no-pool | Hardcoded 0.30% fee tier | Sepolia liquidity is patchy. Multi-tier search means LINK swap finds 0.05% pool; mock dust gracefully transfers when no pool exists. |
| **Gas reserve for native ETH** | Live gas price × 1.5M gas × 1.5 safety, with 0.001 ETH floor | Hardcoded 0.01 ETH | Quiet day → reserve 0.001 ETH (10× more transferred). Busy day → reserve scales up automatically. The asset card shows the actual reserve. |
| **ENS subname discovery** | Alchemy NFT API (NameWrapper tokens) + on-chain `NameWrapper.names()` for missing labels | The Graph hosted ENS subgraph | The Graph deprecated their hosted service mid-2024 and the URL silently returns empty data. Alchemy + on-chain reads is reliable. |
| **Wrapped ENS transfers** | Reuse existing `TRANSFER_ERC1155` opcode against NameWrapper | Add a separate `ENS_WRAPPED_TRANSFER` op | NameWrapper is ERC-1155 under the hood. Reusing the opcode means no contract change AND both 7702 + legacy paths handle it without special-cased code. |
| **Strategy presets** | Removed (just default to "balanced") | Conservative / Balanced / Aggressive | The presets only affected an LLM prompt string, not real behavior. Per-asset toggles + multi-destination routing already give users full control. |

## Sponsor Integrations

| Sponsor | Status | What's actually shipped |
|---|---|---|
| **Uniswap V3** | ✅ Working | Real Sepolia LINK → real Sepolia USDC swap via V3 SwapRouter02. Multi-fee-tier pool discovery via factory `getPool`. See `FEEDBACK.md`. |
| **ENS** | ✅ Working | Agent identity (scout/auditor/planner subnames with text records — qualifies for "ENS for AI Agents" track). Wrapped subname discovery + transfer (NameWrapper ERC-1155). |

## Gas Optimization

The biggest win in WalletYeet is the architecture itself: instead of N separate user-signed transactions, the entire migration runs in **one EIP-7702 batched transaction**. For a typical demo wallet with 12 assets:

| Path | Total gas | User signatures |
|---|---|---|
| Manual (12 separate transfers) | ~1,090,000 | 12 |
| WalletYeet legacy (per-asset approve + vault batch) | ~720,000 | 7-14 (per-asset approves + vault) |
| **WalletYeet EIP-7702** | **~660,000** | **1** |

Plus baked into the contracts:
- `immutable` state for router/registry/USDC addresses
- `calldata` operations array (no memory copy)
- Per-operation `try/catch` so one failing asset doesn't waste the rest's gas
- No separate audit-log contract call — events emit directly from the vault and Batcher

These are some additional wins scoped for the future:
- **EIP-2612 `permit()`** for tokens that support it (real USDC, DAI) — converts approvals into free off-chain signatures
- **L2 deployment** (Base, Arbitrum, Optimism) for the same gas units at 10–100× cheaper real cost
- **Gas-aware dust threshold** — only swap dust when its value exceeds the gas cost (avoids paying $20 in gas to swap $0.40 of dust)
- **Multi-chain support** — same UI, picks the chain dropdown to migrate per-network

## Status

✅ Built for ETHGlobal Open Agents Hackathon (April 24 - May 3, 2026). Live on Sepolia.

## License

MIT
