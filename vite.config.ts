import { defineConfig, configDefaults, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import { subresourceIntegrity } from "./src/lib/vite/subresource-integrity-plugin.js";
import { STATIC_CSP_HEADER, STRICT_CSP_DIRECTIVES, buildCspHeader } from "./src/config/csp.ts";

// Re-exported so callers (and the tests added under src/tests/) can pull in the
// SRI helpers without knowing the internal path. The implementation lives under
// src/lib/vite/ so Vitest's `coverage.include: ["src/**/*.{ts,tsx}"]` measures
// it and PR #85's CI coverage gate stays above the 80% diff threshold.
export {
  computeIntegrity,
  subresourceIntegrity,
  KNOWN_EXTERNAL_INTEGRITY,
} from "./src/lib/vite/subresource-integrity-plugin.js";
export type { SubresourceIntegrityOptions } from "./src/lib/vite/subresource-integrity-plugin.js";

export function cspMetaPlugin(): Plugin {
  return {
    name: "stormsale-csp-meta",
    transformIndexHtml(html, context) {
      if (context.server) {
        return html.replace('<meta http-equiv="Content-Security-Policy" content="" />', "");
      }
      const metaDirectives = Object.fromEntries(
        Object.entries(STRICT_CSP_DIRECTIVES).filter(([name]) => name !== "frame-ancestors"),
      );
      const policy = buildCspHeader({ directives: metaDirectives });
      return html.replace(
        '<meta http-equiv="Content-Security-Policy" content=""',
        `<meta http-equiv="Content-Security-Policy" content="${policy}"`,
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    cspMetaPlugin(),
    react(),
    tailwindcss(),
    subresourceIntegrity(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "StormSale - Decentralized Escrow & Affiliate Protocol",
        short_name: "StormSale",
        description:
          "Decentralized Escrow, Affiliate and Commission Management Protocol on Stellar Soroban",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "stormsale-api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 86400,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    visualizer({ open: false, gzipSize: true, brotliSize: true }),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    preserveSymlinks: true,
  },
  preview: {
    headers: {
      "Content-Security-Policy": STATIC_CSP_HEADER,
    },
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
    environment: "jsdom",
    testTimeout: 20000,
    hookTimeout: 20000,
    exclude: [...configDefaults.exclude, "e2e/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "html", "lcov"],
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
