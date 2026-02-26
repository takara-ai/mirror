import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // w=80 used for grid thumbnails (40px @2x); must be in imageSizes or deviceSizes
    imageSizes: [32, 48, 64, 80, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
  // Indicate that these packages should not be bundled by webpack
  serverExternalPackages: ['sharp', 'onnxruntime-node'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Help resolve onnxruntime native binaries
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'onnxruntime-node',
      ];
    }
    return config;
  },
};

export default nextConfig;
