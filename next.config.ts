import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Indicate that these packages should not be bundled by webpack
  serverExternalPackages: ["sharp", "onnxruntime-node"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Help resolve onnxruntime native binaries
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "onnxruntime-node",
      ];
    }
    return config;
  },
};

export default nextConfig;
