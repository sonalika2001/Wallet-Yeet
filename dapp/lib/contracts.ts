export const MIGRATION_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_MIGRATION_VAULT_ADDRESS as `0x${string}` | undefined) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

export const MIGRATION_LOG_ADDRESS =
  (process.env.NEXT_PUBLIC_MIGRATION_LOG_ADDRESS as `0x${string}` | undefined) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

// EIP-7702 Batcher — deployed via script/DeployBatcher.s.sol. When set,
// ExecuteFlow uses the single-signature 7702 path; when zero/unset it falls
// back to the legacy approve-then-vault flow.
export const BATCHER_ADDRESS =
  (process.env.NEXT_PUBLIC_BATCHER_ADDRESS as `0x${string}` | undefined) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

// Sepolia Uniswap V3 SwapRouter02. Used by the SWAP_AND_TRANSFER path under
// the 7702 flow (the EOA itself calls the router, no vault intermediation).
export const SEPOLIA_UNISWAP_V3_ROUTER =
  "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as `0x${string}`;

// Real Sepolia USDC (Circle's testnet deployment). This is the preferred
// swap output — when a pool exists, the destination wallet ends up holding
// actual Sepolia USDC.
export const SEPOLIA_SWAP_USDC =
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`;

// Sepolia ENS Registry — used directly by the ENS_TRANSFER path under 7702.
export const SEPOLIA_ENS_REGISTRY =
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as `0x${string}`;

// Curated token addresses we want the dapp to render with specific metadata
// (display name, hand-tuned price, semantic category). Anything else the
// demo wallet holds is auto-discovered by Scout via alchemy_getTokenMetadata
// and treated as dust eligible for a swap-or-transfer — no code change
// required to add new test tokens. Just faucet whatever you want to the
// demo wallet and the pipeline picks it up.
//
// The Auditor reads SHIB_PEPE / GOV from here for symbol-based heuristics,
// and approval discovery in `lib/adapters/approvals.ts` walks this mapping
// against SUSPICIOUS_ADDRESSES — so anything in here also gets scanned for
// risky allowances by default.
export const KNOWN_TOKENS = {
  USDC:      "0xdCa7e8AAA08C8A795364444aA10061dA77Fa1F2a" as `0x${string}`, // seeded mock
  // Circle's official Sepolia USDC — what users get if they send themselves
  // real testnet USDC. Without this, real USDC falls through to the unknown
  // bucket and loses its $1 price.
  USDC_REAL: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`,
  SHIB_PEPE: "0x78435b033eb66A946c433DCd46ed4516599B1830" as `0x${string}`,
  GOV:       "0x9B8702434Ff5Ca33E6d5951b10aE1f053941e893" as `0x${string}`,
  // Real Sepolia LINK — any LINK the user faucets reads as curated "Dust"
  // (sub-$1 at our demo price) AND has real Uniswap pools, so the swap
  // path actually executes.
  LINK:      "0x779877A7B0D9E8603169DdbD7836e478b4624789" as `0x${string}`,
};

// Ordered list of candidate swap-target USDC addresses. The planner tries
// each (× every Uniswap V3 fee tier) and picks the first pool with
// liquidity. Real Sepolia USDC is preferred because it's a "real" demo
// outcome, but the seed-script mock USDC is a reliable fallback when
// SeedUniswapPools.s.sol has provisioned local pools.
//
// To extend: append another USDC address (e.g. Aave's testnet USDC or any
// other Sepolia stable with active V3 liquidity) and the planner will
// auto-discover it without further code changes.
export const SWAP_USDC_CANDIDATES: readonly `0x${string}`[] = [
  SEPOLIA_SWAP_USDC, // real Circle USDC (preferred — stronger demo)
  KNOWN_TOKENS.USDC, // seeded mock USDC (works after SeedUniswapPools.s.sol)
];

export const KNOWN_NFT_COLLECTIONS = {
  MockPunks: "0x333819292377194b727B8C23b6F27711D56980ea" as `0x${string}`,
  MockArt:   "0x98B679b9EC4638A5008587053eA209F5205901b2" as `0x${string}`,
};

// Pre-set in the seed script — Auditor flags approvals to these as DANGEROUS.
// All-lowercase to match what the chain stores; viem rejects mixed-case
// without a valid EIP-55 checksum.
export const SUSPICIOUS_ADDRESSES: Record<string, string> = {
  "0x1234567890123456789012345678901234567890": "Suspicious Router",
  "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef": "Sketchy Marketplace",
  "0xbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": "Random Drainer",
};
