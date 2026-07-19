import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    // Same classic JSX transform the worker uses, so component tests render the
    // way the build does.
    jsx: "transform",
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Integration tests share one Postgres and spawn real worker processes.
    // Running files sequentially keeps failures readable and jobs unambiguous.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
