// Feature flags for sponsor adapters. Each adapter is independently
// disable-able so a single integration failing doesn't tank the demo.
//
// In production these are toggled via NEXT_PUBLIC_FEATURE_* env vars.

const flag = (name: string, fallback: boolean): boolean => {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
};

export const ENABLED_FEATURES = {
  keeperHub: flag("NEXT_PUBLIC_FEATURE_KEEPERHUB", true),
  uniswapDust: flag("NEXT_PUBLIC_FEATURE_UNISWAP", true),
  ensSubnames: flag("NEXT_PUBLIC_FEATURE_ENS", true),
};

export const DUST_THRESHOLD_USD = 1;

export const STRATEGY_PRESETS = ["conservative", "balanced", "aggressive"] as const;
export type Strategy = (typeof STRATEGY_PRESETS)[number];

export const SEPOLIA_CHAIN_ID = 11155111;

export const APP_NAME = "WalletYeet";
export const APP_TAGLINE =
  "Yeet your wallet — AI agents discover, audit, plan; you route, we yeet.";

// True if the server has Azure OpenAI + Alchemy keys to run the real pipeline.
// Used by API routes to decide whether to fall back to mock data.
export const hasServerKeys = () =>
  Boolean(
    process.env.AZURE_OPENAI_API_KEY &&
      process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_DEPLOYMENT &&
      process.env.ALCHEMY_API_KEY,
  );
