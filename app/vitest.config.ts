import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" -> "./src/*" so tests can exercise modules that
    // use the Next.js import alias.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // `next build` copies src/ (test files and all) into .next/standalone, so
    // without this vitest collects every test TWICE — once real, once from a
    // stale build snapshot. That inflated the counts this repo reports:
    // 46 files / 400 tests where the real suite is 28 / 227, and it drifts with
    // whatever the last build happened to contain. A green run has to mean the
    // code on disk passed, not a copy of it from some earlier build.
    //
    // `exclude` REPLACES vitest's defaults rather than extending them, so the
    // usual entries are repeated here.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
    ],
  },
});
