import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  // Force transformers to use the web (WASM) build so serverless doesn't need libonnxruntime.so
  turbopack: {
    resolveAlias: {
      "@huggingface/transformers":
        "./node_modules/@huggingface/transformers/dist/transformers.web.js",
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "onnxruntime-node",
      ];
    }
    return config;
  },
};

export default nextConfig;
