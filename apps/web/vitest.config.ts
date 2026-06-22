import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@vang-radar/domain": path.resolve(__dirname, "../../packages/domain/src/index.ts")
    }
  },
  test: {
    environment: "node"
  }
});