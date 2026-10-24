import type { Plugin } from "vite";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve as resolvePath, sep } from "node:path";

/**
 * Minimal structural shape of a Rollup/Rolldown bundle entry that the SRI
 * plugin needs. Declared locally so we do not add `rollup` as a direct
 * dependency (Vite 8 ships Rolldown and only re-exports a subset of Rollup
 * types). Compatible with both `OutputAsset` and `OutputChunk`.
 */
type BundleItem = {
  type: "chunk" | "asset";
  fileName: string;
  code?: string;
  source?: string | Uint8Array;
  integrity?: string;
};
type BundleLike = Record<string, BundleItem>;

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
  /**
   * Integrity hashes for external (absolute or protocol-relative) URLs such as
   * third-party CDN scripts. Keys are exact URLs found in the HTML `src`/`href`
   * attribute; values are pre-computed integrity strings (e.g. `sha384-…`).
   *
   * Any external URL not present in this map is left untouched, so the caller
   * stays in control of which third-party resources are pinned.
   */
  external?: Record<string, string>;
}

/**
 * Well-known integrity hashes for third-party assets loaded from StormSale's
 * `index.html`. Keep this map small and reviewed — values must be produced from
 * the upstream file (e.g. `openssl dgst -sha384 -binary file.js | base64 -w0`)
 * so the browser can verify them at load-time.
 *
 * Third-party assets that vary by request headers (compression, referer,
 * user-agent) cannot be safely pinned from the build host and are intentionally
 * left un-listed so consumers opt-in explicitly via `subresourceIntegrity({
 * external: { ... } })`. Notably `https://telegram.org/js/telegram-web-app.js`
 * is served with different bytes depending on the client's `sec-fetch-*` and
 * `referer` headers, so pinning a hash computed via Node's `fetch` breaks the
 * browser integrity check (see PR #85 e2e run on Playwright Chromium).
 */
export const KNOWN_EXTERNAL_INTEGRITY: Record<string, string> = {};

/**
 * Computes the Subresource Integrity hash for a given content string or buffer.
 */
