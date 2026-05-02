// 🔍 Scout Agent — Discovery Specialist
//
// Responsibility: Discover all assets held by a wallet on-chain, then ask
// GPT-4o-mini (via Microsoft Foundry) to enrich each asset with a friendlier
// display name, a category guess (stablecoin / governance / memecoin /
// utility / spam), and a `migrateRecommended` flag for obvious scam tokens.
//
// Architecture: deterministic fetch + shape FIRST (so the schema is
// guaranteed), then LLM annotates the already-shaped Asset[]. The LLM never
// owns the structure — it can only refine fields. If it fails or returns
// malformed JSON, we fall back to the deterministic baseline.

import type { Asset, AssetCategory, DiscoveryInventory } from "../types";
import { hasServerKeys } from "../config";
import { MOCK_INVENTORY } from "../mockData";
import { fetchENSSubnames } from "../adapters/ens";
import { discoverApprovals } from "../adapters/approvals";
import { KNOWN_TOKENS, KNOWN_NFT_COLLECTIONS } from "../contracts";
import { createPublicClient, formatUnits, http } from "viem";
import { sepolia } from "viem/chains";
import { AzureOpenAI } from "openai";
import { withRetry } from "./retry";

// Curated metadata for tokens we want to render with specific names/values.
// Anything NOT listed here is auto-discovered via alchemy_getTokenMetadata
// and surfaced as a regular "token" asset with NO price (estimatedValueUsd
// undefined) — the user opts into swapping unknowns explicitly via the
// "Auto-swap unknown tokens" checkbox on the destinations step.
const DEMO_TOKEN_META: Record<
  string,
  { symbol: string; decimals: number; pricePerToken: number; displayName: string }
> = {
  USDC: { symbol: "USDC", decimals: 6, pricePerToken: 1, displayName: "Mock USDC" },
  USDC_REAL: { symbol: "USDC", decimals: 6, pricePerToken: 1, displayName: "USD Coin" },
  SHIB_PEPE: { symbol: "SHIB-PEPE", decimals: 18, pricePerToken: 0.00001, displayName: "SHIB-PEPE" },
  GOV: { symbol: "GOV", decimals: 18, pricePerToken: 0.5, displayName: "Governance" },
  // Sepolia LINK doesn't have a meaningful testnet price; we tune it low
  // so any plausible faucet drip (a few LINK) reads as sub-$1 dust and
  // surfaces the SWAP_AND_TRANSFER path. Real Uniswap V3 pools exist
  // (LINK/USDC at multiple fee tiers) so the swap actually executes.
  LINK: { symbol: "LINK", decimals: 18, pricePerToken: 0.001, displayName: "Sepolia LINK" },
};

// Reverse lookup: known contract address → curated metadata key. Only the
// hand-curated tokens above are mapped here. Unknowns flow through
// `fetchTokenMetadata` at runtime.
const ADDR_TO_KEY: Record<string, keyof typeof DEMO_TOKEN_META> = (() => {
  const map: Record<string, keyof typeof DEMO_TOKEN_META> = {};
  for (const [k, addr] of Object.entries(KNOWN_TOKENS)) {
    if (k in DEMO_TOKEN_META) {
      map[addr.toLowerCase()] = k as keyof typeof DEMO_TOKEN_META;
    }
  }
  return map;
})();

// Reverse lookup for NFT collections: address → human-readable name.
const NFT_ADDR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_NFT_COLLECTIONS).map(([k, addr]) => [addr.toLowerCase(), k])
);

// Direct fetch to Alchemy JSON-RPC. We avoid alchemy-sdk because its bundled
// @ethersproject/web sets `referrer: "client"`, which Node undici rejects.
async function fetchTokenBalances(wallet: string): Promise<{ contractAddress: string; tokenBalance: string }[]> {
  const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getTokenBalances",
      params: [wallet, "erc20"],
    }),
  });
  if (!res.ok) throw new Error(`alchemy_getTokenBalances ${res.status}`);
  const json = await res.json();
  return json.result?.tokenBalances ?? [];
}

