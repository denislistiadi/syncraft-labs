import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  // Keep idb and immer as external in dev, but bundle them for the final package.
  // Users install @syncraft-labs/core which brings idb + immer as dependencies.
  external: [],
});
