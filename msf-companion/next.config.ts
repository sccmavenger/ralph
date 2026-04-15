import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: "standalone",
  allowedDevOrigins: ["*"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
