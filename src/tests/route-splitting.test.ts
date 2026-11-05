import { describe, it, expect } from "vitest";
import {
  Landing,
  Dashboard,
  Advertiser,
  Affiliate,
  Auditor,
  BrandedCampaignView,
  PageLoader,
} from "../App";

describe("Route Splitting & Chunk Optimization (#99)", () => {
  it("should export lazy-loaded components as valid React lazy components", () => {
    expect(Landing).toBeDefined();
    expect(Dashboard).toBeDefined();
    expect(Advertiser).toBeDefined();
    expect(Affiliate).toBeDefined();
    expect(Auditor).toBeDefined();
    expect(BrandedCampaignView).toBeDefined();

    // In React, lazy components are objects tagged with $$typeof Symbol(react.lazy) and carry _payload / _init
    for (const component of [Landing, Dashboard, Advertiser, Affiliate, Auditor, BrandedCampaignView]) {
      expect(typeof component).toBe("object");
      expect((component as any).$$typeof).toBe(Symbol.for("react.lazy"));
    }
  });

  it("should be able to resolve lazy-loaded page modules dynamically", async () => {
    const landingModule = await import("../pages/Landing");
    expect(landingModule.Landing).toBeDefined();

    const dashboardModule = await import("../pages/Dashboard");
    expect(dashboardModule.Dashboard).toBeDefined();

    const advertiserModule = await import("../pages/Advertiser");
    expect(advertiserModule.Advertiser).toBeDefined();

    const affiliateModule = await import("../pages/Affiliate");
    expect(affiliateModule.Affiliate).toBeDefined();

    const auditorModule = await import("../pages/Auditor");
    expect(auditorModule.Auditor).toBeDefined();
  }, 30000);

  it("should export PageLoader component for suspense fallback", () => {
    expect(typeof PageLoader).toBe("function");
    const element = PageLoader();
    expect(element).toBeDefined();
    expect((element as any).props["aria-label"]).toBe("Loading page");
  });
});
