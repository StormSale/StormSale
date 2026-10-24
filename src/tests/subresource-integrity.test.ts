import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  computeIntegrity,
  subresourceIntegrity,
  KNOWN_EXTERNAL_INTEGRITY,
} from "../lib/vite/subresource-integrity-plugin";
import type { Plugin, IndexHtmlTransformContext } from "vite";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invokeHandler = (plugin: Plugin, html: string, bundle: Record<string, any>): string => {
  const handler =
    typeof plugin.transformIndexHtml === "object" &&
    "handler" in plugin.transformIndexHtml
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (plugin.transformIndexHtml as any).handler
      : undefined;
  if (!handler) throw new Error("transformIndexHtml handler is not defined");
  const ctx = { bundle } as unknown as IndexHtmlTransformContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handler(html, ctx) as string;
};

describe("Subresource Integrity (SRI) Plugin & Hashing (#85)", () => {
  describe("computeIntegrity", () => {
    it("computes standard sha384 integrity hash by default", () => {
      const content = "console.log('hello world');";
      const hash = computeIntegrity(content);
      expect(hash).toMatch(/^sha384-[A-Za-z0-9+/=]+$/);
    });

    it("supports custom algorithms including multiple hashes", () => {
      const content = "body { background: #000; }";
      const hash = computeIntegrity(content, ["sha256", "sha512"]);
      const parts = hash.split(" ");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^sha256-[A-Za-z0-9+/=]+$/);
      expect(parts[1]).toMatch(/^sha512-[A-Za-z0-9+/=]+$/);
    });

    it("computes integrity for Uint8Array content", () => {
      const buffer = new TextEncoder().encode("alert('sri test')");
      const hash = computeIntegrity(buffer, ["sha256"]);
      expect(hash).toMatch(/^sha256-[A-Za-z0-9+/=]+$/);
    });
  });

  describe("subresourceIntegrity plugin hooks", () => {
    it("exposes expected Vite plugin configuration", () => {
      const plugin = subresourceIntegrity() as Plugin;
      expect(plugin.name).toBe("vite-plugin-subresource-integrity");
      expect(plugin.enforce).toBe("post");
      expect(plugin.apply).toBe("build");
      expect(plugin.transformIndexHtml).toBeDefined();
      expect(plugin.generateBundle).toBeDefined();
    });

    it("injects integrity and crossorigin attributes into script tags", () => {
      const plugin = subresourceIntegrity() as Plugin;
      const scriptCode = "console.log('app bundle');";
      const expectedIntegrity = computeIntegrity(scriptCode, ["sha384"]);

      const mockBundle: Record<string, any> = {
        "assets/main.js": {
          type: "chunk",
          fileName: "assets/main.js",
          code: scriptCode,
        },
      };

      const handler =
        typeof plugin.transformIndexHtml === "object" && "handler" in plugin.transformIndexHtml
          ? plugin.transformIndexHtml.handler
          : undefined;

      expect(handler).toBeDefined();

      const html = '<!DOCTYPE html><html><head><script src="/assets/main.js"></script></head><body></body></html>';
      const ctx = {
        bundle: mockBundle,
      } as unknown as IndexHtmlTransformContext;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformed = (handler as any)(html, ctx);

      expect(transformed).toContain(`integrity="${expectedIntegrity}"`);
      expect(transformed).toContain('crossorigin="anonymous"');
      expect(transformed).toContain('src="/assets/main.js"');
    });

    it("injects integrity into link tags (stylesheet and preload)", () => {
      const plugin = subresourceIntegrity({ crossorigin: "use-credentials" }) as Plugin;
      const cssCode = ".app { color: red; }";
      const expectedIntegrity = computeIntegrity(cssCode, ["sha384"]);

      const mockBundle: Record<string, any> = {
        "assets/style.css": {
          type: "asset",
          fileName: "assets/style.css",
          source: cssCode,
        },
      };

      const handler =
        typeof plugin.transformIndexHtml === "object" && "handler" in plugin.transformIndexHtml
          ? plugin.transformIndexHtml.handler
          : undefined;

      const html = '<link rel="stylesheet" href="/assets/style.css">';
      const ctx = {
        bundle: mockBundle,
      } as unknown as IndexHtmlTransformContext;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformed = (handler as any)(html, ctx);

      expect(transformed).toContain(`integrity="${expectedIntegrity}"`);
      expect(transformed).toContain('crossorigin="use-credentials"');
    });

    it("does not pin external CDN scripts by default (KNOWN_EXTERNAL_INTEGRITY is opt-in)", () => {
      // Third-party hosts can serve different bytes per request (see the note
      // on KNOWN_EXTERNAL_INTEGRITY in vite.config.ts), so we start from an
      // empty allow-list and require callers to explicitly opt in.
      expect(KNOWN_EXTERNAL_INTEGRITY).toEqual({});

      const plugin = subresourceIntegrity() as Plugin;
      const html = `<script src="https://telegram.org/js/telegram-web-app.js"></script>`;
      const transformed = invokeHandler(plugin, html, {});
      expect(transformed).toBe(html);
      expect(transformed).not.toContain("integrity=");
    });

    it("applies caller-supplied external URL hashes via the `external` option", () => {
      const customUrl = "https://cdn.example.com/widget.js";
      const customHash = "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const plugin = subresourceIntegrity({ external: { [customUrl]: customHash } }) as Plugin;

      const html = `<script src="${customUrl}"></script>`;
      const transformed = invokeHandler(plugin, html, {});

      expect(transformed).toContain(`integrity="${customHash}"`);
      expect(transformed).toContain('crossorigin="anonymous"');
    });

    it("bypasses external and protocol-relative URLs", () => {
      const plugin = subresourceIntegrity() as Plugin;
      const handler =
        typeof plugin.transformIndexHtml === "object" && "handler" in plugin.transformIndexHtml
          ? plugin.transformIndexHtml.handler
          : undefined;

      const html = `
        <script src="https://cdn.example.com/lib.js"></script>
        <script src="//cdn.example.com/protocol-relative.js"></script>
        <link rel="stylesheet" href="//cdn.example.com/style.css">
        <link rel="stylesheet" href="http://cdn.example.com/style.css">
      `;
      const ctx = {
        bundle: {},
      } as unknown as IndexHtmlTransformContext;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformed = (handler as any)(html, ctx);

      expect(transformed).toBe(html);
      expect(transformed).not.toContain("integrity=");
    });

    it("does not allow data-integrity to suppress actual integrity attribute insertion", () => {
      const plugin = subresourceIntegrity() as Plugin;
      const scriptCode = "console.log('data-integrity test');";
      const expectedIntegrity = computeIntegrity(scriptCode, ["sha384"]);

      const mockBundle: Record<string, any> = {
        "assets/app.js": {
          type: "chunk",
          fileName: "assets/app.js",
          code: scriptCode,
        },
      };

      const handler =
        typeof plugin.transformIndexHtml === "object" && "handler" in plugin.transformIndexHtml
          ? plugin.transformIndexHtml.handler
          : undefined;

      const html = '<script src="/assets/app.js" data-integrity="custom-meta-value"></script>';
      const ctx = {
        bundle: mockBundle,
      } as unknown as IndexHtmlTransformContext;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformed = (handler as any)(html, ctx);

      expect(transformed).toContain(`integrity="${expectedIntegrity}"`);
      expect(transformed).toContain('data-integrity="custom-meta-value"');
    });

    it("does not match bundle items via suffix or basename fallback", () => {
      const plugin = subresourceIntegrity() as Plugin;
      const handler =
        typeof plugin.transformIndexHtml === "object" && "handler" in plugin.transformIndexHtml
          ? plugin.transformIndexHtml.handler
          : undefined;

      const mockBundle: Record<string, any> = {
        "assets/nested/chunk.js": {
          type: "chunk",
          fileName: "assets/nested/chunk.js",
          code: "console.log('nested');",
        },
      };

      // Querying only by basename "chunk.js" or mismatched path should not match now
      const html = '<script src="/chunk.js"></script>';
      const ctx = {
        bundle: mockBundle,
      } as unknown as IndexHtmlTransformContext;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformed = (handler as any)(html, ctx);

      expect(transformed).toBe(html);
      expect(transformed).not.toContain("integrity=");
    });

    it("populates bundle integrity and manifest integrity in generateBundle", () => {
      const plugin = subresourceIntegrity() as Plugin;
      const chunkCode = "console.log('bundle chunk');";
      const assetCode = "body { margin: 0; }";

      const manifestContent = {
        "src/main.ts": {
          file: "assets/main.js",
          css: ["assets/style.css"],
        },
      };

      const mockBundle: Record<string, any> = {
        "assets/main.js": {
          type: "chunk",
          fileName: "assets/main.js",
          code: chunkCode,
        },
        "assets/style.css": {
          type: "asset",
          fileName: "assets/style.css",
          source: assetCode,
        },
        "manifest.json": {
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(manifestContent),
        },
      };

      const generateBundle = plugin.generateBundle;
      expect(generateBundle).toBeDefined();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (generateBundle as any).call({} as any, {}, mockBundle);

      expect((mockBundle["assets/main.js"] as any).integrity).toBe(
        computeIntegrity(chunkCode, ["sha384"]),
      );
      expect((mockBundle["assets/style.css"] as any).integrity).toBe(
        computeIntegrity(assetCode, ["sha384"]),
      );

      const parsedManifest = JSON.parse(mockBundle["manifest.json"].source.toString());
      expect(parsedManifest["src/main.ts"].integrity).toBe(computeIntegrity(chunkCode, ["sha384"]));
      expect(parsedManifest["src/main.ts"].cssIntegrity).toEqual([
        computeIntegrity(assetCode, ["sha384"]),
      ]);
    });
  });

  // Rolldown (Vite 8) finalises chunk bytes after `transformIndexHtml`, so the
  // plugin re-derives integrity from the on-disk file in `closeBundle`. These
  // cases cover that post-write pass — the one Playwright actually exercises.
  describe("closeBundle (disk-authoritative SRI overwrite)", () => {
    let tmpRoot = "";
    beforeAll(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), "storm-sri-"));
    });
    afterAll(() => {
      if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invokeCloseBundle = (plugin: any) => {
      expect(typeof plugin.closeBundle).toBe("function");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.closeBundle.call({} as any);
    };

    const configurePlugin = (plugin: any, outDir: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.configResolved({
        base: "/",
        root: tmpRoot,
        build: { outDir },
      });
    };

    it("overwrites a stale integrity attribute with the digest of the file on disk", () => {
      const chunkBytes = Buffer.from("console.log('disk chunk');\n", "utf8");
      const dir = join(tmpRoot, "case1");
      mkdirSync(join(dir, "assets"), { recursive: true });
      writeFileSync(join(dir, "assets", "index-abc.js"), chunkBytes);
      const expected = computeIntegrity(chunkBytes, ["sha384"]);
      writeFileSync(
        join(dir, "index.html"),
        '<script type="module" crossorigin src="/assets/index-abc.js" integrity="sha384-STALEPLACEHOLDERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"></script>',
        "utf8",
      );

      const plugin = subresourceIntegrity();
      configurePlugin(plugin, dir);
      invokeCloseBundle(plugin);

      const out = readFileSync(join(dir, "index.html"), "utf8");
      expect(out).toContain(`integrity="${expected}"`);
      expect(out).not.toContain("STALEPLACEHOLDER");
    });

    it("adds integrity + crossorigin to tags that lack them", () => {
      const cssBytes = Buffer.from("body{margin:0}", "utf8");
      const dir = join(tmpRoot, "case2");
      mkdirSync(join(dir, "assets"), { recursive: true });
      writeFileSync(join(dir, "assets", "style.css"), cssBytes);
      writeFileSync(
        join(dir, "index.html"),
        '<link rel="stylesheet" href="/assets/style.css">',
        "utf8",
      );
      const expected = computeIntegrity(cssBytes, ["sha384"]);

      const plugin = subresourceIntegrity();
      configurePlugin(plugin, dir);
      invokeCloseBundle(plugin);

      const out = readFileSync(join(dir, "index.html"), "utf8");
      expect(out).toContain(`integrity="${expected}"`);
      expect(out).toContain('crossorigin="anonymous"');
    });

    it("leaves unknown external URLs untouched", () => {
      const dir = join(tmpRoot, "case3");
      mkdirSync(dir, { recursive: true });
      const original = '<script src="https://telegram.org/js/telegram-web-app.js"></script>';
      writeFileSync(join(dir, "index.html"), original, "utf8");

      const plugin = subresourceIntegrity();
      configurePlugin(plugin, dir);
      invokeCloseBundle(plugin);

      const out = readFileSync(join(dir, "index.html"), "utf8");
      expect(out).toBe(original);
    });

    it("applies caller-supplied external integrity for allow-listed URLs", () => {
      const dir = join(tmpRoot, "case4");
      mkdirSync(dir, { recursive: true });
      const customUrl = "https://cdn.example.com/lib.js";
      const customHash = "sha384-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      writeFileSync(
        join(dir, "index.html"),
        `<script src="${customUrl}"></script>`,
        "utf8",
      );

      const plugin = subresourceIntegrity({ external: { [customUrl]: customHash } });
      configurePlugin(plugin, dir);
      invokeCloseBundle(plugin);

      const out = readFileSync(join(dir, "index.html"), "utf8");
      expect(out).toContain(`integrity="${customHash}"`);
      expect(out).toContain('crossorigin="anonymous"');
    });

    it("skips local URLs that are missing on disk (no crash)", () => {
      const dir = join(tmpRoot, "case5");
      mkdirSync(dir, { recursive: true });
      const original = '<script src="/assets/does-not-exist.js"></script>';
      writeFileSync(join(dir, "index.html"), original, "utf8");

      const plugin = subresourceIntegrity();
      configurePlugin(plugin, dir);
      expect(() => invokeCloseBundle(plugin)).not.toThrow();
      const out = readFileSync(join(dir, "index.html"), "utf8");
      expect(out).toBe(original);
    });
  });
});
