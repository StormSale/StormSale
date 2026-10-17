/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The indexer is a separate package with its own dependencies and test run.
  test: { exclude: ["**/node_modules/**", "**/dist/**", "indexer/**"] },
});
