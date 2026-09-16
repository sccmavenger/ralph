import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Keep local mobile review controls clear of the fixed bottom navigation.
  devIndicators: false,
  output: "standalone",
  allowedDevOrigins: ["*"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
