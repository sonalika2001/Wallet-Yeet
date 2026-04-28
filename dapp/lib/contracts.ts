export const MIGRATION_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_MIGRATION_VAULT_ADDRESS as `0x${string}` | undefined) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

export const MIGRATION_LOG_ADDRESS =
  (process.env.NEXT_PUBLIC_MIGRATION_LOG_ADDRESS as `0x${string}` | undefined) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

// need to replace placeholders with real seed-script outputs after deploying!!
export const KNOWN_TOKENS = {
  USDC: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  SHIB_PEPE: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  GOV: "0x0000000000000000000000000000000000000000" as `0x${string}`,
};

export const KNOWN_NFT_COLLECTIONS = {
  MockPunks: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  MockArt: "0x0000000000000000000000000000000000000000" as `0x${string}`,
};

// Pre-set in the seed script — Auditor flags approvals to these as DANGEROUS.
export const SUSPICIOUS_ADDRESSES: Record<string, string> = {
  "0x1234567890123456789012345678901234567890": "Suspicious Router",
  "0xdeAdBeEfdeAdBEEFdeAdbeefDeAdbEEFdeadBEEF": "Sketchy Marketplace",
  "0xBaaaaaaaaaaAAaAAaAAaAAAaaaAAAAAaAaaAAaaa": "Random Drainer",
};
