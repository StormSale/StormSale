import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface PhpParseResult {
  errors?: unknown[];
}

interface PhpParserEngine {
  parseCode(code: string, filename: string): PhpParseResult;
}

interface PhpParserEngineConstructor {
  new (options: Record<string, unknown>): PhpParserEngine;
}

interface ReferralCore {
  normalizeAffiliateId(value: unknown): string;
  isValidAffiliateId(value: unknown): boolean;
  sanitizeClickId(value: unknown): string;
  parseQueryString(query: unknown): Record<string, string>;
  extractReferral(
    location: { search?: string; hash?: string },
    config?: { affiliateParam?: string; clickParam?: string },
  ): { affiliateId: string; clickId: string; source: string } | null;
  buildClickRequest(
    referral: { affiliateId?: string; clickId?: string },
    meta?: { url?: string; referrer?: string; campaignId?: string },
  ): {
    affiliate_id: string;
    click_id: string;
    landing_url: string;
    referrer: string;
    campaign_id: string;
  };
}

const pluginRoot = fileURLToPath(new URL("../../plugins/stormsale-woocommerce", import.meta.url));

function collectFiles(dir: string, extension: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") {
        continue;
      }

      files.push(...collectFiles(fullPath, extension));
    } else if (entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

function loadReferralCore(): ReferralCore {
  const source = readFileSync(join(pluginRoot, "assets/js/ssw-referral-core.js"), "utf8");
  const moduleShim: { exports: unknown } = { exports: {} };
  const evaluator = new Function("module", "exports", "window", "self", source);

  evaluator(moduleShim, moduleShim.exports, undefined, undefined);

  return moduleShim.exports as ReferralCore;
}

describe("StormSale WooCommerce plugin package", () => {
  it("ships the expected package files", () => {
    const expected = [
      "stormsale-woocommerce.php",
      "uninstall.php",
      "readme.txt",
      "composer.json",
      "phpunit.xml.dist",
      "includes/class-stormsale-crypto.php",
      "includes/class-stormsale-settings.php",
      "includes/class-stormsale-api-client.php",
      "includes/class-stormsale-referral.php",
      "includes/class-stormsale-conversion.php",
      "includes/class-stormsale-plugin.php",
      "assets/js/ssw-referral-core.js",
      "assets/js/ssw-tracking.js",
    ];

    for (const relativePath of expected) {
      expect(existsSync(join(pluginRoot, relativePath)), `${relativePath} is missing`).toBe(true);
    }
  });

  it("declares the WordPress plugin header", () => {
    const main = readFileSync(join(pluginRoot, "stormsale-woocommerce.php"), "utf8");

    expect(main).toMatch(/Plugin Name:\s*StormSale WooCommerce/);
    expect(main).toMatch(/Requires PHP:\s*7\.4/);
    expect(main).toMatch(/WC requires at least:\s*7\.0/);
    expect(main).toMatch(/Text Domain:\s*stormsale-woocommerce/);
    expect(main).not.toContain("TODO");
  });

  it("hooks into the required WooCommerce lifecycle actions", () => {
    const referral = readFileSync(
      join(pluginRoot, "includes/class-stormsale-referral.php"),
      "utf8",
    );
    const conversion = readFileSync(
      join(pluginRoot, "includes/class-stormsale-conversion.php"),
      "utf8",
    );

    expect(conversion).toContain("woocommerce_payment_complete");
    expect(referral).toContain("woocommerce_checkout_create_order");
    expect(referral).toContain("woocommerce_store_api_checkout_order_processed");
  });

  it("guards every PHP entry point against direct access", () => {
    const phpFiles = collectFiles(pluginRoot, ".php");
    const main = readFileSync(join(pluginRoot, "stormsale-woocommerce.php"), "utf8");
    const uninstall = readFileSync(join(pluginRoot, "uninstall.php"), "utf8");

    expect(phpFiles.length).toBeGreaterThan(0);

    for (const file of phpFiles) {
      const source = readFileSync(file, "utf8");
      const guarded =
        source.includes("ABSPATH") ||
        source.includes("WP_UNINSTALL_PLUGIN") ||
        file === main ||
        file === uninstall;

      expect(guarded, `${file} is not guarded`).toBe(true);
    }
  });

  it("contains no unfilled markers or stub data", () => {
    for (const file of [...collectFiles(pluginRoot, ".php"), ...collectFiles(pluginRoot, ".js")]) {
      const source = readFileSync(file, "utf8");

      expect(source, `${file} contains a TODO marker`).not.toMatch(/\bTODO\b/);
      expect(source, `${file} contains a FIXME marker`).not.toMatch(/\bFIXME\b/);
    }
  });

  it("parses every PHP source file without syntax errors", () => {
    const PhpParser = require("php-parser") as PhpParserEngineConstructor;
    const engine = new PhpParser({
      parser: { extractDoc: true, version: "8.0" },
      ast: { withPositions: true },
    });

    const phpFiles = collectFiles(pluginRoot, ".php");

    expect(phpFiles.length).toBeGreaterThanOrEqual(7);

    for (const file of phpFiles) {
      const source = readFileSync(file, "utf8");

      expect(() => engine.parseCode(source, file), `${file} failed to parse`).not.toThrow();
    }
  }, 30000);
});

describe("StormSale referral tracking core", () => {
  const core = loadReferralCore();

  it("validates affiliate identifiers", () => {
    expect(core.isValidAffiliateId("affiliate-42")).toBe(true);
    expect(
      core.isValidAffiliateId("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    ).toBe(true);
    expect(core.isValidAffiliateId("ab")).toBe(false);
    expect(core.isValidAffiliateId("has space")).toBe(false);
    expect(core.isValidAffiliateId("a".repeat(121))).toBe(false);
    expect(core.isValidAffiliateId(null)).toBe(false);
  });

  it("sanitizes click identifiers", () => {
    expect(core.sanitizeClickId("click_1")).toBe("click_1");
    expect(core.sanitizeClickId("bad click")).toBe("");
    expect(core.sanitizeClickId(undefined)).toBe("");
  });

  it("parses query strings with duplicate and encoded keys", () => {
    expect(core.parseQueryString("?ss_ref=affiliate-42&ss_click=click_1")).toEqual({
      ss_ref: "affiliate-42",
      ss_click: "click_1",
    });
    expect(core.parseQueryString("ss_ref=first&ss_ref=second")).toEqual({ ss_ref: "first" });
    expect(core.parseQueryString("ss_ref=affiliate%2042")).toEqual({ ss_ref: "affiliate 42" });
    expect(core.parseQueryString("")).toEqual({});
    expect(core.parseQueryString(null)).toEqual({});
  });

  it("extracts referrals from the query string", () => {
    const referral = core.extractReferral({
      search: "?ss_ref=affiliate-42&ss_click=click_1",
      hash: "",
    });

    expect(referral).toEqual({ affiliateId: "affiliate-42", clickId: "click_1", source: "query" });
  });

  it("falls back to hash fragment referrals", () => {
    const referral = core.extractReferral({
      search: "",
      hash: "#ss_ref=affiliate-42&ss_click=click_9",
    });

    expect(referral).toEqual({ affiliateId: "affiliate-42", clickId: "click_9", source: "hash" });
  });

  it("honours custom parameter names", () => {
    const referral = core.extractReferral(
      { search: "?ref=affiliate-42", hash: "" },
      { affiliateParam: "ref", clickParam: "cid" },
    );

    expect(referral).toEqual({ affiliateId: "affiliate-42", clickId: "", source: "query" });
  });

  it("ignores malformed or absent referrals", () => {
    expect(core.extractReferral({ search: "?ss_ref=", hash: "" })).toBeNull();
    expect(core.extractReferral({ search: "?other=1", hash: "" })).toBeNull();
    expect(core.extractReferral({}, {})).toBeNull();
  });

  it("builds the click beacon request body", () => {
    const body = core.buildClickRequest(
      { affiliateId: "affiliate-42", clickId: "click_1" },
      {
        url: "https://example.test/shop",
        referrer: "https://partner.test",
        campaignId: "campaign_7",
      },
    );

    expect(body).toEqual({
      affiliate_id: "affiliate-42",
      click_id: "click_1",
      landing_url: "https://example.test/shop",
      referrer: "https://partner.test",
      campaign_id: "campaign_7",
    });
  });
});
