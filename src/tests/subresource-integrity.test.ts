import { describe, it, expect } from "vitest";
import { computeIntegrity, subresourceIntegrity } from "../../vite.config";
import type { Plugin, IndexHtmlTransformContext } from "vite";

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
});
