import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "studio.studio.local",
    "action.studio.local",
  ],
  transpilePackages: ["hudsonkit", "studio"],
};

export default nextConfig;
