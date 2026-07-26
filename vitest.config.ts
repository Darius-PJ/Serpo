import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // See tests/setup/server-only-stub.ts for why.
      "server-only": path.resolve(__dirname, "tests/setup/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/setup/globalSetup.ts"],
    setupFiles: ["./tests/setup/vitestSetup.ts"],
    include: ["tests/unit/**/*.test.ts"],
    // One shared SQLite file for the whole run (see globalSetup) — avoid
    // concurrent writers hitting SQLite's file lock.
    fileParallelism: false,
  },
});
