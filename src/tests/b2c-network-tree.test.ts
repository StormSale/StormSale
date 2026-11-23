// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement("div", props, children),
    button: ({ children, ...props }: any) => React.createElement("button", props, children),
    span: ({ children, ...props }: any) => React.createElement("span", props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

import {
  maskRefereeAddress,
  formatAffiliateAddress,
  buildReferralTree,
  buildRecursiveReferralTree,
  aggregateNetworkVolume,
  filterRefereeNetwork,
  paginateReferees,
  generateLargeNetworkMock,
  getReferralTreeSummary,
  getRecruiterForAffiliate,
  getSubAffiliatesForParent,
  type AffiliateReferralRelation,
  type ReferralTreeNode,
} from "../lib/referralTree";
import { B2CNetworkTree } from "../components/affiliate/B2CNetworkTree";

describe("B2C Two-Tier Referral Network Tree Component & Engine (#451)", () => {
  const MASTER_WALLET = "GABESTORMSALE7MASTERRECRUITER0000000000000000000000000000392";
  const T1_ALICE_WALLET = "GABESTORMSALE7ALICE000000000000000000000000000000000000392";
  const T1_BOB_WALLET = "GABESTORMSALE7BOB00000000000000000000000000000000000000392";
  const T2_CHARLIE_WALLET = "GABESTORMSALE7CHARLIE0000000000000000000000000000000000392";
  const T2_DAVE_WALLET = "GABESTORMSALE7DAVE0000000000000000000000000000000000000392";
  const T3_EVE_WALLET = "GABESTORMSALE7EVE00000000000000000000000000000000000000392";

  let sampleRelations: AffiliateReferralRelation[];

  beforeEach(() => {
    vi.restoreAllMocks();
    sampleRelations = [
      {
        childAddress: T1_ALICE_WALLET,
        childName: "Alice Media Group",
        parentAddress: MASTER_WALLET,
        parentName: "Master Affiliate",
        recruitedAt: "2026-10-15T09:00:00.000Z",
        tier: 1,
        overrideRatePercent: 2.0,
        directCommissionRatePercent: 8.0,
        status: "active",
        totalSalesVolumeXlm: 10000,
        totalDirectCommissionEarnedXlm: 800,
        totalOverrideEarnedXlm: 200,
        salesCount: 20,
      },
      {
        childAddress: T1_BOB_WALLET,
        childName: "Bob Stellar Ads",
        parentAddress: MASTER_WALLET,
        parentName: "Master Affiliate",
        recruitedAt: "2026-10-20T14:30:00.000Z",
        tier: 1,
        overrideRatePercent: 2.0,
        directCommissionRatePercent: 8.0,
        status: "active",
        totalSalesVolumeXlm: 5000,
        totalDirectCommissionEarnedXlm: 400,
        totalOverrideEarnedXlm: 100,
        salesCount: 10,
      },
      {
        childAddress: T2_CHARLIE_WALLET,
        childName: "Charlie Micro-Seller",
        parentAddress: T1_ALICE_WALLET,
        parentName: "Alice Media Group",
        recruitedAt: "2026-10-25T11:15:00.000Z",
        tier: 2,
        overrideRatePercent: 2.0,
        directCommissionRatePercent: 8.0,
        status: "active",
        totalSalesVolumeXlm: 2000,
        totalDirectCommissionEarnedXlm: 160,
        totalOverrideEarnedXlm: 40,
        salesCount: 5,
      },
      {
        childAddress: T2_DAVE_WALLET,
        childName: "Dave Content Hub",
        parentAddress: T1_BOB_WALLET,
        parentName: "Bob Stellar Ads",
        recruitedAt: "2026-11-01T16:45:00.000Z",
        tier: 2,
        overrideRatePercent: 2.0,
        directCommissionRatePercent: 8.0,
        status: "paused",
        totalSalesVolumeXlm: 1500,
        totalDirectCommissionEarnedXlm: 120,
        totalOverrideEarnedXlm: 30,
        salesCount: 3,
      },
      {
        childAddress: T3_EVE_WALLET,
        childName: "Eve Downstream Affiliate",
        parentAddress: T2_CHARLIE_WALLET,
        parentName: "Charlie Micro-Seller",
        recruitedAt: "2026-11-10T12:00:00.000Z",
        tier: 2,
        overrideRatePercent: 2.0,
        directCommissionRatePercent: 8.0,
        status: "active",
        totalSalesVolumeXlm: 800,
        totalDirectCommissionEarnedXlm: 64,
        totalOverrideEarnedXlm: 16,
        salesCount: 2,
      },
    ];
  });

  afterEach(() => {
    cleanup();
  });

  describe("1. Recursive Rendering of Sub-Affiliate Tree Structure", () => {
    it("constructs a recursive tree hierarchy linking Tier 1, Tier 2, and downstream nodes", () => {
      const tree: ReferralTreeNode = buildRecursiveReferralTree(MASTER_WALLET, sampleRelations);
      const classicTree = buildReferralTree(MASTER_WALLET, sampleRelations);
      expect(classicTree.children.length).toBe(tree.children.length);

      expect(tree.address).toBe(MASTER_WALLET);
      expect(tree.tier).toBe(0);
      expect(tree.roleLabel).toBe("Master Affiliate");
      expect(tree.children.length).toBe(2); // Alice and Bob

      // Inspect Alice (Tier 1) and her child Charlie (Tier 2)
      const aliceNode = tree.children.find((c) => c.address === T1_ALICE_WALLET);
      expect(aliceNode).toBeDefined();
      expect(aliceNode?.name).toBe("Alice Media Group");
      expect(aliceNode?.tier).toBe(1);
      expect(aliceNode?.children.length).toBe(1);

      const charlieNode = aliceNode?.children[0];
      expect(charlieNode).toBeDefined();
      expect(charlieNode?.address).toBe(T2_CHARLIE_WALLET);
      expect(charlieNode?.tier).toBe(2);
      expect(charlieNode?.roleLabel).toBe("Sub-Affiliate (Tier 2)");

      // Charlie's child Eve (Tier 3)
      expect(charlieNode?.children.length).toBe(1);
      const eveNode = charlieNode?.children[0];
      expect(eveNode?.address).toBe(T3_EVE_WALLET);
      expect(eveNode?.tier).toBe(3);
    });

    it("recursively rolls up sales volumes and override commissions across parent nodes", () => {
      const tree = buildRecursiveReferralTree(MASTER_WALLET, sampleRelations);

      // Alice's subtree includes Charlie and Eve overrides
      const aliceNode = tree.children.find((c) => c.address === T1_ALICE_WALLET)!;
      expect(aliceNode.salesVolumeXlm).toBe(10000);
      // Alice direct override (200) + Charlie's override (40) + Eve's override (16) = 256
      expect(aliceNode.overrideEarningsXlm).toBe(256);

      // Root master node aggregates entire downstream network
      expect(tree.salesVolumeXlm).toBeGreaterThanOrEqual(18500);
      expect(tree.overrideEarningsXlm).toBe(386);
    });

    it("prevents circular recursion or stack overflow on cyclical relation bindings", () => {
      const circularRelations: AffiliateReferralRelation[] = [
        ...sampleRelations,
        {
          childAddress: MASTER_WALLET, // Circular reference back to root
          childName: "Master Affiliate Cycle",
          parentAddress: T3_EVE_WALLET,
          recruitedAt: "2026-11-15T00:00:00.000Z",
          tier: 2,
          overrideRatePercent: 2.0,
          directCommissionRatePercent: 8.0,
          status: "active",
          totalSalesVolumeXlm: 100,
          totalDirectCommissionEarnedXlm: 8,
          totalOverrideEarnedXlm: 2,
          salesCount: 1,
        },
      ];

      expect(() => buildRecursiveReferralTree(MASTER_WALLET, circularRelations)).not.toThrow();
      const tree = buildRecursiveReferralTree(MASTER_WALLET, circularRelations);
      expect(tree.address).toBe(MASTER_WALLET);
    });

    it("renders recursive sub-affiliate tree structure into HTML markup with responsive controls", () => {
      const html = renderToString(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
        }),
      );

      // Core container
      expect(html).toContain('data-testid="b2c-network-tree-container"');

      // Recursive tree nodes
      expect(html).toContain(`data-testid="tree-node-${MASTER_WALLET}"`);
      expect(html).toContain(`data-testid="tree-node-${T1_ALICE_WALLET}"`);
      expect(html).toContain(`data-testid="tree-node-${T1_BOB_WALLET}"`);
      expect(html).toContain(`data-testid="tree-node-${T2_CHARLIE_WALLET}"`);

      // Responsive collapse/expand toggles
      expect(html).toContain(`data-testid="collapse-toggle-${MASTER_WALLET}"`);
      expect(html).toContain(`data-testid="collapse-toggle-${T1_ALICE_WALLET}"`);
      expect(html).toContain('data-testid="btn-expand-all"');
      expect(html).toContain('data-testid="btn-collapse-all"');

      // Labels and Tiers
      expect(html).toContain("Alice Media Group");
      expect(html).toContain("Bob Stellar Ads");
      expect(html).toContain("Tier 1");
      expect(html).toContain("Tier 2");
    });
  });

  describe("2. Privacy Masking of Referee Wallet Addresses (GAB...392)", () => {
    it("masks Stellar referee wallet addresses to GAB...392 format", () => {
      const rawAddress = "GABESTORMSALE7SUBAFFILIATE10000000000000000000000000000000392";
      const masked = maskRefereeAddress(rawAddress);

      expect(masked).toBe("GAB...392");
      expect(masked.startsWith("GAB")).toBe(true);
      expect(masked.endsWith("392")).toBe(true);
      expect(masked).toContain("...");
      expect(masked.length).toBe(9); // 3 + 3 + 3
    });

    it("correctly masks various referee addresses conforming to GAB...392 requirement", () => {
      const testCases = [
        { input: "GAB1234567890ABCDEF392", expected: "GAB...392" },
        { input: "GABXXXYYYZZZ111222392", expected: "GAB...392" },
        { input: "GAB999888777666555444333222111000392", expected: "GAB...392" },
        { input: MASTER_WALLET, expected: "GAB...392" },
        { input: T1_ALICE_WALLET, expected: "GAB...392" },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(maskRefereeAddress(input)).toBe(expected);
      });
    });

    it("gracefully handles short, empty, and edge-case wallet addresses", () => {
      expect(maskRefereeAddress("")).toBe("Unknown");
      expect(maskRefereeAddress(null as any)).toBe("Unknown");
      expect(maskRefereeAddress(undefined as any)).toBe("Unknown");
      expect(maskRefereeAddress("GAB392")).toBe("GAB392"); // 6 chars, <= 6 returns trimmed
      expect(maskRefereeAddress("SHORT")).toBe("SHORT");
    });

    it("renders masked referee wallet addresses (GAB...392) in UI when privacy mask is active", () => {
      const html = renderToString(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
          defaultPrivacyMasked: true,
        }),
      );

      // Verify privacy masking indicator and masked addresses
      expect(html).toContain('data-testid="privacy-mask-toggle"');
      expect(html).toContain("Privacy Mask Active (GAB...392)");
      expect(html).toContain("GAB...392");

      // Verify full unmasked sensitive keys are not exposed in referee-address span
      expect(html).not.toContain(`>${T1_ALICE_WALLET}<`);
      expect(html).not.toContain(`>${T2_CHARLIE_WALLET}<`);
    });

    it("displays compact format when privacy masking is toggled off", () => {
      const html = renderToString(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
          defaultPrivacyMasked: false,
        }),
      );

      expect(html).toContain("Mask Wallet Addresses");
      expect(html).toContain(formatAffiliateAddress(T1_ALICE_WALLET));
    });
  });

  describe("3. Search Filter Finding Specific Referees by Date or Alias", () => {
    it("filters referees accurately by full or partial alias (case-insensitive)", () => {
      const aliceMatches = filterRefereeNetwork(sampleRelations, { alias: "alice" });
      expect(aliceMatches.length).toBe(1);
      expect(aliceMatches[0].childName).toBe("Alice Media Group");

      const groupMatches = filterRefereeNetwork(sampleRelations, { alias: "Group" });
      expect(groupMatches.length).toBe(1);
      expect(groupMatches[0].childAddress).toBe(T1_ALICE_WALLET);

      const sellerMatches = filterRefereeNetwork(sampleRelations, { alias: "seller" });
      expect(sellerMatches.length).toBe(1);
      expect(sellerMatches[0].childName).toBe("Charlie Micro-Seller");

      const noMatches = filterRefereeNetwork(sampleRelations, { alias: "NonExistentPartner" });
      expect(noMatches.length).toBe(0);
    });

    it("filters referees by exact recruitment date string (YYYY-MM-DD)", () => {
      // Alice was recruited on 2026-10-15
      const date15Matches = filterRefereeNetwork(sampleRelations, { date: "2026-10-15" });
      expect(date15Matches.length).toBe(1);
      expect(date15Matches[0].childName).toBe("Alice Media Group");

      // Bob was recruited on 2026-10-20
      const date20Matches = filterRefereeNetwork(sampleRelations, { date: "2026-10-20" });
      expect(date20Matches.length).toBe(1);
      expect(date20Matches[0].childName).toBe("Bob Stellar Ads");

      // Charlie was recruited on 2026-10-25
      const date25Matches = filterRefereeNetwork(sampleRelations, { date: "2026-10-25" });
      expect(date25Matches.length).toBe(1);
      expect(date25Matches[0].childName).toBe("Charlie Micro-Seller");

      // Dave was recruited on 2026-11-01
      const dateNovMatches = filterRefereeNetwork(sampleRelations, { date: "2026-11-01" });
      expect(dateNovMatches.length).toBe(1);
      expect(dateNovMatches[0].childName).toBe("Dave Content Hub");

      // Unmatched date
      const emptyMatches = filterRefereeNetwork(sampleRelations, { date: "2025-01-01" });
      expect(emptyMatches.length).toBe(0);
    });

    it("filters referees within a specific date range", () => {
      const octoberOnly = filterRefereeNetwork(sampleRelations, {
        startDate: "2026-10-01",
        endDate: "2026-10-31T23:59:59.999Z",
      });

      expect(octoberOnly.length).toBe(3); // Alice (Oct 15), Bob (Oct 20), Charlie (Oct 25)
      expect(octoberOnly.map((r) => r.childName)).toEqual([
        "Alice Media Group",
        "Bob Stellar Ads",
        "Charlie Micro-Seller",
      ]);
    });

    it("filters referees by tier level (Tier 1 vs Tier 2)", () => {
      const tier1Referees = filterRefereeNetwork(sampleRelations, { tier: 1 });
      expect(tier1Referees.length).toBe(2);
      expect(tier1Referees.every((r) => r.tier === 1)).toBe(true);

      const tier2Referees = filterRefereeNetwork(sampleRelations, { tier: 2 });
      expect(tier2Referees.length).toBe(3);
      expect(tier2Referees.every((r) => r.tier === 2)).toBe(true);
    });

    it("matches universal query string across alias, date, and wallet address", () => {
      // Query by date
      const queryDate = filterRefereeNetwork(sampleRelations, "2026-10-15");
      expect(queryDate.length).toBe(1);
      expect(queryDate[0].childName).toBe("Alice Media Group");

      // Query by name
      const queryName = filterRefereeNetwork(sampleRelations, "Charlie");
      expect(queryName.length).toBe(1);
      expect(queryName[0].childAddress).toBe(T2_CHARLIE_WALLET);

      // Query by wallet
      const queryWallet = filterRefereeNetwork(sampleRelations, T1_BOB_WALLET);
      expect(queryWallet.length).toBe(1);
      expect(queryWallet[0].childName).toBe("Bob Stellar Ads");
    });

    it("renders search and date filter controls in the UI component", () => {
      const html = renderToString(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
        }),
      );

      expect(html).toContain('data-testid="referee-search-input"');
      expect(html).toContain('data-testid="referee-date-filter"');
      expect(html).toContain('data-testid="referee-tier-filter"');
    });
  });

  describe("4. Performance When Rendering Sub-Networks With >500 Nodes", () => {
    let largeNetwork: AffiliateReferralRelation[];

    beforeEach(() => {
      // Generate synthetic sub-network with 600 nodes (>500 nodes)
      largeNetwork = generateLargeNetworkMock(MASTER_WALLET, 600);
    });

    it("verifies synthetic dataset contains >500 nodes with valid GAB...392 addresses", () => {
      expect(largeNetwork.length).toBe(600);
      expect(largeNetwork.length).toBeGreaterThan(500);

      // Verify all referee addresses conform to GAB...392 mask
      const firstNode = largeNetwork[0];
      const lastNode = largeNetwork[599];

      expect(maskRefereeAddress(firstNode.childAddress)).toBe("GAB...392");
      expect(maskRefereeAddress(lastNode.childAddress)).toBe("GAB...392");

      const tier1Count = largeNetwork.filter((r) => r.tier === 1).length;
      const tier2Count = largeNetwork.filter((r) => r.tier === 2).length;

      expect(tier1Count).toBe(50);
      expect(tier2Count).toBe(550);
    });

    it("constructs recursive tree for >500 nodes in under 100ms", () => {
      const startTime = performance.now();
      const tree = buildRecursiveReferralTree(MASTER_WALLET, largeNetwork);
      const elapsed = performance.now() - startTime;

      expect(tree.address).toBe(MASTER_WALLET);
      expect(tree.children.length).toBe(50); // 50 Tier 1 parents
      expect(elapsed).toBeLessThan(100); // Strict performance budget < 100ms

      // Verify leaf children were linked
      const totalLeaves = tree.children.reduce((acc, c) => acc + c.children.length, 0);
      expect(totalLeaves).toBe(550);
    });

    it("aggregates volume metrics for >500 nodes accurately and in under 50ms", () => {
      const startTime = performance.now();
      const agg = aggregateNetworkVolume(largeNetwork);
      const elapsed = performance.now() - startTime;

      expect(agg.totalCount).toBe(600);
      expect(agg.tier1Count).toBe(50);
      expect(agg.tier2Count).toBe(550);
      expect(agg.tier1Volume).toBeGreaterThan(0);
      expect(agg.tier2Volume).toBeGreaterThan(0);
      expect(agg.totalVolume).toBe(Number((agg.tier1Volume + agg.tier2Volume).toFixed(2)));
      expect(agg.totalOverrides).toBeGreaterThan(0);

      expect(elapsed).toBeLessThan(50); // Performance budget < 50ms
    });

    it("filters specific referees across >500 nodes in under 50ms", () => {
      const targetDate = largeNetwork[250].recruitedAt.slice(0, 10);
      const targetAlias = largeNetwork[350].childName;

      const startTime = performance.now();
      const aliasMatches = filterRefereeNetwork(largeNetwork, { alias: targetAlias });
      const dateMatches = filterRefereeNetwork(largeNetwork, { date: targetDate });
      const elapsed = performance.now() - startTime;

      expect(aliasMatches.length).toBeGreaterThanOrEqual(1);
      expect(dateMatches.length).toBeGreaterThanOrEqual(1);
      expect(elapsed).toBeLessThan(50); // Performance budget < 50ms
    });

    it("paginates >500 nodes cleanly into responsive pages", () => {
      const pageSize = 10;
      const page1 = paginateReferees(largeNetwork, 1, pageSize);

      expect(page1.totalItems).toBe(600);
      expect(page1.totalPages).toBe(60);
      expect(page1.currentPage).toBe(1);
      expect(page1.items.length).toBe(10);
      expect(page1.hasNextPage).toBe(true);
      expect(page1.hasPrevPage).toBe(false);

      // Navigate to last page
      const lastPage = paginateReferees(largeNetwork, 60, pageSize);
      expect(lastPage.currentPage).toBe(60);
      expect(lastPage.items.length).toBe(10);
      expect(lastPage.hasNextPage).toBe(false);
      expect(lastPage.hasPrevPage).toBe(true);

      // Boundary clamp test: page 999 clamps to last page
      const clamped = paginateReferees(largeNetwork, 999, pageSize);
      expect(clamped.currentPage).toBe(60);
    });

    it("renders the B2CNetworkTree component with >500 nodes without performance degradation", () => {
      const startTime = performance.now();
      const html = renderToString(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: largeNetwork,
          initialPageSize: 10,
        }),
      );
      const elapsed = performance.now() - startTime;

      expect(html).toContain('data-testid="b2c-network-tree-container"');
      expect(html).toContain('data-testid="tier1-volume"');
      expect(html).toContain('data-testid="tier2-volume"');
      expect(html).toContain('data-testid="total-downstream-volume"');

      // Total network marketers card
      expect(html).toContain("600");
      expect(html).toContain("GAB...392");

      // Verify rendering completes within reasonable SSR budget (< 2500ms)
      expect(elapsed).toBeLessThan(2500);
    });
  });

  describe("5. Volume Aggregation & UI Summary Consistency", () => {
    it("computes exact Tier 1, Tier 2, and Total Downstream volume breakdowns", () => {
      const agg = aggregateNetworkVolume(sampleRelations);

      // Expected Tier 1: Alice (10,000) + Bob (5,000) = 15,000 XLM
      expect(agg.tier1Volume).toBe(15000);
      expect(agg.tier1Count).toBe(2);
      expect(agg.tier1Overrides).toBe(300); // 200 + 100

      // Expected Tier 2: Charlie (2,000) + Dave (1,500) + Eve (800) = 4,300 XLM
      expect(agg.tier2Volume).toBe(4300);
      expect(agg.tier2Count).toBe(3);
      expect(agg.tier2Overrides).toBe(86); // 40 + 30 + 16

      // Total Downstream Volume: 15,000 + 4,300 = 19,300 XLM
      expect(agg.totalVolume).toBe(19300);
      expect(agg.totalCount).toBe(5);
      expect(agg.totalOverrides).toBe(386);
    });

    it("renders volume aggregation cards with correct values in B2CNetworkTree UI", () => {
      const html = renderToString(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
        }),
      );

      // Volume aggregation cards
      expect(html).toContain('data-testid="tier1-volume"');
      expect(html).toContain("15,000"); // Tier 1 Volume
      expect(html).toContain('data-testid="tier2-volume"');
      expect(html).toContain("4,300"); // Tier 2 Volume
      expect(html).toContain('data-testid="total-downstream-volume"');
      expect(html).toContain("19,300"); // Total Downstream Volume
    });
  });

  describe("6. Interactive Component Behaviors: Tabs, Pagination, Filtering, and Tree Controls", () => {
    it("interactively switches to Table directory view and handles pagination controls", () => {
      render(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
          initialPageSize: 2,
        }),
      );

      // Switch to table tab
      const tableTab = screen.getByTestId("tab-table-view");
      fireEvent.click(tableTab);

      expect(screen.getByText("Downstream Referees Directory")).toBeDefined();
      expect(screen.getByTestId(`row-referee-${T1_ALICE_WALLET}`)).toBeDefined();
      expect(screen.getByTestId(`row-referee-${T1_BOB_WALLET}`)).toBeDefined();
      expect(screen.getByTestId("pagination-page-info").textContent).toContain("Page 1 of 3");

      // Navigate Next
      const nextBtn = screen.getByTestId("pagination-next");
      fireEvent.click(nextBtn);
      expect(screen.getByTestId("pagination-page-info").textContent).toContain("Page 2 of 3");
      expect(screen.getByTestId(`row-referee-${T2_CHARLIE_WALLET}`)).toBeDefined();

      // Navigate Prev
      const prevBtn = screen.getByTestId("pagination-prev");
      fireEvent.click(prevBtn);
      expect(screen.getByTestId("pagination-page-info").textContent).toContain("Page 1 of 3");

      // Change page size to 10
      const pageSizeSelect = screen.getByTestId("pagination-page-size");
      fireEvent.change(pageSizeSelect, { target: { value: "10" } });
      // When page size is 10, all 5 items fit on 1 page; pagination controls are hidden
      expect(screen.queryByTestId("pagination-next")).toBeNull();
    });

    it("interactively handles search, date, and tier filtering inputs with reset", () => {
      render(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
          initialPageSize: 10,
        }),
      );

      const tableTab = screen.getByTestId("tab-table-view");
      fireEvent.click(tableTab);

      // Search input filter
      const searchInput = screen.getByTestId("referee-search-input");
      fireEvent.change(searchInput, { target: { value: "Alice" } });
      expect(screen.getByTestId(`row-referee-${T1_ALICE_WALLET}`)).toBeDefined();
      expect(screen.queryByTestId(`row-referee-${T1_BOB_WALLET}`)).toBeNull();

      // Clear filters button
      const clearBtn = screen.getByTestId("btn-clear-filters");
      fireEvent.click(clearBtn);
      expect(screen.getByTestId(`row-referee-${T1_BOB_WALLET}`)).toBeDefined();

      // Date input filter
      const dateInput = screen.getByTestId("referee-date-filter");
      fireEvent.change(dateInput, { target: { value: "2026-10-20" } });
      expect(screen.getByTestId(`row-referee-${T1_BOB_WALLET}`)).toBeDefined();
      expect(screen.queryByTestId(`row-referee-${T1_ALICE_WALLET}`)).toBeNull();

      // Reset date input
      fireEvent.change(dateInput, { target: { value: "" } });

      // Tier filter select (Tier 1 vs Tier 2 vs All)
      const tierSelect = screen.getByTestId("referee-tier-filter");
      fireEvent.change(tierSelect, { target: { value: "1" } });
      expect(screen.getByTestId(`row-referee-${T1_ALICE_WALLET}`)).toBeDefined();
      expect(screen.queryByTestId(`row-referee-${T2_CHARLIE_WALLET}`)).toBeNull();

      fireEvent.change(tierSelect, { target: { value: "2" } });
      expect(screen.getByTestId(`row-referee-${T2_CHARLIE_WALLET}`)).toBeDefined();
      expect(screen.queryByTestId(`row-referee-${T1_ALICE_WALLET}`)).toBeNull();

      fireEvent.change(tierSelect, { target: { value: "all" } });
      expect(screen.getByTestId(`row-referee-${T1_ALICE_WALLET}`)).toBeDefined();

      // Empty search match message
      fireEvent.change(searchInput, { target: { value: "NonExistentReferralXYZ" } });
      expect(
        screen.getByText("No referees match the current search or filter criteria."),
      ).toBeDefined();
      fireEvent.click(screen.getByTestId("btn-clear-filters"));
      expect(screen.getByTestId(`row-referee-${T1_ALICE_WALLET}`)).toBeDefined();
    });

    it("interactively operates tree collapse, expand all, and node selection", () => {
      render(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
        }),
      );

      // Verify default tree view
      expect(screen.getByTestId(`tree-node-${MASTER_WALLET}`)).toBeDefined();
      expect(screen.getByTestId(`tree-node-${T2_CHARLIE_WALLET}`)).toBeDefined();

      // Collapse all branches
      const collapseAllBtn = screen.getByTestId("btn-collapse-all");
      fireEvent.click(collapseAllBtn);
      expect(screen.queryByTestId(`tree-node-${T2_CHARLIE_WALLET}`)).toBeNull();

      // Expand all branches
      const expandAllBtn = screen.getByTestId("btn-expand-all");
      fireEvent.click(expandAllBtn);
      expect(screen.getByTestId(`tree-node-${T2_CHARLIE_WALLET}`)).toBeDefined();

      // Toggle single node branch (Alice)
      const aliceToggle = screen.getByTestId(`collapse-toggle-${T1_ALICE_WALLET}`);
      fireEvent.click(aliceToggle);
      expect(screen.queryByTestId(`tree-node-${T2_CHARLIE_WALLET}`)).toBeNull();
      fireEvent.click(aliceToggle);
      expect(screen.getByTestId(`tree-node-${T2_CHARLIE_WALLET}`)).toBeDefined();

      // Select nodes by clicking row
      const aliceRow = screen.getByTestId(`tree-node-${T1_ALICE_WALLET}`);
      fireEvent.click(aliceRow);

      const rootRow = screen.getByTestId(`tree-node-${MASTER_WALLET}`);
      fireEvent.click(rootRow);

      const eveRow = screen.getByTestId(`tree-node-${T3_EVE_WALLET}`);
      fireEvent.click(eveRow);
    });

    it("toggles privacy mask interactively and supports default unmasked mode", () => {
      render(
        React.createElement(B2CNetworkTree, {
          masterAddress: MASTER_WALLET,
          relations: sampleRelations,
        }),
      );

      const toggleBtn = screen.getByTestId("privacy-mask-toggle");
      expect(toggleBtn.textContent).toContain("Privacy Mask Active");

      // Toggle off
      fireEvent.click(toggleBtn);
      expect(toggleBtn.textContent).toContain("Mask Wallet Addresses");

      // Toggle on
      fireEvent.click(toggleBtn);
      expect(toggleBtn.textContent).toContain("Privacy Mask Active");
    });

    it("mounts cleanly with default fallback properties", () => {
      render(React.createElement(B2CNetworkTree, {}));
      expect(screen.getByTestId("b2c-network-tree-container")).toBeDefined();
    });
  });

  describe("7. Additional Engine & Volume Rollup Verification", () => {
    it("computes referral tree summary with tier1, tier2, and total downstream volume fields", () => {
      const summary = getReferralTreeSummary(MASTER_WALLET, sampleRelations);
      expect(summary.totalNetworkVolumeXlm).toBe(15000);
      expect(summary.tier1VolumeXlm).toBe(15000);
      expect(summary.tier2VolumeXlm).toBe(3500);
      expect(summary.totalDownstreamVolumeXlm).toBe(18500);
    });

    it("aggregates volume metrics starting directly from a ReferralTreeNode root", () => {
      const rootNode = buildRecursiveReferralTree(MASTER_WALLET, sampleRelations);
      const agg = aggregateNetworkVolume(rootNode);

      expect(agg.totalCount).toBe(5);
      expect(agg.tier1Count).toBe(2);
      expect(agg.tier2Count).toBe(2);
      expect(agg.tier1Volume).toBe(15000);
      expect(agg.tier2Volume).toBe(3500);
      expect(agg.totalVolume).toBe(19300);
      expect(agg.volumeByTier[3]).toBe(800);
      expect(agg.totalOverrides).toBeGreaterThan(0);
    });

    it("retrieves recruiter and direct sub-affiliates accurately", () => {
      const recruiter = getRecruiterForAffiliate(T1_ALICE_WALLET, sampleRelations);
      expect(recruiter).toBeDefined();
      expect(recruiter?.parentAddress).toBe(MASTER_WALLET);

      const subs = getSubAffiliatesForParent(MASTER_WALLET, sampleRelations);
      expect(subs.length).toBe(2);
      expect(subs.map((s) => s.childAddress)).toContain(T1_ALICE_WALLET);
      expect(subs.map((s) => s.childAddress)).toContain(T1_BOB_WALLET);
    });
  });
});
