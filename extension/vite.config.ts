import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@horizon/shared/csv-import",
        replacement: resolve(root, "../packages/shared/src/csv-import.ts")
      },
      {
        find: "@horizon/shared/deduplication",
        replacement: resolve(root, "../packages/shared/src/deduplication.ts")
      },
      {
        find: "@horizon/shared",
        replacement: resolve(root, "../packages/shared/src/index.ts")
      }
    ]
  },
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        background: resolve(root, "src/background.ts"),
        sidepanel: resolve(root, "src/sidepanel.html")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
