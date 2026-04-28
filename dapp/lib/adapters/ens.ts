// ENS adapter — optional ENS subname migration.
// When enabled, Scout queries the ENS subgraph for subnames owned by
// the user. Planner emits ENS_TRANSFER ops; the contract calls
// `registry.setOwner(node, dest)` per op.

import { ENABLED_FEATURES } from "../config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export interface ENSSubname {
  name: string;
  namehash: `0x${string}`;
  isWrapped: boolean;
}

export async function fetchENSSubnames(
  owner: string
): Promise<ENSSubname[]> {
  if (!ENABLED_FEATURES.ensSubnames) return [];

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
  const data = await res.json();
  return (data.data?.domains ?? []).map((d: any) => ({
    name: d.name,
    namehash: d.id,
    isWrapped: Boolean(d.wrappedDomain),
  }));
}

export async function resolveENS(name: string): Promise<`0x${string}` | null> {
  if (!ENABLED_FEATURES.ensSubnames) return null;
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  });
  return await client.getEnsAddress({ name });
}
