import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig as defineVitestConfig } from "vitest/config";

// https://vite.dev/config/
export default defineVitestConfig({
  plugins: [react(), tailwindcss()],
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
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx,js}x"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lconv"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx,jsx,js}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.{test,spec}.{ts,tsx,jsx,js}x",
        "src/tests/**",
        "src/main.tsx",
        "src/types/**",
        "src/assets/**",
      ],
    },
  },
});