/** Native gas-asset balance via eth_getBalance — needed because
 *  alchemy_getTokenBalances only returns ERC-20s. Returns wei as bigint. */
async function fetchNativeBalance(wallet: string): Promise<bigint> {
  const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [wallet, "latest"],
      }),
    });
    if (!res.ok) return 0n;
    const json = await res.json();
    return json.result ? BigInt(json.result) : 0n;
  } catch {
    return 0n;
  }
}

/** Current Sepolia gas price (wei/gas) via eth_gasPrice. We use this to
 *  size the native ETH gas reserve dynamically — Sepolia gas can swing
 *  between sub-gwei and 5+ gwei depending on the day, and a fixed reserve
 *  either over-holds (boring days) or under-holds (busy days). */
async function fetchGasPrice(): Promise<bigint> {
  const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_gasPrice",
        params: [],
      }),
    });
    if (!res.ok) return 2_000_000_000n; // 2 gwei fallback
    const json = await res.json();
    return json.result ? BigInt(json.result) : 2_000_000_000n;
  } catch {
    return 2_000_000_000n;
  }
}

/** Conservative budget for the entire migration tx. Covers a fat batched
 *  EIP-7702 tx with ~10 sub-calls (transfers + swaps + revocations + ENS).
 *  Multiplied by current gas price + a 1.5x safety factor at runtime. */
const ESTIMATED_BATCH_GAS = 1_500_000n;
const GAS_RESERVE_SAFETY_NUMERATOR = 15n;
const GAS_RESERVE_SAFETY_DENOMINATOR = 10n;

/** Floor — never reserve less than this even if the chain is dirt-cheap.
 *  Protects against (a) a sudden spike between Scout running and the user
 *  actually clicking YEET (gas can move 10x in a minute), and (b) MetaMask
 *  refusing the tx because it can't fit gas into the leftover balance
 *  after a large native-ETH transfer. 0.01 ETH is a safe headroom for any
 *  realistic ~15-call batch on Sepolia. */
const GAS_RESERVE_FLOOR_WEI = 10_000_000_000_000_000n; // 0.01 ETH

interface AlchemyTokenMeta {
  decimals: number | null;
  logo: string | null;
  name: string | null;
  symbol: string | null;
}

/**
 * Fetch metadata (name/symbol/decimals) for an ERC-20 from Alchemy. Returns
 * null if the token has no metadata or if the call fails — the caller falls
 * back to "Unknown Token" with 18 decimals in that case.
 */
async function fetchTokenMetadata(address: string): Promise<AlchemyTokenMeta | null> {
  const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenMetadata",
        params: [address],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ?? null;
  } catch {
    return null;
  }
}

interface AlchemyNft {
  contract: { address: string; name?: string; symbol?: string };
  tokenId: string;
  /** Alchemy NFT v3 sets this to "ERC721" or "ERC1155". For ENS, ERC1155
   *  means the name lives in the NameWrapper (i.e. it's a wrapped name). */
  tokenType?: string;
  name?: string;
  image?: { cachedUrl?: string; thumbnailUrl?: string; originalUrl?: string };
}

// ENS names are ERC-1155 (NameWrapper) or ERC-721 (BaseRegistrar) under the
// hood, so `getNFTsForOwner` returns them. We split them out from the NFT
// bucket and route them to ENS instead — this is more reliable than the
// (now-deprecated) ENS subgraph for discovering owned subnames.
function isEnsNft(nft: { contract: { symbol?: string }; name?: string }): boolean {
  const symbol = nft.contract.symbol?.toUpperCase();
  if (symbol === "ENS") return true;
  if (nft.name && nft.name.toLowerCase().endsWith(".eth")) return true;
  return false;
}

