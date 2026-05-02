// just a mock pipeline to test frontend

import type {
  Asset,
  DiscoveryInventory,
  MigrationPlan,
  PlannedOperation,
  UserPreferences,
} from "./types";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const DEMO_OLD =
  (process.env.NEXT_PUBLIC_DEMO_OLD_ADDRESS as `0x${string}` | undefined) ??
  ("0xA110ce1234567890ABCdef1234567890aBCdEF12" as `0x${string}`);

const DEMO_NEW =
  (process.env.NEXT_PUBLIC_DEMO_NEW_ADDRESS as `0x${string}` | undefined) ??
  ("0xB0b1234567890aBcDef1234567890ABcDef123456" as `0x${string}`);

const DEMO_COLD =
  (process.env.NEXT_PUBLIC_DEMO_COLD_ADDRESS as `0x${string}` | undefined) ??
  ("0xC01dC01d567890aBcDef1234567890ABcDef9876" as `0x${string}`);

export const MOCK_DEMO_WALLETS = {
  old: DEMO_OLD,
  new: DEMO_NEW,
  cold: DEMO_COLD,
};

const tokenAddr = (n: number): `0x${string}` =>
  `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;

export const MOCK_INVENTORY: DiscoveryInventory = {
  wallet: DEMO_OLD,
  unmigratable: [
    { name: "ETHGlobal Istanbul POAP", reason: "POAPs are soulbound" },
  ],
  assets: [
    {
      id: "tok-usdc",
      category: "token",
      displayName: "USD Coin",
      symbol: "USDC",
      contractAddress: tokenAddr(0xa1c1),
      amount: "1000000000000",
      amountFormatted: "1,000,000",
      decimals: 6,
      estimatedValueUsd: 1_000_000,
      migrateRecommended: true,
    },
    {
      id: "tok-shib",
      category: "token",
      displayName: "SHIB-PEPE",
      symbol: "SHIB-PEPE",
      contractAddress: tokenAddr(0xa2),
      amount: "1000000000000000000000000",
      amountFormatted: "1,000,000",
      decimals: 18,
      estimatedValueUsd: 4200,
      migrateRecommended: true,
    },
    {
      id: "tok-gov",
      category: "token",
      displayName: "Governance",
      symbol: "GOV",
      contractAddress: tokenAddr(0xa3),
      amount: "100000000000000000000000",
      amountFormatted: "100,000",
      decimals: 18,
      estimatedValueUsd: 12_500,
      migrateRecommended: true,
    },
    {
      id: "tok-dust-a",
      category: "dust-token",
      displayName: "Dust Token A",
      symbol: "DUST-A",
      contractAddress: tokenAddr(0xd1),
      amount: "100000000000000000000",
      amountFormatted: "100",
      decimals: 18,
      estimatedValueUsd: 0.42,
      migrateRecommended: true,
      isDust: true,
    },
    {
      id: "tok-dust-b",
      category: "dust-token",
      displayName: "Dust Token B",
      symbol: "DUST-B",
      contractAddress: tokenAddr(0xd2),
      amount: "50000000000000000000",
      amountFormatted: "50",
      decimals: 18,
      estimatedValueUsd: 0.18,
      migrateRecommended: true,
      isDust: true,
    },
    {
      id: "nft-punk-1",
      category: "nft",
      displayName: "Mock CryptoPunk #1",
      contractAddress: tokenAddr(0xb1),
      tokenId: "1",
      estimatedValueUsd: 320,
      migrateRecommended: true,
    },
    {
      id: "nft-punk-2",
      category: "nft",
      displayName: "Mock CryptoPunk #2",
      contractAddress: tokenAddr(0xb1),
      tokenId: "2",
      estimatedValueUsd: 280,
      migrateRecommended: true,
    },
    {
      id: "nft-punk-3",
      category: "nft",
      displayName: "Mock CryptoPunk #3",
      contractAddress: tokenAddr(0xb1),
      tokenId: "3",
      estimatedValueUsd: 410,
      migrateRecommended: true,
    },
    {
      id: "nft-art-1",
      category: "nft",
      displayName: "Mock Art Gallery #1",
      contractAddress: tokenAddr(0xb2),
      tokenId: "1",
      estimatedValueUsd: 90,
      migrateRecommended: true,
    },
    {
      id: "nft-art-2",
      category: "nft",
      displayName: "Mock Art Gallery #2",
      contractAddress: tokenAddr(0xb2),
      tokenId: "2",
      estimatedValueUsd: 75,
      migrateRecommended: true,
    },
    {
      id: "ens-alice",
      category: "ens",
      displayName: "alice.walletyeet-demo.eth",
      ensName: "alice.walletyeet-demo.eth",
      ensNamehash:
        "0x" + "ab".repeat(32),
      migrateRecommended: true,
    },
    {
      id: "ens-vault",
      category: "ens",
      displayName: "vault.walletyeet-demo.eth",
      ensName: "vault.walletyeet-demo.eth",
      ensNamehash:
        "0x" + "cd".repeat(32),
      migrateRecommended: true,
    },
  ],
};

export const MOCK_AUDITED_INVENTORY: DiscoveryInventory = {
  ...MOCK_INVENTORY,
  assets: MOCK_INVENTORY.assets.map((a) => {
    if (a.isDust) {
      return {
        ...a,
        riskLevel: "SAFE",
        riskReason: "Sub-$1 dust — recommend converting to USDC.",
      };
    }
    return { ...a, riskLevel: "SAFE", riskReason: "Looks healthy." };
  }),
};

export function buildMockPlan(prefs: UserPreferences): MigrationPlan {
  const { defaultDestination, customRoutes, convertDust } = prefs;
  const destFor = (id: string) => customRoutes[id] ?? defaultDestination;
  const ops: PlannedOperation[] = [];

  // 1. Token transfers (dust may be swapped if convertDust is on).
  for (const a of MOCK_AUDITED_INVENTORY.assets) {
    if (a.category === "token" || a.category === "dust-token") {
      const useSwap = convertDust && a.isDust;
      ops.push({
        assetId: a.id,
        opType: useSwap ? "SWAP_AND_TRANSFER" : "TRANSFER_ERC20",
        target: a.contractAddress ?? ZERO,
        amount: a.amount,
        destination: destFor(a.id),
        explanation: useSwap
          ? `Swap ${a.displayName} → USDC, send to destination`
          : `Transfer ${a.amountFormatted} ${a.symbol}`,
      });
    }
  }

  // 2. NFT transfers.
  for (const a of MOCK_AUDITED_INVENTORY.assets) {
    if (a.category === "nft") {
      ops.push({
        assetId: a.id,
        opType: "TRANSFER_ERC721",
        target: a.contractAddress ?? ZERO,
        tokenId: a.tokenId,
        destination: destFor(a.id),
        explanation: `Transfer ${a.displayName}`,
      });
    }
  }

  // 3. ENS subname transfers (last — not gas-critical).
  for (const a of MOCK_AUDITED_INVENTORY.assets) {
    if (a.category === "ens") {
      ops.push({
        assetId: a.id,
        opType: "ENS_TRANSFER",
        target: ZERO, // ENS registry filled in at execution time
        tokenId: a.ensNamehash,
        destination: destFor(a.id),
        explanation: `Transfer ENS subname ${a.ensName}`,
      });
    }
  }

  return {
    operations: ops,
    warnings: ["1 unmigratable item: ETHGlobal Istanbul POAP (soulbound)."],
    summary:
      `Plan ready. ${ops.length} operations across ${
        new Set(ops.map((o) => o.destination)).size
      } destination wallet(s). Revocations run before transfers.`,
    dustSwapsCount: convertDust
      ? ops.filter((o) => o.opType === "SWAP_AND_TRANSFER").length
      : 0,
  };
}
