import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "path";

export default defineConfig({
  plugins: [preact()],
  root: "web",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'lucide': ['lucide-preact'],
          'preact': ['preact', 'preact/compat', 'preact/hooks'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./web/src"),
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
});
