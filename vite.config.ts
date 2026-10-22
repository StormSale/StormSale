import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), visualizer({ open: false, gzipSize: true, brotliSize: true })],
  resolve: {
    dedupe: ["react", "react-dom"],
    preserveSymlinks: true,
  },
  build: {
    rollupOptions: {
      external: ["@ledgerhq/hw-transport-webhid", "@ledgerhq/hw-app-str"],
      output: {
        manualChunks: (id) => {
          if (id.includes("@stellar/stellar-sdk") || id.includes("@stellar/freighter-api")) {
            return "vendor-stellar-sdk";
          }
          if (id.includes("framer-motion")) {
            return "vendor-framer-motion";
          }
          if (id.includes("@radix-ui/")) {
            return "vendor-radix-ui";
          }
        },
      },
    },
  },
  test: {
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/tests/**",
        "src/types/**",
        "src/main.tsx",
        "src/assets/**",
      ],
    },
  },
});
