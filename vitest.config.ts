import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside the React Server environment; tests run in plain Node.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    env: {
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
  },
});
