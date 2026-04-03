import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: ".",
  base: "./",
  build: {
    outDir: "dist/client",
  },
  resolve: {
    alias: {
      "@prism/ui": resolve(__dirname, "../../packages/ui/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