export function computeIntegrity(
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
  const externalMap: Record<string, string> = {
    ...KNOWN_EXTERNAL_INTEGRITY,
    ...(options?.external ?? {}),
  };
  const EXTERNAL_URL_RE = /^(https?:)?\/\//i;
  let base = "/";
  let projectRoot = process.cwd();
  let outDir = "dist";
  let resolvedOutDir = resolvePath(process.cwd(), "dist");

  /**
   * Given a `src`/`href` value, return the integrity string to inject or
   * `undefined` when the tag should be left untouched.
   */
  const resolveIntegrity = (url: string, bundle: BundleLike): string | undefined => {
    if (EXTERNAL_URL_RE.test(url)) {
      // Pin only explicitly allow-listed third-party URLs.
      return externalMap[url];
    }

    const cleanUrl = url.split(/[?#]/)[0];
    let normalized = cleanUrl;
    if (base !== "/" && normalized.startsWith(base)) {
      normalized = normalized.slice(base.length);
    }
    normalized = normalized.replace(/^\.?\//, "");

    const item: BundleItem | undefined =
      bundle[normalized] ?? Object.values(bundle).find((i) => i.fileName === normalized);
    if (!item) return undefined;

    const content = item.type === "chunk" ? item.code : item.source;
    if (!content) return undefined;
    return computeIntegrity(content, algorithms);
  };

  const applyIntegrityAttrs = (attrs: string, integrity: string) => {
    const isSelfClosing = /\/\s*$/.test(attrs);
    let cleaned = attrs.replace(/\/\s*$/, "").trim();
    if (!/(?:^|\s)integrity(?=[\s=>]|$)/i.test(cleaned)) {
      cleaned += ` integrity="${integrity}"`;
    }
    if (!/(?:^|\s)crossorigin(?=[\s=>]|$)/i.test(cleaned)) {
      cleaned += ` crossorigin="${crossOrigin}"`;
    }
    return { cleaned, isSelfClosing };
  };

  /**
   * Normalise a URL to a path relative to the outDir, stripping the site base
   * and any query/hash. Returns `null` for external or empty URLs.
   */
  const normalizeLocal = (url: string): string | null => {
    const clean = url.split(/[?#]/)[0];
    let rel = clean;
    if (base !== "/" && rel.startsWith(base)) rel = rel.slice(base.length);
    rel = rel.replace(/^\.?\//, "");
    return rel || null;
  };

  /**
   * Rewrite a single `<script>` / `<link>` tag in the built HTML using the
   * on-disk digest of its referenced local asset (or the allow-listed hash for
   * a pinned external URL). Tags without a matching source or entry in
   * `externalMap` are returned unchanged.
   */
  const rewriteTag = (
    fullMatch: string,
    attrs: string,
    tagName: "script" | "link",
    urlAttr: "src" | "href",
  ): string => {
    const urlMatch = attrs.match(new RegExp(`\\b${urlAttr}=["']([^"']+)["']`, "i"));
    if (!urlMatch) return fullMatch;
    const url = urlMatch[1];

    let integrity: string | undefined;
    if (EXTERNAL_URL_RE.test(url)) {
      integrity = externalMap[url];
    } else {
      const rel = normalizeLocal(url);
      if (!rel) return fullMatch;
      const filePath = resolvePath(resolvedOutDir, rel);
      // Guard against path traversal escaping the outDir.
      if (filePath !== resolvedOutDir && !filePath.startsWith(resolvedOutDir + sep)) {
        return fullMatch;
      }
      if (!existsSync(filePath)) return fullMatch;
      integrity = computeIntegrity(readFileSync(filePath), algorithms);
    }
    if (!integrity) return fullMatch;

    const isSelfClosing = /\/\s*$/.test(attrs);
    let cleaned = attrs.replace(/\/\s*$/, "").trim();
    if (/(?:^|\s)integrity(?=[\s=>]|$)/i.test(cleaned)) {
      cleaned = cleaned.replace(/(\s+integrity=)["'][^"']*["']/i, `$1"${integrity}"`);
    } else {
      cleaned += ` integrity="${integrity}"`;
    }
    if (!/(?:^|\s)crossorigin(?=[\s=>]|$)/i.test(cleaned)) {
      cleaned += ` crossorigin="${crossOrigin}"`;
    }
    return `<${tagName} ${cleaned}${isSelfClosing ? " />" : ">"}`;
  };

  return {
    name: "vite-plugin-subresource-integrity",
    enforce: "post",
    apply: "build",

    configResolved(config) {
      base = config.base || "/";
      projectRoot = config.root || process.cwd();
      outDir = config.build?.outDir || "dist";
      resolvedOutDir = resolvePath(projectRoot, outDir);
    },

    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) {
          return html;
        }

        const bundle = ctx.bundle as unknown as BundleLike;

        // 1. Process <script ...> tags (both first-party bundle and pinned external URLs)
        html = html.replace(/<script\b([^>]*)>/gi, (fullMatch, attrs: string) => {
          const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
          if (!srcMatch) return fullMatch;
          const integrity = resolveIntegrity(srcMatch[1], bundle);
          if (!integrity) return fullMatch;
          const { cleaned, isSelfClosing } = applyIntegrityAttrs(attrs, integrity);
          return `<script ${cleaned}${isSelfClosing ? " />" : ">"}`;
        });

        // 2. Process <link ...> tags (stylesheets, modulepreload, preload)
        html = html.replace(/<link\b([^>]*)>/gi, (fullMatch, attrs: string) => {
          const relMatch = attrs.match(/\brel=["']([^"']+)["']/i);
          const rel = relMatch ? relMatch[1].toLowerCase() : "";
          if (!["stylesheet", "modulepreload", "preload"].includes(rel)) {
            return fullMatch;
          }
          const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
          if (!hrefMatch) return fullMatch;
          const integrity = resolveIntegrity(hrefMatch[1], bundle);
          if (!integrity) return fullMatch;
          const { cleaned, isSelfClosing } = applyIntegrityAttrs(attrs, integrity);
          return `<link ${cleaned}${isSelfClosing ? " />" : ">"}`;
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

    /**
     * Rolldown (Vite 8) may still finalise chunk bytes after `transformIndexHtml`
     * runs, so any integrity value computed from `chunk.code` in that earlier
     * hook can diverge from the file that ends up on disk and be rejected by the
     * browser (Playwright e2e surfaced this as `Failed to find a valid digest…`
     * for every emitted asset). This post-write pass re-derives integrity from
     * the actual bytes in `dist/` and overwrites the attribute in `index.html`,
     * which is the single source of truth the browser will fetch.
     */
    closeBundle() {
      const htmlPath = join(resolvedOutDir, "index.html");
      if (!existsSync(htmlPath)) return;

      let html = readFileSync(htmlPath, "utf8");
      html = html.replace(/<script\b([^>]*)>/gi, (m, a: string) => rewriteTag(m, a, "script", "src"));
      html = html.replace(/<link\b([^>]*)>/gi, (m, a: string) => {
        const relMatch = a.match(/\brel=["']([^"']+)["']/i);
        const rel = relMatch ? relMatch[1].toLowerCase() : "";
        if (!["stylesheet", "modulepreload", "preload"].includes(rel)) return m;
        return rewriteTag(m, a, "link", "href");
      });
      writeFileSync(htmlPath, html, "utf8");
    },
  };
}
