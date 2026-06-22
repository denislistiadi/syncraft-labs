import { defineWorkspace } from "vitest/config";

/**
 * Vitest workspace configuration.
 * Discovers all packages with vitest configs for parallel test execution.
 */
export default defineWorkspace([
  "packages/*/vitest.config.ts",
]);
