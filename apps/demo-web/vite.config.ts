import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromRoot = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), vue()],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: fromRoot("./index.html"),
        vue: fromRoot("./vue.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
