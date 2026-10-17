/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Playwright specs live in e2e/ and run via `npm run test:e2e`
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
