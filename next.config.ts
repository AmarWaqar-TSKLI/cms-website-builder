import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The worker imports the same .tsx component registry the editor uses.
  // Nothing here should ever need to know about artifacts — they are files on disk.
  serverExternalPackages: ["archiver"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
