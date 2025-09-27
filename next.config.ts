import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Indicate that these packages should not be bundled by webpack
  serverExternalPackages: ['sharp', 'onnxruntime-node'],
};

export default nextConfig;