async function fetchNfts(wallet: string): Promise<{
  regular: AlchemyNft[];
  ens: AlchemyNft[];
}> {
  const key = process.env.ALCHEMY_API_KEY!;
  const url = `https://eth-sepolia.g.alchemy.com/nft/v3/${key}/getNFTsForOwner?owner=${wallet}&withMetadata=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getNFTsForOwner ${res.status}`);
  const json = await res.json();
  const all: AlchemyNft[] = json.ownedNfts ?? [];
  const regular: AlchemyNft[] = [];
  const ens: AlchemyNft[] = [];
  for (const n of all) {
    if (isEnsNft(n)) ens.push(n);
    else regular.push(n);
  }
  return { regular, ens };
}

function fmtAmount(raw: bigint, decimals: number): string {
  const formatted = formatUnits(raw, decimals);
  // Strip trailing zeros / decimal point if it's a whole number.
  const n = Number(formatted);
  if (!isFinite(n)) return formatted;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Build the token asset list. For each non-zero balance:
 *   - If it's a curated token (USDC, SHIB-PEPE, GOV), use the hand-tuned
 *     display name + price → this lets us mark USDC as a real-value asset
 *     and SHIB-PEPE as a memecoin in the UI.
 *   - Otherwise, fetch name/symbol/decimals from Alchemy and treat it as
 *     dust eligible for swapping (estimated USD = 0). Any testnet token
 *     the user faucets to the demo wallet appears here automatically.
 *
 * Async because metadata lookups for unknown tokens are RPC calls; we issue
 * them in parallel to keep latency reasonable.
 */
async function buildTokenAssets(
  raw: { contractAddress: string; tokenBalance: string }[],
): Promise<Asset[]> {
  // Filter to non-zero balances first — saves us metadata lookups for
  // tokens the wallet has ever interacted with but no longer holds.
  const nonZero = raw.filter(
    ({ tokenBalance }) =>
      tokenBalance && tokenBalance !== "0x" && tokenBalance !== "0x0" &&
      (() => { try { return BigInt(tokenBalance) !== 0n; } catch { return false; } })(),
  );

  // Fetch metadata for any non-curated tokens in parallel.
  const metadataByAddress = new Map<string, AlchemyTokenMeta>();
  await Promise.all(
    nonZero.map(async ({ contractAddress }) => {
      const addrLower = contractAddress.toLowerCase();
      if (ADDR_TO_KEY[addrLower]) return; // we have curated meta already
      const meta = await fetchTokenMetadata(contractAddress);
      if (meta) metadataByAddress.set(addrLower, meta);
    }),
  );

  const out: Asset[] = [];
  for (const { contractAddress, tokenBalance } of nonZero) {
    const addrLower = contractAddress.toLowerCase();
    let amountWei: bigint;
    try {
      amountWei = BigInt(tokenBalance);
    } catch {
      continue;
    }

    const curatedKey = ADDR_TO_KEY[addrLower];
    if (curatedKey) {
      // Curated token — use hand-tuned metadata + estimated price. Dust
      // is the real economic definition: USD value under $1.
      const meta = DEMO_TOKEN_META[curatedKey];
      const human = Number(formatUnits(amountWei, meta.decimals));
      const usd = human * meta.pricePerToken;
      const isDust = usd < 1;
      const category: AssetCategory = isDust ? "dust-token" : "token";
      out.push({
        id: `tok-${meta.symbol.toLowerCase()}`,
        category,
        displayName: meta.displayName,
        symbol: meta.symbol,
        contractAddress: contractAddress as `0x${string}`,
        amount: amountWei.toString(),
        amountFormatted: fmtAmount(amountWei, meta.decimals),
        decimals: meta.decimals,
        estimatedValueUsd: usd,
        migrateRecommended: true,
        isDust: isDust || undefined,
        priceKnown: true,
      });
      continue;
    }

    // Unknown token — pull metadata from Alchemy if available, otherwise
    // assume 18-decimal anonymous ERC-20. We do NOT classify it as dust
    // here (no price = no $1 threshold to compare against). The user opts
    // into swapping these via the "Auto-swap unknown tokens" checkbox; the
    // planner reads `priceKnown: false` and `prefs.convertUnknownTokens`
    // to decide whether to emit SWAP_AND_TRANSFER for them.
    const meta = metadataByAddress.get(addrLower);
    const symbol = meta?.symbol ?? "UNKNOWN";
    const decimals = meta?.decimals ?? 18;
    const displayName = meta?.name ?? `Unknown token (${addrLower.slice(0, 6)}…)`;
    out.push({
      id: `tok-${addrLower.slice(2, 10)}`,
      category: "token",
      displayName,
      symbol,
      contractAddress: contractAddress as `0x${string}`,
      amount: amountWei.toString(),
      amountFormatted: fmtAmount(amountWei, decimals),
      decimals,
      migrateRecommended: true,
      priceKnown: false,
      imageUrl: meta?.logo ?? undefined,
    });
  }
  return out;
}

function buildNftAssets(raw: AlchemyNft[]): Asset[] {
  return raw.map((n) => {
    const addrLower = n.contract.address.toLowerCase();
    const collectionLabel =
      NFT_ADDR_TO_NAME[addrLower] ??
      n.contract.name ??
      n.contract.symbol ??
      "NFT";
    const display = n.name ?? `${collectionLabel} #${n.tokenId}`;
    return {
      id: `nft-${addrLower.slice(2, 8)}-${n.tokenId}`,
      category: "nft" as const,
      displayName: display,
      contractAddress: n.contract.address as `0x${string}`,
      tokenId: n.tokenId,
      imageUrl: n.image?.thumbnailUrl ?? n.image?.cachedUrl,
      migrateRecommended: true,
    };
  });
}

function buildEnsAssets(
  subnames: { name: string; namehash: `0x${string}` }[]
): Asset[] {
  return subnames.map((s) => ({
    id: `ens-${s.name.split(".")[0]}`,
    category: "ens" as const,
    displayName: s.name,
    ensName: s.name,
    ensNamehash: s.namehash,
    migrateRecommended: true,
  }));
}

// Sepolia NameWrapper — used to look up human-readable names from a
// namehash when Alchemy's NFT response doesn't populate the `name` field
// (which happens fairly often for freshly-minted wrapped subnames).
const SEPOLIA_NAME_WRAPPER =
  "0x0635513f179D50A207757E05759CbD106d7dFcE8" as `0x${string}`;

const NAME_WRAPPER_NAMES_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "names",
    outputs: [{ type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Decode a DNS-encoded name (length-prefixed labels, terminated by 0x00)
 * into the dotted ENS form. e.g. "\x05alice\x0awalletyeet\x03eth\x00"
 * → "alice.walletyeet.eth".
 */
function decodeDnsName(dnsBytes: `0x${string}`): string | null {
  try {
    const hex = dnsBytes.slice(2);
    if (hex.length === 0) return null;
    const labels: string[] = [];
    let i = 0;
    while (i < hex.length) {
      const len = parseInt(hex.slice(i, i + 2), 16);
      i += 2;
      if (len === 0) break;
      const labelHex = hex.slice(i, i + len * 2);
      i += len * 2;
      let label = "";
      for (let j = 0; j < labelHex.length; j += 2) {
        label += String.fromCharCode(parseInt(labelHex.slice(j, j + 2), 16));
      }
      labels.push(label);
    }
    return labels.length > 0 ? labels.join(".") : null;
  } catch {
    return null;
  }
}

/**
 * Look up the human-readable name for a NameWrapper namehash via on-chain
 * `names()` call. Returns null on failure (we'll fall back to a placeholder).
 */
async function lookupNameWrapperName(namehash: `0x${string}`): Promise<string | null> {
  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    });
    const dnsBytes = (await client.readContract({
      address: SEPOLIA_NAME_WRAPPER,
      abi: NAME_WRAPPER_NAMES_ABI,
      functionName: "names",
      args: [namehash],
    })) as `0x${string}`;
    return decodeDnsName(dnsBytes);
  } catch {
    return null;
  }
}

