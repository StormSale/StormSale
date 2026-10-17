import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import crypto from "node:crypto";

/**
 * Options for Subresource Integrity (SRI) plugin.
 */
export interface SubresourceIntegrityOptions {
  /**
   * Cryptographic hash algorithm(s) to use.
   * Default: ['sha384'] (W3C standard recommendation for Subresource Integrity)
   */
  algorithms?: ("sha256" | "sha384" | "sha512")[];
  /**
   * Crossorigin attribute to inject for SRI-enabled assets.
   * Default: 'anonymous'
   */
  crossorigin?: "anonymous" | "use-credentials";
}

/**
 * Computes the Subresource Integrity hash for a given content string or buffer.
 */
function computeIntegrity(
  content: string | Uint8Array,
  algorithms: readonly ("sha256" | "sha384" | "sha512")[] = ["sha384"],
): string {
  return algorithms
    .map((algo) => {
      const hash = crypto.createHash(algo).update(content).digest("base64");
      return `${algo}-${hash}`;
    })
    .join(" ");
}

/**
 * Vite plugin for automatic build-time Subresource Integrity (SRI) hash injection.
 * Injects cryptographic hashes and crossorigin attributes into HTML asset tags (<script>, <link>)
 * and output bundle entries to prevent resource tampering on script and asset load.
 */
export function subresourceIntegrity(options?: SubresourceIntegrityOptions): Plugin {
  const algorithms = options?.algorithms ?? ["sha384"];
  const crossOrigin = options?.crossorigin ?? "anonymous";
  let base = "/";

  return {
    name: "vite-plugin-subresource-integrity",
    enforce: "post",
    apply: "build",

    configResolved(config) {
      base = config.base || "/";
    },

    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) {
          return html;
        }

        const bundle = ctx.bundle;

        const findBundleItem = (url: string) => {
          const cleanUrl = url.split(/[?#]/)[0];
          let normalized = cleanUrl;
          if (base !== "/" && normalized.startsWith(base)) {
            normalized = normalized.slice(base.length);
          }
          normalized = normalized.replace(/^\.?\//, "");

          if (bundle[normalized]) {
            return bundle[normalized];
          }

          const byFileName = Object.values(bundle).find((item) => item.fileName === normalized);
          if (byFileName) {
            return byFileName;
          }

          const bySuffix = Object.values(bundle).find(
            (item) =>
              item.fileName.endsWith("/" + normalized) || normalized.endsWith("/" + item.fileName),
          );
          if (bySuffix) {
            return bySuffix;
          }

          const baseName = normalized.split("/").pop();
          if (baseName) {
            return Object.values(bundle).find(
              (item) => item.fileName.split("/").pop() === baseName,
            );
          }

          return undefined;
        };

        // 1. Process <script ...> tags
        html = html.replace(/<script\b([^>]*)>/gi, (fullMatch, attrs) => {
          const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
          if (!srcMatch) return fullMatch;
          const src = srcMatch[1];
          if (/^(https?:)?\/\//i.test(src) && !src.startsWith("/")) {
            return fullMatch;
          }

          const item = findBundleItem(src);
          if (!item) return fullMatch;

          const content = item.type === "chunk" ? item.code : item.source;
          if (!content) return fullMatch;

          const integrity = computeIntegrity(content, algorithms);
          const isSelfClosing = /\/\s*$/.test(attrs);
          let cleanedAttrs = attrs.replace(/\/\s*$/, "").trim();

          if (!/\bintegrity\b/i.test(cleanedAttrs)) {
            cleanedAttrs += ` integrity="${integrity}"`;
          }
          if (!/\bcrossorigin\b/i.test(cleanedAttrs)) {
            cleanedAttrs += ` crossorigin="${crossOrigin}"`;
          }

          return `<script ${cleanedAttrs}${isSelfClosing ? " />" : ">"}`;
        });

        // 2. Process <link ...> tags (stylesheets, modulepreload, preload)
        html = html.replace(/<link\b([^>]*)>/gi, (fullMatch, attrs) => {
          const relMatch = attrs.match(/\brel=["']([^"']+)["']/i);
          const rel = relMatch ? relMatch[1].toLowerCase() : "";
          if (!["stylesheet", "modulepreload", "preload"].includes(rel)) {
            return fullMatch;
          }

          const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
          if (!hrefMatch) return fullMatch;
          const href = hrefMatch[1];
          if (/^(https?:)?\/\//i.test(href) && !href.startsWith("/")) {
            return fullMatch;
          }

          const item = findBundleItem(href);
          if (!item) return fullMatch;

          const content = item.type === "chunk" ? item.code : item.source;
          if (!content) return fullMatch;

          const integrity = computeIntegrity(content, algorithms);
          const isSelfClosing = /\/\s*$/.test(attrs);
          let cleanedAttrs = attrs.replace(/\/\s*$/, "").trim();

          if (!/\bintegrity\b/i.test(cleanedAttrs)) {
            cleanedAttrs += ` integrity="${integrity}"`;
          }
          if (!/\bcrossorigin\b/i.test(cleanedAttrs)) {
            cleanedAttrs += ` crossorigin="${crossOrigin}"`;
          }

          return `<link ${cleanedAttrs}${isSelfClosing ? " />" : ">"}`;
        });

        return html;
      },
    },

    generateBundle(_outputOptions, bundle) {
      for (const [fileName, item] of Object.entries(bundle)) {
        const content = item.type === "chunk" ? item.code : item.source;
        if (content) {
          const hash = computeIntegrity(content, algorithms);
          (item as unknown as { integrity?: string }).integrity = hash;
        }

        if (fileName.endsWith("manifest.json") && item.type === "asset") {
          try {
            const manifest = JSON.parse(item.source.toString());
            for (const entry of Object.values<Record<string, unknown>>(manifest)) {
              if (typeof entry.file === "string" && bundle[entry.file]) {
                const target = bundle[entry.file];
                const targetContent = target.type === "chunk" ? target.code : target.source;
                if (targetContent) {
                  entry.integrity = computeIntegrity(targetContent, algorithms);
                }
              }
              if (Array.isArray(entry.css)) {
                entry.cssIntegrity = entry.css.map((cssFile: string) => {
                  const cssTarget = bundle[cssFile];
                  if (cssTarget && cssTarget.type === "asset") {
                    return computeIntegrity(cssTarget.source, algorithms);
                  }
                  return null;
                });
              }
            }
            item.source = JSON.stringify(manifest, null, 2);
          } catch {
            // Silently fallback if manifest parsing fails
          }
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), subresourceIntegrity()],
});
