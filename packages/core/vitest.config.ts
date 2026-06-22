import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // fake-indexeddb is set up in the setup file
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
