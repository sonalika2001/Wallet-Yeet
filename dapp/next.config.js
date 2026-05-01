/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
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
    }
    return config;
  },
};

module.exports = nextConfig;
