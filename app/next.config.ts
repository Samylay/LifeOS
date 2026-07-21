import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted on the homelab via Docker — emit a standalone server bundle.
  output: "standalone",
  // better-sqlite3 is a native module; keep it out of the bundle so the
  // prebuilt .node binary is loaded from node_modules at runtime.
  serverExternalPackages: ["better-sqlite3"],
  // Single-user tailnet app that redeploys often: never let a browser or the
  // Tailscale Serve proxy hold a stale page. Next statically renders /, /settings
  // etc. with `Cache-Control: s-maxage=31536000`, so a deploy's new JS chunk
  // hashes were never fetched (the phone kept a year-old HTML). Force
  // revalidation on every document/data request; hashed static assets under
  // /_next/static are immutable and keep their long cache.
  async headers() {
    return [
      {
        source: "/:path*",
        missing: [{ type: "header", key: "next-router-prefetch" }],
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
