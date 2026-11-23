import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BRAND_CONFIG,
  DEFAULT_CNAME_TARGET,
  MAX_ORGANIZATION_LOGO_BYTES,
  buildCnameRecord,
  checkCnamePropagation,
  isValidCustomDomain,
  loadBrandConfig,
  saveBrandConfig,
  validateOrganizationLogo,
} from "../lib/branding";
import { CustomDomainSettings } from "../components/advertiser/CustomDomainSettings";

const WALLET = "GADVERTISER442TESTWALLETADDRESS";

const logoFile = (type: string, size: number, name?: string): File =>
  ({ type, size, name }) as File;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty("--brand-primary");
  document.documentElement.style.removeProperty("--brand-secondary");
});

afterEach(cleanup);

describe("b2b whitelabel theme injection (#442)", () => {
  it("applies the saved custom primary color as a CSS variable override", () => {
    const config = {
      ...DEFAULT_BRAND_CONFIG,
      subdomain: "acme-portal",
      primaryColor: "#0F766E",
      secondaryColor: "#F59E0B",
      customDomain: "portal.acme.com",
    };

    saveBrandConfig(WALLET, config);

    expect(loadBrandConfig(WALLET)).toMatchObject({
      primaryColor: "#0F766E",
      secondaryColor: "#F59E0B",
      customDomain: "portal.acme.com",
    });
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("#0F766E");
    expect(document.documentElement.style.getPropertyValue("--brand-secondary")).toBe("#F59E0B");
  });

  it("keeps the default theme when a malformed color is saved", () => {
    saveBrandConfig(WALLET, {
      ...DEFAULT_BRAND_CONFIG,
      primaryColor: "url(javascript:alert(1))",
      secondaryColor: "not-a-color",
    });

    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe(
      DEFAULT_BRAND_CONFIG.primaryColor,
    );
    expect(document.documentElement.style.getPropertyValue("--brand-secondary")).toBe(
      DEFAULT_BRAND_CONFIG.secondaryColor,
    );
  });
});

describe("b2b organization logo validation (#442)", () => {
  it("accepts PNG and SVG logos up to 2MB", () => {
    expect(
      validateOrganizationLogo(logoFile("image/png", MAX_ORGANIZATION_LOGO_BYTES, "a.png")),
    ).toEqual({ valid: true });
    expect(validateOrganizationLogo(logoFile("image/svg+xml", 1024, "a.svg"))).toEqual({
      valid: true,
    });
    expect(validateOrganizationLogo(logoFile("", 1024, "a.png"))).toEqual({ valid: true });
  });

  it("rejects logos larger than 2MB", () => {
    const result = validateOrganizationLogo(
      logoFile("image/png", MAX_ORGANIZATION_LOGO_BYTES + 1, "a.png"),
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("2MB");
  });

  it("rejects unsupported image formats and empty files", () => {
    expect(validateOrganizationLogo(logoFile("image/jpeg", 1024, "a.jpg")).valid).toBe(false);
    expect(validateOrganizationLogo(logoFile("image/gif", 1024, "a.gif")).valid).toBe(false);
    expect(validateOrganizationLogo(logoFile("image/png", 0, "a.png")).valid).toBe(false);
  });
});

describe("b2b custom domain CNAME verification (#442)", () => {
  it("builds the expected CNAME record guidance", () => {
    expect(buildCnameRecord("https://PORTAL.acme.com/path")).toEqual({
      type: "CNAME",
      host: "portal.acme.com",
      value: DEFAULT_CNAME_TARGET,
    });
    expect(isValidCustomDomain("portal.acme.com")).toBe(true);
    expect(isValidCustomDomain("not a domain")).toBe(false);
  });

  it("reports propagated when the CNAME target matches", async () => {
    const result = await checkCnamePropagation("portal.acme.com", async () => [
      `${DEFAULT_CNAME_TARGET}.`,
    ]);

    expect(result.status).toBe("propagated");
    expect(result.domain).toBe("portal.acme.com");
    expect(result.expectedTarget).toBe(DEFAULT_CNAME_TARGET);
    expect(result.actualTargets).toEqual([DEFAULT_CNAME_TARGET]);
  });

  it("reports pending when no CNAME record exists", async () => {
    const lookup = vi.fn().mockResolvedValue([]);
    const result = await checkCnamePropagation("portal.acme.com", lookup);

    expect(lookup).toHaveBeenCalledWith("portal.acme.com");
    expect(result.status).toBe("pending");
    expect(result.actualTargets).toEqual([]);
    expect(result.message).toContain("48 hours");
  });

  it("reports mismatch when the record points elsewhere", async () => {
    const result = await checkCnamePropagation("portal.acme.com", async () => ["other.example.com"]);

    expect(result.status).toBe("mismatch");
    expect(result.message).toContain("other.example.com");
  });

  it("rejects invalid domains and failed lookups safely", async () => {
    const invalid = await checkCnamePropagation("not a domain", async () => null);
    expect(invalid.status).toBe("invalid_domain");

    const failed = await checkCnamePropagation("portal.acme.com", async () => {
      throw new Error("DNS unavailable");
    });
    expect(failed.status).toBe("lookup_failed");
  });

  it("renders the CNAME interface and displays propagation results", async () => {
    render(
      createElement(CustomDomainSettings, {
        domain: "portal.acme.com",
        onDomainChange: vi.fn(),
        checkPropagation: (domain: string) =>
          checkCnamePropagation(domain, async () => [DEFAULT_CNAME_TARGET]),
      }),
    );

    expect(screen.getByTestId("cname-record").textContent).toContain(
      `CNAME portal.acme.com → ${DEFAULT_CNAME_TARGET}`,
    );

    fireEvent.click(screen.getByTestId("check-cname"));

    const status = await screen.findByTestId("cname-status");
    expect(status.textContent).toContain("CNAME is propagated");
  });

  it("disables CNAME checking until a valid domain is entered", () => {
    render(
      createElement(CustomDomainSettings, {
        domain: "invalid domain",
        onDomainChange: vi.fn(),
      }),
    );

    expect((screen.getByTestId("check-cname") as HTMLButtonElement).disabled).toBe(true);
  });
});
