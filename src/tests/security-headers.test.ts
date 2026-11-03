import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Import CommonJS module functions
// @ts-expect-error CJS module import
import * as securityHeaders from "../../scripts/check-security-headers.cjs";

const {
  REQUIRED_SECURITY_HEADERS,
  NGINX_CONFIG_PATH,
  VERCEL_CONFIG_PATH,
  normalizeHeaderValue,
  readNginxHeaders,
  readVercelHeaders,
  evaluateHeaders,
  checkVercelConfig,
  checkNginxConfig,
  generateMarkdownReport,
} = securityHeaders;

describe("Strict Security Headers (#215)", () => {
  describe("vercel.json", () => {
    it("declares every required security header", () => {
      const failing = checkVercelConfig().filter((result: { ok: boolean }) => !result.ok);

      expect(failing.map((result: { key: string }) => result.key)).toEqual([]);
    });

    it("applies the headers to every route", () => {
      const headers = readVercelHeaders(VERCEL_CONFIG_PATH);

      expect(Object.keys(headers)).toEqual(
        expect.arrayContaining(
          REQUIRED_SECURITY_HEADERS.map((header: { key: string }) => header.key),
        ),
      );
    });

    it("pins HSTS to two years with includeSubDomains and preload", () => {
      const headers = readVercelHeaders(VERCEL_CONFIG_PATH);
      const hsts = headers["Strict-Transport-Security"].value;

      expect(hsts).toContain("max-age=63072000");
      expect(hsts).toContain("includeSubDomains");
      expect(hsts).toContain("preload");
    });

    it("blocks framing through both X-Frame-Options and CSP frame-ancestors", () => {
      const headers = readVercelHeaders(VERCEL_CONFIG_PATH);

      expect(headers["X-Frame-Options"].value).toBe("DENY");
      expect(headers["Content-Security-Policy"].value).toContain("frame-ancestors 'none'");
    });

    it("blocks inline scripts and limits network connections to approved services", () => {
      const policy = readVercelHeaders(VERCEL_CONFIG_PATH)["Content-Security-Policy"].value;
      const scriptPolicy = policy
        .split(";")
        .find((directive: string) => directive.trim().startsWith("script-src "));
      const connectPolicy = policy
        .split(";")
        .find((directive: string) => directive.trim().startsWith("connect-src "));

      expect(scriptPolicy).toContain("'self'");
      expect(scriptPolicy).toContain("https://telegram.org");
      expect(scriptPolicy).not.toContain("'unsafe-inline'");
      expect(scriptPolicy).not.toContain("'unsafe-eval'");
      expect(connectPolicy).toContain("https://soroban-testnet.stellar.org");
      expect(connectPolicy).toContain("https://soroban-rpc.mainnet.stellar.org");
      expect(connectPolicy.split(/\s+/)).not.toContain("https:");
    });

    it("keeps the application entry point on external scripts", () => {
      const html = readFileSync("index.html", "utf8");
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts.every((script) => /\bsrc\s*=/.test(script[1]) && !script[2].trim())).toBe(
        true,
      );
    });

    it("disables the legacy XSS auditor instead of enabling it", () => {
      const headers = readVercelHeaders(VERCEL_CONFIG_PATH);

      expect(headers["X-XSS-Protection"].value).toBe("0");
    });
  });

  describe("nginx.conf", () => {
    it("declares every required security header", () => {
      const failing = checkNginxConfig().filter((result: { ok: boolean }) => !result.ok);

      expect(failing.map((result: { key: string }) => result.key)).toEqual([]);
    });

    it("emits every header with the `always` flag so error responses carry them", () => {
      const headers = readNginxHeaders(NGINX_CONFIG_PATH);

      for (const required of REQUIRED_SECURITY_HEADERS) {
        expect(headers[required.key].always).toBe(true);
      }
    });

    it("keeps the HTTP listener redirecting to HTTPS", () => {
      const headers = readNginxHeaders(NGINX_CONFIG_PATH);

      expect(headers["Strict-Transport-Security"].value).toContain("preload");
    });
  });

  describe("header evaluation", () => {
    it("flags a missing header", () => {
      const results = evaluateHeaders({});

      expect(results.every((result: { ok: boolean }) => !result.ok)).toBe(true);
    });

    it("flags a mismatched value", () => {
      const results = evaluateHeaders({
        "X-Frame-Options": { value: "SAMEORIGIN", always: true },
      });
      const frameOptions = results.find(
        (result: { key: string }) => result.key === "X-Frame-Options",
      );

      expect(frameOptions.ok).toBe(false);
      expect(frameOptions.present).toBe(true);
    });

    it("flags an nginx header that is missing the `always` flag", () => {
      const results = evaluateHeaders({
        "X-Frame-Options": { value: "DENY", always: false },
      });
      const frameOptions = results.find(
        (result: { key: string }) => result.key === "X-Frame-Options",
      );

      expect(frameOptions.ok).toBe(false);
    });

    it("compares values case-insensitively", () => {
      expect(normalizeHeaderValue("DENY")).toBe(normalizeHeaderValue("deny"));
      expect(normalizeHeaderValue("  max-age=63072000;  includeSubDomains ")).toBe(
        normalizeHeaderValue("max-age=63072000; includeSubDomains"),
      );
    });

    it("reports every required header as satisfied for a correct configuration", () => {
      const headers = Object.fromEntries(
        REQUIRED_SECURITY_HEADERS.map((header: { key: string; value: string }) => [
          header.key,
          { value: header.value, always: true },
        ]),
      );
      const results = evaluateHeaders(headers);

      expect(results.every((result: { ok: boolean }) => result.ok)).toBe(true);
    });
  });

  describe("report generation", () => {
    it("renders a markdown table for every audited section", () => {
      const report = generateMarkdownReport([
        { title: "`vercel.json`", results: checkVercelConfig() },
        { title: "`nginx.conf`", results: checkNginxConfig() },
      ]);

      expect(report).toContain("Security Headers Audit");
      expect(report).toContain("`vercel.json`");
      expect(report).toContain("`nginx.conf`");
      expect(report).toContain("Strict-Transport-Security");
      expect(report).toContain("All required headers present");
    });
  });
});
