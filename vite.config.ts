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
  build: {
    target: "es2020",
  },
});
