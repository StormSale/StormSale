import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { CohortVisualizer } from "../components/advertiser/CohortVisualizer";
import {
  calculateCohortRetention,
  calculatePartnerMetrics,
  exportCohortDataToCSV,
  downloadCSV,
  type CustomerConversion,
} from "../lib/cohortAnalysis";

describe("CohortVisualizer Component Suite (#143)", () => {
  const baseDate = new Date("2026-01-01T12:00:00Z");
  const dayMs = 24 * 60 * 60 * 1000;

  const mockConversions: CustomerConversion[] = [
    {
      id: "tx-1",
      customerRef: "CUST_1",
      affiliateAddress: "GAFFILIATE_1",
      affiliateName: "Alice Partner",
      campaignId: "CAMP_TECH",
      campaignName: "Tech Campaign",
      amount: 100,
      timestamp: baseDate.toISOString(),
    },
    {
      id: "tx-2",
      customerRef: "CUST_1",
      affiliateAddress: "GAFFILIATE_1",
      affiliateName: "Alice Partner",
      campaignId: "CAMP_TECH",
      campaignName: "Tech Campaign",
      amount: 50,
      timestamp: new Date(baseDate.getTime() + 20 * dayMs).toISOString(),
    },
    {
      id: "tx-3",
      customerRef: "CUST_2",
      affiliateAddress: "GAFFILIATE_2",
      affiliateName: "Bob Partner",
      campaignId: "CAMP_CRYPTO",
      campaignName: "Crypto Campaign",
      amount: 200,
      timestamp: new Date("2026-02-01T10:00:00Z").toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders controlled conversions with correct accessible filter labels and table caption", () => {
    const html = renderToString(<CohortVisualizer conversions={mockConversions} />);

    // Title and description
    expect(html).toContain("Cohort Retention &amp; Customer LTV Visualizer");
    expect(html).toContain("Track repeat purchase rates and cumulative Lifetime Value (LTV)");

    // Accessible labels tied via for (from JSX htmlFor) and id
    expect(html).toContain('for="cohort-campaign-filter"');
    expect(html).toContain('id="cohort-campaign-filter"');
    expect(html).toContain('for="cohort-affiliate-filter"');
    expect(html).toContain('id="cohort-affiliate-filter"');

    // Table caption for screen readers
    expect(html).toContain(
      '<caption class="sr-only">Cohort retention and cumulative LTV by interval</caption>',
    );

    // Filter select options populated from conversions
    expect(html).toContain("All Campaigns");
    expect(html).toContain("Tech Campaign");
    expect(html).toContain("Crypto Campaign");
    expect(html).toContain("All Affiliates");
    expect(html).toContain("Alice Partner");
    expect(html).toContain("Bob Partner");

    // Heatmap columns
    expect(html).toContain("Day 0");
    expect(html).toContain("Day 30");
    expect(html).toContain("Day 60");
    expect(html).toContain("Day 90");
    expect(html).toContain("Total Revenue");
    expect(html).toContain("Average LTV");

    // Partner metrics cards
    expect(html).toContain("Affiliate Partner Basket Size &amp; Repeat Transaction Breakdown");
    expect(html).toContain("GAFFILIATE_1");
    expect(html).toContain("GAFFILIATE_2");
  });

  it("renders empty state cleanly when conversions array is empty", () => {
    const html = renderToString(<CohortVisualizer conversions={[]} />);

    expect(html).toContain("No Conversion Data Available");
    expect(html).toContain(
      "No conversions have been logged yet. Once sales and customer attributions are recorded",
    );
  });

  it("renders loading state when initialConversions is not provided and data is loading", () => {
    // When no prop is given, component initializes with isLoading = true
    const html = renderToString(<CohortVisualizer />);

    expect(html).toContain("Loading cohort conversion data...");
    expect(html).toContain("animate-spin");
  });

  it("exercises filters, metric toggles, and timeframe calculations", () => {
    // Verify calculation with campaign filter
    const techOnly = calculateCohortRetention(mockConversions, {
      campaignId: "CAMP_TECH",
      timeframe: "monthly",
    });
    expect(techOnly.length).toBe(1);
    expect(techOnly[0].cohortLabel).toBe("Jan 2026");
    expect(techOnly[0].initialUsers).toBe(1);

    // Verify calculation with affiliate filter
    const bobOnly = calculateCohortRetention(mockConversions, {
      affiliateAddress: "GAFFILIATE_2",
      timeframe: "monthly",
    });
    expect(bobOnly.length).toBe(1);
    expect(bobOnly[0].cohortLabel).toBe("Feb 2026");

    // Verify calculation with weekly timeframe
    const weeklyCohorts = calculateCohortRetention(mockConversions, {
      timeframe: "weekly",
    });
    expect(weeklyCohorts.length).toBe(2);
    expect(weeklyCohorts[0].cohortLabel).toContain("Week");

    // Verify partner metrics with affiliate filter
    const bobPartnerMetrics = calculatePartnerMetrics(mockConversions, {
      affiliateAddress: "GAFFILIATE_2",
    });
    expect(bobPartnerMetrics.length).toBe(1);
    expect(bobPartnerMetrics[0].affiliateName).toBe("Bob Partner");
    expect(bobPartnerMetrics[0].totalRevenue).toBe(200);
  });

  it("triggers file download through downloadCSV when CSV export is invoked", () => {
    const cohorts = calculateCohortRetention(mockConversions);
    const partners = calculatePartnerMetrics(mockConversions);
    const csvContent = exportCohortDataToCSV(cohorts, partners);

    let clicked = false;
    let appendedChild: unknown = null;
    let removedChild: unknown = null;
    const setAttributes: Record<string, string> = {};

    const mockLink = {
      setAttribute: (name: string, val: string) => {
        setAttributes[name] = val;
      },
      click: () => {
        clicked = true;
      },
    };

    const mockDoc = {
      createElement: (tag: string) => {
        if (tag === "a") return mockLink;
        return {};
      },
      body: {
        appendChild: (el: unknown) => {
          appendedChild = el;
        },
        removeChild: (el: unknown) => {
          removedChild = el;
        },
      },
    };

    vi.stubGlobal("window", {});
    vi.stubGlobal("document", mockDoc);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:http://localhost/test-uuid"),
      revokeObjectURL: vi.fn(),
    });

    downloadCSV(csvContent, "test-cohorts.csv");

    expect(clicked).toBe(true);
    expect(appendedChild).toBe(mockLink);
    expect(removedChild).toBe(mockLink);
    expect(setAttributes["download"]).toBe("test-cohorts.csv");
    expect(setAttributes["href"]).toBe("blob:http://localhost/test-uuid");
  });
});
