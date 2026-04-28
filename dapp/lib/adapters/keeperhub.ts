// KeeperHub adapter — optional execution layer.
// When enabled, signed migration txs are submitted via KeeperHub's
// MCP-native relayer for retry + MEV protection + optional scheduling.
// When disabled, adapters fall back to direct wagmi submission.

import { ENABLED_FEATURES } from "../config";

export interface KeeperHubSubmitArgs {
  vaultAddress: `0x${string}`;
  signedTx: string;
  scheduleAt?: number; // unix seconds; omit = execute now
}

export interface KeeperHubResult {
  ok: boolean;
  via: "keeperhub" | "direct";
  txHash?: `0x${string}`;
  schedulerId?: string;
  error?: string;
}

export async function submitMigration(
  args: KeeperHubSubmitArgs
): Promise<KeeperHubResult> {

  if (!ENABLED_FEATURES.keeperHub) {
    return { ok: false, via: "direct", error: "KeeperHub adapter disabled" };
  }

  const res = await fetch("https://api.keeperhub.com/mcp/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.KEEPERHUB_API_KEY}`,
    },
    body: JSON.stringify({
      to: args.vaultAddress,
      data: args.signedTx,
      retries: 3,
      privateRouting: true,
      scheduleAt: args.scheduleAt,
    }),
  });
  
  if (!res.ok) throw new Error(`KeeperHub ${res.status}`);
  const json = await res.json();
  return { ok: true, via: "keeperhub", txHash: json.txHash, schedulerId: json.id };
}
