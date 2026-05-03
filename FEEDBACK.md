# Uniswap — Builder Feedback

WalletYeet uses Uniswap V3 SwapRouter02 on Sepolia for one specific job: dust-token auto-conversion inside a wallet migration. When a user opts into "auto-swap dust to USDC", the Planner agent finds a real V3 pool for each sub-$1 token and the swap happens inline inside the same EIP-7702 batched transaction, with the output going directly to the user's chosen destination wallet.

## What worked

The V3 Factory's `getPool(tokenA, tokenB, fee)` was exactly the right primitive. I probe all four fee tiers (100 / 500 / 3000 / 10000) against multiple USDC candidates in parallel — eight RPC reads per token, all parallelisable, and tokens with no pool at any tier gracefully downgrade to a plain transfer. Code: `dapp/lib/agents/planner.ts → findSwapPool()`.

`exactInputSingle.recipient` letting us route the swap output directly to the user's chosen destination wallet (rather than swap → vault → transfer) was the cleanest part of the integration. Single call, no intermediate hop, fits the multi-destination semantics of the rest of the migration. Code: `dapp/lib/batcher.ts → SWAP_AND_TRANSFER` case.

Sepolia's real LINK/USDC pool gave us a credible end-to-end demo without having to seed our own pool. The swap executes against actual liquidity, the destination wallet receives real USDC, the receipt has a normal `Swap` event from the V3 pool — all verifiable on Etherscan. That made the demo feel like a real integration rather than a mock.

## Friction

**Sepolia liquidity discovery.** There's no good way to know up front which (token, USDC variant, fee tier) combinations actually have liquidity on Sepolia. I had to write the grid-probe ourselves and find out empirically. A static "Sepolia liquid pools by fee tier" reference page in the docs (or even a community-maintained Notion) would have saved real time.

**SwapRouter02 ABI vs older docs.** Several V3 docs pages I landed on still showed the older SwapRouter (with the `deadline` parameter on `exactInputSingle`). It would help a lot if every code sample on a docs page made the router version explicit, ideally with SwapRouter02 as the default since that's what's actually deployed on most chains.

**No "find the best pool" helper.** Every dapp doing dust conversion is going to re-implement the same fee-tier × stablecoin grid scan. A one-call helper — given `(tokenIn, tokenOut)`, return the `(fee, address, liquidity)` with the most depth — would save hundreds of dapps from copy-pasting the same loop. Could live in the official SDK or as a Quoter extension.

**Slippage protection ergonomics.** I pass `amountOutMinimum: 0` for the demo because anything else would require a separate `Quoter` call before each swap, doubling the RPC cost per dust op. For a hackathon demo against thin Sepolia liquidity that's fine; for production it's MEV-vulnerable. A more ergonomic SDK helper that quotes-and-swaps with a default tolerance would lower the bar for safe production use.

## What I wished existed

A lightweight "best route" API that returns `(best fee tier, min-out at X% slippage, expected price impact)` in one call would unblock most of the friction above. Right now you either hardcode a fee tier (worse outcomes) or write the discovery loop yourself (boilerplate every project repeats).

Better Sepolia documentation generally. The canonical V3 Factory and SwapRouter02 addresses are easy enough to find, but there's no equivalent of "here are the pools you can actually trade against on testnet" for builders trying to integrate without first learning which mock liquidity is alive on which day.

## What I did not use

I did not integrate the Uniswap SDK, Quoter, Permit2, or Universal Router. SwapRouter02 + V3 Factory was sufficient for the dust-conversion use case and the alternatives looked like more setup than the hackathon timeline justified. I'd revisit Universal Router for a v2 with multi-hop routing for tokens that lack a direct USDC pool, and Permit2 for gasless approvals on the legacy fallback path.

## Net assessment

Uniswap V3 SwapRouter02 was the right primitive for what I needed: arbitrary-fee single-pool swaps with `recipient` routing. The integration was straightforward once I figured out which router to call and which fee tier had liquidity. Both of those discovery steps would benefit from better docs or tooling, but the core ABI is solid.

— Sonalika Sahoo, ETHGlobal Open Agents 2026
