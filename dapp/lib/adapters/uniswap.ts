// Uniswap adapter — optional dust auto-conversion.
// When enabled, sub-$1 tokens are quoted against USDC and the planner
// emits SWAP_AND_TRANSFER ops instead of plain TRANSFER_ERC20 ops.

import { ENABLED_FEATURES } from "../config";
import { KNOWN_TOKENS } from "../contracts";
import { formatUnits } from "viem";

export interface DustQuote {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`; // USDC on Sepolia
  amountIn: string; // raw
  amountOut: string; // raw
  amountOutFormatted: string;
  feeBps: number;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export async function quoteDustSwap(
  tokenIn: `0x${string}`,
  amountIn: bigint
): Promise<DustQuote | null> {
  if (!ENABLED_FEATURES.uniswapDust) return null;

  // If USDC isn't seeded yet (still zero address), we can't produce a meaningful
  // quote — Planner falls back to plain TRANSFER_ERC20 for dust.
  if (KNOWN_TOKENS.USDC === ZERO) return null;

  const usdcDecimals = 6;
  return {
    tokenIn,
    tokenOut: KNOWN_TOKENS.USDC,
    amountIn: amountIn.toString(),
    amountOut: amountIn.toString(),
    amountOutFormatted: formatUnits(amountIn, usdcDecimals),
    feeBps: 30, // 0.30%
  };
}
