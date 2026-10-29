import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The worker imports the same .tsx component registry the editor uses.
  // Nothing here should ever need to know about artifacts — they are files on disk.
  serverExternalPackages: ["archiver"],
  // Disk-backed exports need the build's files, which serverless hosts don't keep.
  env: { NEXT_PUBLIC_DISK_EXPORTS: process.env.VERCEL ? "0" : "1" },
  // The 3D scroll narrative was replaced by a plain landing page.
  async redirects() {
    return [{ source: "/how-it-works", destination: "/", permanent: false }];
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
