import { defineConfig } from "vite";
import react from "@vite/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    format: "es",
    plugins: () => [],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    preserveSymlinks: true,
  },
  build: {
    target: "es2020",
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
});