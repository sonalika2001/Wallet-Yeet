// POST /api/uniswap/quote
//
// Lightweight wrapper around lib/adapters/uniswap.ts so the planner can
// fetch live dust→USDC quotes without exposing the Alchemy URL to the
// browser. Returns null when the Uniswap adapter is disabled.

import { NextRequest, NextResponse } from "next/server";
import { quoteDustSwap } from "@/lib/adapters/uniswap";

export const runtime = "nodejs";

interface QuoteRequest {
  tokenIn: `0x${string}`;
  amountIn: string;
}

export async function POST(req: NextRequest) {
  let body: QuoteRequest;
  try {
    body = (await req.json()) as QuoteRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tokenIn, amountIn } = body ?? {};
  if (!tokenIn || !/^0x[a-fA-F0-9]{40}$/.test(tokenIn)) {
    return NextResponse.json({ error: "Invalid tokenIn" }, { status: 400 });
  }
  let amount: bigint;
  try {
    amount = BigInt(amountIn);
  } catch {
    return NextResponse.json({ error: "Invalid amountIn" }, { status: 400 });
  }

  const quote = await quoteDustSwap(tokenIn, amount);
  return NextResponse.json({ quote });
}
