import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted on the homelab via Docker — emit a standalone server bundle.
  output: "standalone",
  // better-sqlite3 is a native module; keep it out of the bundle so the
  // prebuilt .node binary is loaded from node_modules at runtime.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
