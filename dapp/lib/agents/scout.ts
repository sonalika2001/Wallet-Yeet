// 🔍 Scout Agent — Discovery Specialist
//
// Responsibility: Discover all assets held by a wallet on-chain.
// Calls Alchemy SDK for tokens, NFTs, approvals; queries ENS for subnames;
// then asks GPT-4o-mini (via Microsoft Foundry / Azure OpenAI) to enrich
// the raw inventory with metadata (displayName, category,
// estimated_value_usd, migrate_recommended).

import type { DiscoveryInventory } from "../types";
import { hasServerKeys } from "../config";
import { MOCK_INVENTORY } from "../mockData";
import { AzureOpenAI } from "openai";
import { Alchemy, Network } from "alchemy-sdk";
import { fetchENSSubnames } from "../adapters/ens";

// Tiny safe-parser for the LLM's JSON response
function parseAndValidate<T>(content: string | null): T {
  if (!content) throw new Error("Empty LLM response");
  return JSON.parse(content) as T;
}

export async function runScoutAgent(wallet: string): Promise<DiscoveryInventory> {

  if (!hasServerKeys()) {
    // simulate latency so the agent pipeline UI animates nicely
    await new Promise((r) => setTimeout(r, 1200));
    return { ...MOCK_INVENTORY, wallet: wallet as `0x${string}` };
  }

  
  const oai = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT!, // "gpt-4o-mini"
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
  });

  const alchemy = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.ETH_SEPOLIA,
  });
  
  const approvals: unknown[] = [];

  const [tokens, nfts, ensSubnames] = await Promise.all([
    alchemy.core.getTokenBalances(wallet),
    alchemy.nft.getNftsForOwner(wallet),
    fetchENSSubnames(wallet),
  ]);
  
  const response = await oai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    max_tokens: 2048,
    temperature: 0,                              // deterministic JSON
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: `You are a wallet asset discovery specialist...
        Raw inventory: ${JSON.stringify({ tokens, nfts, approvals, ensSubnames })}
        Output strict JSON matching DiscoveryInventory schema in types.ts.`,
    }],
  });
  
  const parsed = parseAndValidate<DiscoveryInventory>(response.choices[0].message.content);
  return { ...parsed, wallet: wallet as `0x${string}` };
}
