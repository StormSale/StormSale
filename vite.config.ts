import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
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
  test: {},
});
