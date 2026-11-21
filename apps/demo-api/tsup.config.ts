import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  dts: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ["@libsql/client", "@syncraft-labs/core"],
});
