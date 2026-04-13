import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev", "localhost", "127.0.0.1"],
};

export default nextConfig;
