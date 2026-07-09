import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" -> "./src/*" so tests can exercise modules that
    // use the Next.js import alias.
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
