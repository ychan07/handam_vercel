import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "ui-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/ui-entry.tsx"),
      output: {
        entryFileNames: "ui.bundle.js",
        assetFileNames: "ui.[ext]",
        inlineDynamicImports: true,
      },
    },
    cssCodeSplit: false,
  },
});
