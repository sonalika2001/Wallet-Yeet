// ENS adapter — optional ENS subname migration.
// When enabled, Scout queries the ENS subgraph for subnames owned by
// the user. Planner emits ENS_TRANSFER ops; the contract calls
// `registry.setOwner(node, dest)` per op.

import { ENABLED_FEATURES } from "../config";
import { createPublicClient, http, namehash } from "viem";
import { sepolia } from "viem/chains";
import { MIGRATION_FILTERED_ENS_NAMES } from "../agents/identity";
import { SEPOLIA_ENS_REGISTRY } from "../contracts";

export interface ENSSubname {
  name: string;
  namehash: `0x${string}`;
  isWrapped: boolean;
}

// Common subname labels we probe the registry for under each owned parent.
// Hack but reliable on Sepolia where the subgraph is dead — if a user
// registered a subname with one of these labels via the ENS UI (wrapped
// or unwrapped), we'll find it by direct registry lookup.
const COMMON_SUBNAME_LABELS = [
  // Identity / role labels
  "alice",
  "bob",
  "vault",
  "cold",
  "hot",
  "main",
  "trading",
  "savings",
  "display",
  "nft",
  "personal",
  "work",
  // Test / demo labels — covers labels picked during demo recording
  "test",
  "test1",
  "test2",
  "testsubname",
  "demo",
  "dev",
  "sample",
];

const ENS_REGISTRY_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Probe the ENS registry directly for known subname labels under the user's
 * owned parent names. This catches *unwrapped* subnames that the deprecated
 * ENS subgraph and Alchemy NFT API both miss. Returns subnames whose owner
 * is the wallet we're scanning.
 */
async function probeRegistryForSubnames(
  parentNames: string[],
  ownerWallet: `0x${string}`,
): Promise<ENSSubname[]> {
  if (parentNames.length === 0) return [];
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  });
  const ownerLower = ownerWallet.toLowerCase();
  const ZERO = "0x0000000000000000000000000000000000000000";
  const candidates: { name: string; node: `0x${string}` }[] = [];
  for (const parent of parentNames) {
    for (const label of COMMON_SUBNAME_LABELS) {
      const fullName = `${label}.${parent}`;
      candidates.push({ name: fullName, node: namehash(fullName) });
    }
  }

  const results = await Promise.all(
    candidates.map((c) =>
      client
        .readContract({
          address: SEPOLIA_ENS_REGISTRY,
          abi: ENS_REGISTRY_ABI,
          functionName: "owner",
          args: [c.node],
        })
        .then((owner) => ({ ...c, owner }))
        .catch(() => null),
    ),
  );

  const found: ENSSubname[] = [];
  for (const r of results) {
    if (!r || !r.owner) continue;
    const ownerStr = (r.owner as string).toLowerCase();
    if (ownerStr === ZERO) continue;
    if (ownerStr !== ownerLower) continue; // owned by someone else
    found.push({ name: r.name, namehash: r.node, isWrapped: false });
  }
  return found;
}

export async function fetchENSSubnames(
  owner: string,
  /** Parent names already discovered (e.g. walletyeet.eth from Alchemy
   *  NFTs). Used by the registry-probe fallback to look for unwrapped
   *  subnames under each parent. */
  knownParents: string[] = [],
): Promise<ENSSubname[]> {
  if (!ENABLED_FEATURES.ensSubnames) return [];

  // 1. Try the deprecated subgraph first (if it ever comes back, free win).
  let subgraphResults: ENSSubname[] = [];
  try {
    const res = await fetch("https://api.thegraph.com/subgraphs/name/ensdomains/enssepolia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          domains(where: { owner: "${owner.toLowerCase()}" }) {
            id
            name
            labelName
            wrappedDomain { id }
          }
        }`,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      subgraphResults = (data.data?.domains ?? [])
        .filter((d: any) => {
          const name: string = (d.name ?? "").toLowerCase();
          return !MIGRATION_FILTERED_ENS_NAMES.has(name);
        })
        .map((d: any) => ({
          name: d.name,
          namehash: d.id,
          isWrapped: Boolean(d.wrappedDomain),
        }));
    }
  } catch {
    // subgraph dead — that's expected, fall through
  }

  // 2. Registry-probe fallback for unwrapped subnames under known parents.
  // This catches subnames that the subgraph and Alchemy NFT API miss.
  const registryResults =
    knownParents.length > 0
      ? await probeRegistryForSubnames(
          knownParents,
          owner as `0x${string}`,
        )
      : [];

  // 3. Dedupe by namehash (subgraph + registry might overlap).
  const byHash = new Map<string, ENSSubname>();
  for (const s of [...subgraphResults, ...registryResults]) {
    byHash.set(s.namehash.toLowerCase(), s);
  }
  return Array.from(byHash.values()).filter(
    (s) => !MIGRATION_FILTERED_ENS_NAMES.has(s.name.toLowerCase()),
  );
}

export async function resolveENS(name: string): Promise<`0x${string}` | null> {
  if (!ENABLED_FEATURES.ensSubnames) return null;
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  });
  return await client.getEnsAddress({ name });
}
