import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use serverExternalPackages to control which packages are externalized
  serverExternalPackages: ['sharp', 'onnxruntime-node'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = {
        ...config.externals,
        'onnxruntime-node': 'commonjs onnxruntime-node',
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      'sharp': false,
      'onnxruntime-node': false,
    };
    return config;
  },
};

export default nextConfig;
