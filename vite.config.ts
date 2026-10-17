import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { publicCampaignCaching, pwaManifest } from "./src/pwaConfig.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: pwaManifest,
      pwaAssets: {
        config: "pwa-assets.config.ts",
      },
      workbox: {
        runtimeCaching: [publicCampaignCaching],
      },
    }),
  ],
});
