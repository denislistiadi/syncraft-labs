import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: false,
  minify: false,
  // External dependencies (idb) remain external, core modules are bundled for distribution.
  external: [],
});