/**
 * Convert Alchemy-discovered ENS NFTs (NameWrapper / BaseRegistrar) into
 * ENS-category assets. We tag wrapped names (ERC-1155) so the planner
 * routes them through NameWrapper.safeTransferFrom instead of
 * registry.setOwner (which only works for unwrapped names).
 *
 * This is our primary ENS-discovery path — the official ENS subgraph
 * hosted-service URL was deprecated mid-2024 and silently returns empty
 * results. When Alchemy doesn't populate `name`, we resolve it on-chain
 * via NameWrapper.names() so subnames still get a readable label.
 */
async function buildEnsAssetsFromNfts(nfts: AlchemyNft[]): Promise<Asset[]> {
  return Promise.all(
    nfts.map(async (n) => {
      // tokenId from Alchemy is decimal; convert to bytes32 namehash hex.
      let namehash: `0x${string}`;
      try {
        namehash = (`0x${BigInt(n.tokenId).toString(16).padStart(64, "0")}`) as `0x${string}`;
      } catch {
        namehash = ("0x" + "0".repeat(64)) as `0x${string}`;
      }
      const isWrapped = n.tokenType?.toUpperCase() === "ERC1155";

      // Prefer Alchemy's name, fall back to on-chain NameWrapper.names()
      // lookup, fall back to a namehash placeholder if both fail.
      let readable: string | null =
        n.name && n.name.toLowerCase().endsWith(".eth")
          ? n.name.toLowerCase()
          : null;
      if (!readable && isWrapped) {
        readable = await lookupNameWrapperName(namehash);
      }
      const displayName = readable ?? `ENS name (#${n.tokenId.slice(0, 10)}…)`;

      return {
        id: readable
          ? `ens-${readable.replace(/[^a-z0-9]/g, "-")}`
          : `ens-${n.tokenId.slice(0, 12)}`,
        category: "ens" as const,
        displayName,
        ensName: readable ?? undefined,
        ensNamehash: namehash,
        // Carry the on-chain contract address so the planner knows where
        // to dispatch the transfer (NameWrapper for wrapped, the registry
        // is implicit for unwrapped).
        contractAddress: n.contract.address as `0x${string}`,
        isWrapped,
        migrateRecommended: true,
      };
    }),
  );
}

