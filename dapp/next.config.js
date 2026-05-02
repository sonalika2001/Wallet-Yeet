/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // Keep compiled pages alive longer in dev so navigating between steps
  // doesn't trigger a fresh compile + chunk-load timeout. Default is 25s
  // for inactive pages and 2 active. Bumped because our compile is heavy.
  onDemandEntries: {
    maxInactiveAge: 5 * 60 * 1000, // 5 minutes — keep pages warm
    pagesBufferLength: 10, // keep up to 10 routes in memory
  },
  // Hoist heavy wallet libs out of the per-page bundle so they compile once,
  // not on every page-route hit. Major dev-compile speed-up for this app.
  experimental: {
    optimizePackageImports: [
      "@rainbow-me/rainbowkit",
      "wagmi",
      "viem",
      "@tanstack/react-query",
    ],
  },
  webpack: (config, { dev }) => {
    // wagmi / RainbowKit / MetaMask SDK pull in some libs that ship optional
    // React-Native or Node-only paths. Webpack can't statically prove they're
    // unreachable in a browser build, so we stub them out here.
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      "@react-native-async-storage/async-storage": false,
      fs: false,
      net: false,
      tls: false,
    };
    config.externals = config.externals || [];
    if (Array.isArray(config.externals)) {
      // Optional pretty-logger that pino tries to load — never used in browser.
      config.externals.push("pino-pretty", "encoding");
    }
    // In dev, swap webpack's slow eval-source-maps for the cheaper
    // 'eval-cheap-module-source-map'. Trades exact column numbers for ~30%
    // faster recompiles, which matters when our cold-compile is ~3 min.
    if (dev) {
      config.devtool = "eval-cheap-module-source-map";
      // Bump chunk-load timeout from 120s default to 300s. Our wagmi/
      // RainbowKit/MetaMask-SDK graph can take ~2-3 min to compile a fresh
      // chunk on Windows; the default times out and the browser shows a
      // ChunkLoadError that the user reads as "the app crashed".
      config.output = config.output || {};
      config.output.chunkLoadTimeout = 300_000;
    }
    return config;
  },
};

module.exports = nextConfig;
