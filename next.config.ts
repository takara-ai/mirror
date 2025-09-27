import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@xenova/transformers'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('@xenova/transformers');
    }
    return config;
  },
};

export default nextConfig;
