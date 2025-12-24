import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile Privy packages for compatibility
  transpilePackages: [
    '@privy-io/react-auth',
    '@privy-io/js-sdk-core',
  ],
  // Turbopack configuration (Next.js 16 default)
  turbopack: {
    resolveAlias: {
      // Add any alias overrides if needed
    },
  },
  // Webpack configuration for Node.js polyfills (fallback for non-turbopack)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;


