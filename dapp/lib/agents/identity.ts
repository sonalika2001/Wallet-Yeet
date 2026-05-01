// ENS-backed agent identity reader.
//
// Each agent has its own ENS subname under walletyeet-demo.eth on Sepolia:
//   - scout.walletyeet-demo.eth
//   - auditor.walletyeet-demo.eth
//   - planner.walletyeet-demo.eth

import { createPublicClient, http, namehash } from "viem";
import { sepolia } from "viem/chains";
import type { AgentName } from "../types";

export interface AgentIdentity {
  ensName: string;
  /** Address the ENS name resolves to, if any. */
  address?: `0x${string}`;
  /** Selected text records as a flat dict. */
  records: Record<string, string>;
  /** True if any of the lookups succeeded — UI uses this to show a "verified" badge. */
  verified: boolean;
}

const ROOT_DOMAIN = "walletyeet-demo.eth";

const RECORDS_TO_READ = ["description", "url", "com.github", "ai.model", "ai.role"];

const AGENT_NAMES: Record<AgentName, string> = {
  scout: `scout.${ROOT_DOMAIN}`,
  auditor: `auditor.${ROOT_DOMAIN}`,
  planner: `planner.${ROOT_DOMAIN}`,
};

///<Added by AI.>
/// Set of ENS names that should never appear in a user's migration plan.
/// Scout filters these out of the inventory in `fetchENSSubnames`. Includes:
///
///   - The agent identity root walletyeet-demo.eth + the three agent
///     subnames (scout/auditor/planner.walletyeet-demo.eth) — they live on
///     the deployer wallet by design, but this is defense-in-depth in case
///     anyone ever transfers them somewhere migratable.
///
/// The user's "old wallet" ENS root (e.g. walletyeet.eth) IS migratable and
/// stays in the inventory — the user explicitly wants the option to move
/// the parent name to a new wallet alongside its subnames.
export const MIGRATION_FILTERED_ENS_NAMES: ReadonlySet<string> = new Set([
  ROOT_DOMAIN.toLowerCase(), // walletyeet-demo.eth (agent infrastructure root)
  ...Object.values(AGENT_NAMES).map((n) => n.toLowerCase()),
]);

let _cached: Partial<Record<AgentName, AgentIdentity>> | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  });
}

async function readOne(name: string): Promise<AgentIdentity> {
  const client = getClient();
  const records: Record<string, string> = {};
  let address: `0x${string}` | undefined;
  try {
    const resolved = await client.getEnsAddress({ name });
    if (resolved) address = resolved;
  } catch {
    // ignore — name might not resolve to an address
  }

  await Promise.all(
    RECORDS_TO_READ.map(async (key) => {
      try {
        const value = await client.getEnsText({ name, key });
        if (value) records[key] = value;
      } catch {
        // missing text record is fine
      }
    }),
  );

  return {
    ensName: name,
    address,
    records,
    verified: !!address || Object.keys(records).length > 0,
  };
}

/**
 * Fetch identities for all three agents in parallel. Cached for 5 minutes
 * to avoid re-reading every pipeline run. Failure on any one agent is
 * isolated — the other two still get returned.
 */
export async function fetchAgentIdentities(): Promise<
  Partial<Record<AgentName, AgentIdentity>>
> {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL_MS) return _cached;

  const entries = await Promise.all(
    (Object.entries(AGENT_NAMES) as [AgentName, string][]).map(async ([k, name]) => {
      try {
        const id = await readOne(name);
        return [k, id] as const;
      } catch (err) {
        console.warn(`[identity] failed to read ${name}:`, err);
        return [k, undefined] as const;
      }
    }),
  );

  const result: Partial<Record<AgentName, AgentIdentity>> = {};
  for (const [k, v] of entries) {
    if (v) result[k] = v;
  }
  _cached = result;
  _cachedAt = now;
  return result;
}

// Stub — uses namehash from viem so we don't pull in extra deps later.
export function namehashOf(name: string): `0x${string}` {
  return namehash(name);
}