/** Merge ENS assets from subgraph + Alchemy, deduping on namehash. */
function mergeEnsAssets(a: Asset[], b: Asset[]): Asset[] {
  const seen = new Set<string>();
  const out: Asset[] = [];
  for (const asset of [...a, ...b]) {
    const key = (asset.ensNamehash ?? asset.ensName ?? asset.id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

// Per-asset enrichment from the LLM. We only let it touch a tiny whitelist
// of cosmetic fields so a malformed or over-aggressive response can't drop
// assets out of the migration. Specifically the LLM does NOT decide
// migrateRecommended or unmigratable — those are owned by deterministic
// rules below. (Earlier versions let the LLM flip migrateRecommended and it
// was over-flagging mock tokens, hiding them from the planner.)
interface ScoutEnrichment {
  id: string;
  displayName?: string;
  tokenCategory?: "stablecoin" | "governance" | "memecoin" | "utility" | "spam" | "nft" | "ens" | "approval";
}

interface ScoutLLMResponse {
  enrichments: ScoutEnrichment[];
}

async function enrichWithLLM(assets: Asset[]): Promise<Asset[]> {
  const oai = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
  });

  const slim = assets.map((a) => ({
    id: a.id,
    category: a.category,
    name: a.displayName,
    symbol: a.symbol,
    valueUsd: a.estimatedValueUsd,
  }));

  const response = await withRetry(
    () => oai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    max_tokens: 2048,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Scout Agent in a wallet-migration tool. You receive a list of on-chain assets and your only job is to write a friendlier displayName and assign a tokenCategory tag.

STRICT RULES:
1. Output one entry per input asset, keyed by its "id".
2. "displayName" should be a short human-readable string; if the existing name is already fine, return it unchanged.
3. "tokenCategory" must be exactly one of: stablecoin, governance, memecoin, utility, nft, ens, approval.
4. Do NOT invent fields. Do NOT add a migrateRecommended field. Do NOT add an unmigratable list. Do NOT drop any asset.
5. Treat MOCK tokens (names starting with "Mock", "DUST-", "SHIB-PEPE", "GOV") as legitimate tokens for testing — never tag them as spam.
6. Output strict JSON in this schema: { "enrichments": [ { "id": string, "displayName"?: string, "tokenCategory"?: string } ] }`,
      },
      {
        role: "user",
        content: JSON.stringify({ assets: slim }),
      },
    ],
  }),
    { label: "scout" },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");
  const parsed = JSON.parse(content) as ScoutLLMResponse;

  const byId = new Map(parsed.enrichments?.map((e) => [e.id, e]) ?? []);
  return assets.map((a) => {
    const e = byId.get(a.id);
    if (!e) return a;
    return {
      ...a,
      displayName: e.displayName ?? a.displayName,
      // migrateRecommended stays exactly as the deterministic step set it.
    };
  });
}

export type PhaseCallback = (message: string) => void;

export async function runScoutAgent(
  wallet: string,
  onPhase?: PhaseCallback,
): Promise<DiscoveryInventory> {
  if (!hasServerKeys()) {
    onPhase?.("Mock mode — returning canned inventory");
    await new Promise((r) => setTimeout(r, 1200));
    return { ...MOCK_INVENTORY, wallet: wallet as `0x${string}` };
  }

  onPhase?.("Fetching native (ETH) balance + gas price…");
  const nativeP = Promise.all([fetchNativeBalance(wallet), fetchGasPrice()]).then(
    ([wei, gasPrice]) => {
      const eth = Number(formatUnits(wei, 18));
      const gwei = Number(gasPrice) / 1e9;
      onPhase?.(`Native: ${eth.toFixed(4)} ETH · gasPrice ${gwei.toFixed(2)} gwei`);
      return { wei, gasPrice };
    },
  );

  onPhase?.("Fetching ERC-20 balances from Alchemy…");
  const tokensP = fetchTokenBalances(wallet).then((r) => {
    onPhase?.(`Found ${r.length} ERC-20 contract${r.length === 1 ? "" : "s"} on-chain`);
    return r;
  });

  onPhase?.("Fetching NFTs (incl. ENS NameWrapper tokens) from Alchemy…");
  const nftsP = fetchNfts(wallet).then((r) => {
    onPhase?.(
      `Got ${r.regular.length} NFT${r.regular.length === 1 ? "" : "s"} + ${r.ens.length} ENS name${r.ens.length === 1 ? "" : "s"}`,
    );
    return r;
  });

  onPhase?.("Scanning known (token, spender) pairs for risky approvals…");
  const approvalsP = discoverApprovals(wallet as `0x${string}`).then((r) => {
    onPhase?.(`Detected ${r.length} active approval${r.length === 1 ? "" : "s"}`);
    return r;
  });

  const [native, tokensRaw, nftsResult, approvalAssets] = await Promise.all([
    nativeP,
    tokensP,
    nftsP,
    approvalsP,
  ]);
  const { wei: nativeWei, gasPrice } = native;

  // ENS subname discovery — runs AFTER NFT discovery so we can pass the
  // parent names found in the wallet (e.g. walletyeet.eth) into the
  // registry-probe fallback. That probe catches *unwrapped* subnames the
  // subgraph and Alchemy NFT API both miss.
  const knownParents = nftsResult.ens
    .map((n) => n.name?.toLowerCase())
    .filter((n): n is string => !!n && n.endsWith(".eth"));
  onPhase?.(
    knownParents.length > 0
      ? `Probing ENS registry for subnames under ${knownParents.length} parent name${knownParents.length === 1 ? "" : "s"}…`
      : "Querying ENS subgraph for owned subnames (best-effort)…",
  );
  const ensSubnames = await fetchENSSubnames(wallet, knownParents);
  onPhase?.(
    `ENS discovery returned ${ensSubnames.length} subname${ensSubnames.length === 1 ? "" : "s"}`,
  );

  // Dynamic gas reserve: estimated_batch_gas × current gas price × 1.5
  // safety factor, with a floor so a sub-gwei moment doesn't leave us
  // exposed to a spike at sign time.
  const computedReserve =
    (ESTIMATED_BATCH_GAS * gasPrice * GAS_RESERVE_SAFETY_NUMERATOR) /
    GAS_RESERVE_SAFETY_DENOMINATOR;
  const reserveWei =
    computedReserve > GAS_RESERVE_FLOOR_WEI ? computedReserve : GAS_RESERVE_FLOOR_WEI;

  onPhase?.("Resolving metadata for any unknown ERC-20s via Alchemy…");
  const tokenAssets = await buildTokenAssets(tokensRaw);

  // Merge ENS from both sources: Alchemy's NameWrapper tokens (primary,
  // with on-chain NameWrapper.names() fallback for missing labels) and the
  // subgraph (backup, often empty since the hosted endpoint deprecated).
  const ensFromNfts = await buildEnsAssetsFromNfts(nftsResult.ens);
  const ensAssets = mergeEnsAssets(ensFromNfts, buildEnsAssets(ensSubnames));
  if (ensAssets.length > 0) {
    onPhase?.(`Total ENS names after merge: ${ensAssets.length}`);
  }

  // Native ETH asset — only added when there's enough headroom over the
  // dynamic gas reserve to actually transfer something. The reserve is
  // sized live based on Sepolia gas price.
  const nativeAssets: Asset[] = [];
  if (nativeWei > reserveWei) {
    const transferableWei = nativeWei - reserveWei;
    const human = Number(formatUnits(transferableWei, 18));
    const reserveHuman = Number(formatUnits(reserveWei, 18));
    nativeAssets.push({
      id: "native-eth",
      category: "token",
      displayName: `Sepolia ETH (≈${reserveHuman.toFixed(4)} ETH held back for gas)`,
      symbol: "ETH",
      // No contractAddress — native asset is identified by the
      // TRANSFER_NATIVE op type emitted by the planner.
      amount: transferableWei.toString(),
      amountFormatted: human.toFixed(4),
      decimals: 18,
      // Testnet ETH has no real USD value, but mark priceKnown=true so it
      // doesn't fall into the "swap unknown tokens" toggle.
      estimatedValueUsd: 0,
      priceKnown: true,
      isDust: false,
      migrateRecommended: true,
    });
  }

  const baselineAssets: Asset[] = [
    ...nativeAssets,
    ...tokenAssets,
    ...buildNftAssets(nftsResult.regular),
    ...ensAssets,
    ...approvalAssets,
  ];

  onPhase?.(`Built deterministic Asset[] (${baselineAssets.length} entries)`);

  // LLM enrichment — best-effort cosmetic refinement only. If it fails, we
  // return the deterministic baseline so the pipeline still works on a
  // flaky model. The LLM cannot affect which assets get migrated.
  let enriched = baselineAssets;
  try {
    onPhase?.("Asking GPT-4o-mini to enrich display names + categories…");
    enriched = await enrichWithLLM(baselineAssets);
    onPhase?.("LLM enrichment merged");
  } catch (err) {
    console.warn("[scout] LLM enrichment failed, using deterministic baseline:", err);
    onPhase?.("LLM call failed — keeping deterministic baseline");
  }

  return {
    wallet: wallet as `0x${string}`,
    assets: enriched,
    unmigratable: [], // production: populate from a known-soulbound contract list
  };
}
