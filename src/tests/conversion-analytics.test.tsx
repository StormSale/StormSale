// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  calculateCVR,
  calculateTrend,
  fetchAffiliateConversionData,
  recordLinkClick,
  recordLinkConversion,
  clearConversionCache,
  type ActiveLinkAnalytics,
} from "../utils/api";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, style, ...props }: any) => (
      <div className={className} style={style} {...props}>
        {children}
      </div>
    ),
    button: ({ children, className, style, ...props }: any) => (
      <button className={className} style={style} {...props}>
        {children}
      </button>
    ),
    span: ({ children, className, style, ...props }: any) => (
      <span className={className} style={style} {...props}>
        {children}
      </span>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: {
    network: "TESTNET",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    nativeAsset: "XLM",
    nativeDecimals: 7,
  },
  ISSUERS: {
    TESTNET: { USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", EURC: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO" },
    PUBLIC: { USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", EURC: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2" },
  },
  NETWORK_ESCROW_ASSETS: {
    TESTNET: { USDC: { contractAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" } },
    PUBLIC: { USDC: { contractAddress: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" } },
  },
  ESCROW_ASSETS: [],
  SUPPORTED_ESCROW_ASSETS: [],
  getSupportedEscrowAssets: vi.fn().mockReturnValue([]),
  getEscrowAssetByCode: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({
  useWeb3: () => ({ userAddress: "GBBD5678TESTNET" }),
}));

vi.mock("../components/affiliate/TelegramCampaignBrowser", () => ({
  TelegramCampaignBrowser: () => <div data-testid="telegram-browser">Telegram Browser</div>,
}));
vi.mock("../components/affiliate/JoinCampaignButton", () => ({
  JoinCampaignButton: () => <div data-testid="join-campaign">Join Campaign</div>,
}));
vi.mock("../components/affiliate/SalesList", () => ({
  SalesList: () => <div data-testid="my-sales">Sales List</div>,
}));
vi.mock("../components/affiliate/ClaimPayouts", () => ({
  ClaimPayouts: () => <div data-testid="claim-payouts">Claim Payouts</div>,
}));
vi.mock("../components/affiliate/AffiliateSettings", () => ({
  AffiliateSettings: () => <div data-testid="settings">Affiliate Settings</div>,
}));
vi.mock("../components/affiliate/AffiliateOverview", () => ({
  AffiliateOverview: () => <div data-testid="overview">Overview Content</div>,
}));
vi.mock("../components/shared/Sidebar", () => ({
  Sidebar: ({ tabs, onTabChange, onBack }: any) => (
    <aside data-testid="sidebar">
      <button onClick={onBack}>Back Button</button>
      {tabs.map((t: any) => (
        <button key={t.id} onClick={() => onTabChange(t.id)}>
          {t.label}
        </button>
      ))}
    </aside>
  ),
}));
vi.mock("../components/shared/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

const mockBackendLinks: ActiveLinkAnalytics[] = [
  {
    id: "backend-link-1",
    campaignId: 10,
    campaignName: "Hardware Wallet SuperSale",
    linkUrl: "https://stormsale.xyz/c/10?ref=GBBD5678",
    targetUrl: "https://hardware.dev/buy",
    clicks: 1200,
    conversions: 60,
    conversionRate: 5.0,
    previousConversionRate: 4.5,
    previousPeriodConversionRate: 4.5,
    trendDelta: 0.5,
    trendDirection: "up",
    totalRevenueXlm: 6000,
    commissionEarnedXlm: 600,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
  {
    id: "backend-link-2",
    campaignId: 20,
    campaignName: "Solidity & Rust Course",
    linkUrl: "https://stormsale.xyz/c/20?ref=GBBD5678",
    targetUrl: "https://rustcourse.com/join",
    clicks: 800,
    conversions: 32,
    conversionRate: 4.0,
    previousConversionRate: 4.0,
    previousPeriodConversionRate: 4.0,
    trendDelta: 0.0,
    trendDirection: "neutral",
    totalRevenueXlm: 3200,
    commissionEarnedXlm: 320,
    commissionRate: 10,
    status: "active",
    lastSyncedAt: new Date().toISOString(),
  },
];

describe("Affiliate Real-Time CVR & Conversion Analytics Suite (#52)", () => {
  beforeEach(() => {
    clearConversionCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/affiliate/conversions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              links: mockBackendLinks,
              summary: {
                previousOverallCVR: 4.3,
              },
            }),
          });
        }
        if (url.includes("/click") || url.includes("/conversion")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: "Not found" }),
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Mathematical CVR (Click-to-Sale Ratio) Calculations", () => {
    it("calculates exact click-to-sale percentage correctly", () => {
      // 50 sales out of 1000 clicks = 5.0%
      expect(calculateCVR(50, 1000)).toBe(5.0);

      // 126 sales out of 3150 clicks = 4.0%
      expect(calculateCVR(126, 3150)).toBe(4.0);

      // 77 sales out of 2200 clicks = 3.5%
      expect(calculateCVR(77, 2200)).toBe(3.5);

      // 1 sale out of 30 clicks = 3.33%
      expect(calculateCVR(1, 30)).toBe(3.33);
    });

    it("handles zero clicks safely without NaN or divide-by-zero error", () => {
      expect(calculateCVR(0, 0)).toBe(0);
      expect(calculateCVR(5, 0)).toBe(0);
      expect(Number.isNaN(calculateCVR(0, 0))).toBe(false);
    });

    it("handles zero conversions accurately as 0.0%", () => {
      expect(calculateCVR(0, 500)).toBe(0);
    });

    it("handles 100% conversion rate edge case", () => {
      expect(calculateCVR(100, 100)).toBe(100.0);
    });

    it("correctly limits precision to 2 decimal places", () => {
      // 1 / 3 = 33.33333... -> 33.33
      expect(calculateCVR(1, 3)).toBe(33.33);
      // 2 / 7 = 28.5714... -> 28.57
      expect(calculateCVR(2, 7)).toBe(28.57);
    });
  });

  describe("Trend Indicator Calculations", () => {
    it("identifies positive (up) trend with positive delta", () => {
      const trend = calculateTrend(5.2, 4.0);
      expect(trend.trendDirection).toBe("up");
      expect(trend.trendDelta).toBe(1.2);
    });

    it("identifies negative (down) trend with negative delta", () => {
      const trend = calculateTrend(3.5, 4.2);
      expect(trend.trendDirection).toBe("down");
      expect(trend.trendDelta).toBe(-0.7);
    });

    it("identifies neutral (steady) trend when CVR is unchanged", () => {
      const trend = calculateTrend(4.5, 4.5);
      expect(trend.trendDirection).toBe("neutral");
      expect(trend.trendDelta).toBe(0.0);
    });
  });

  describe("Backend Conversion Data Synchronization", () => {
    it("synchronizes with successful GET /affiliate/conversions response from backend", async () => {
      const data = await fetchAffiliateConversionData(undefined, "7d");
      expect(data).toBeDefined();
      expect(data.links).toHaveLength(2);
      expect(data.links[0].id).toBe("backend-link-1");
      expect(data.links[0].campaignName).toBe("Hardware Wallet SuperSale");
      expect(data.links[0].clicks).toBe(1200);
      expect(data.links[0].conversions).toBe(60);

      const summary = data.summary;
      expect(summary.totalClicks).toBe(2000);
      expect(summary.totalConversions).toBe(92);
      expect(summary.overallCVR).toBe(4.6);
      expect(summary.previousOverallCVR).toBe(4.3);
      expect(summary.activeLinksCount).toBe(2);
      expect(summary.lastSynced).toBeDefined();
    });

    it("does not return another range's data when a different range fetch fails", async () => {
      // 7d succeeds and caches
      const data7d = await fetchAffiliateConversionData(undefined, "7d");
      expect(data7d.links[0].id).toBe("backend-link-1");

      // 24h fails on backend without cache
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("range=24h")) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error" }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ links: mockBackendLinks }),
          });
        }),
      );

      await expect(fetchAffiliateConversionData(undefined, "24h")).rejects.toThrow(
        /Failed to fetch conversion analytics for range "24h"/,
      );
    });

    it("ensures each active link has verified click-to-sale ratios", async () => {
      const { links } = await fetchAffiliateConversionData();
      for (const link of links) {
        expect(link.id).toBeDefined();
        expect(link.campaignName).toBeDefined();
        expect(link.clicks).toBeGreaterThanOrEqual(0);
        expect(link.conversions).toBeGreaterThanOrEqual(0);

        // Verify CVR integrity matches calculation
        const expectedCVR = calculateCVR(link.conversions, link.clicks);
        expect(link.conversionRate).toBe(expectedCVR);

        // Verify trend direction matches trendDelta
        if (link.trendDelta > 0) {
          expect(link.trendDirection).toBe("up");
        } else if (link.trendDelta < 0) {
          expect(link.trendDirection).toBe("down");
        } else {
          expect(link.trendDirection).toBe("neutral");
        }
      }
    });

    it("updates CVR in real-time when link click event is recorded", async () => {
      const initial = await fetchAffiliateConversionData();
      const firstLink = initial.links[0];
      const initialClicks = firstLink.clicks;

      const updated = await recordLinkClick(firstLink.id);
      expect(updated.clicks).toBe(initialClicks + 1);
      expect(updated.conversionRate).toBe(calculateCVR(updated.conversions, updated.clicks));
      expect(updated.previousConversionRate).toBe(firstLink.conversionRate);
    });

    it("updates CVR and commission in real-time when link conversion event is recorded", async () => {
      const initial = await fetchAffiliateConversionData();
      const firstLink = initial.links[0];
      const initialConversions = firstLink.conversions;
      const initialRevenue = firstLink.totalRevenueXlm;
      const initialCommission = firstLink.commissionEarnedXlm;

      const updated = await recordLinkConversion(firstLink.id, 200);
      expect(updated.conversions).toBe(initialConversions + 1);
      expect(updated.totalRevenueXlm).toBe(initialRevenue + 200);
      expect(updated.commissionEarnedXlm).toBe(
        initialCommission + (200 * firstLink.commissionRate) / 100,
      );
      expect(updated.conversionRate).toBe(calculateCVR(updated.conversions, updated.clicks));
      expect(updated.trendDirection).toBe("up");
    });

    it("serializes concurrent click operations on the same link without race conditions", async () => {
      const initial = await fetchAffiliateConversionData();
      const link = initial.links[0];
      const initialClicks = link.clicks;

      const [res1, res2] = await Promise.all([
        recordLinkClick(link.id),
        recordLinkClick(link.id),
      ]);

      expect(res1.clicks).toBe(initialClicks + 1);
      expect(res2.clicks).toBe(initialClicks + 2);
    });

    it("rolls back click count to initial value when click recording fails", async () => {
      const initial = await fetchAffiliateConversionData();
      const link = initial.links[0];
      const initialClicks = link.clicks;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/click")) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error" }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }),
      );

      await expect(recordLinkClick(link.id)).rejects.toThrow(
        "Failed to record click: HTTP 500",
      );

      // Re-stub to success to verify that subsequent click proceeds from the reverted click count
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          }),
        ),
      );

      const recovered = await recordLinkClick(link.id);
      expect(recovered.clicks).toBe(initialClicks + 1);
    });

    it("rolls back conversion count to initial value when conversion recording fails", async () => {
      const initial = await fetchAffiliateConversionData();
      const link = initial.links[0];
      const initialConversions = link.conversions;
      const initialRevenue = link.totalRevenueXlm;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/conversion")) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: "Internal Server Error" }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }),
      );

      await expect(recordLinkConversion(link.id, 100)).rejects.toThrow(
        "Failed to record conversion: HTTP 500",
      );

      // Re-stub to success to verify rollback preserved initial metrics
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          }),
        ),
      );

      const recovered = await recordLinkConversion(link.id, 100);
      expect(recovered.conversions).toBe(initialConversions + 1);
      expect(recovered.totalRevenueXlm).toBe(initialRevenue + 100);
    });
  });

  describe("API Client Core Functions Coverage (#52)", () => {
    it("tests enforceRoleMiddleware", async () => {
      const { enforceRoleMiddleware } = await import("../utils/api");
      const ok = enforceRoleMiddleware("ADVERTISER", "ADVERTISER");
      expect(ok.authorized).toBe(true);

      const denied = enforceRoleMiddleware("AFFILIATE", "ADVERTISER");
      expect(denied.authorized).toBe(false);

      const empty = enforceRoleMiddleware(null, "ADVERTISER");
      expect(empty.authorized).toBe(false);
    });

    it("tests generateSep10Challenge and verifySep10ChallengeResponse", async () => {
      const { generateSep10Challenge, verifySep10ChallengeResponse } = await import("../utils/api");
      const challenge = generateSep10Challenge("GSERVER", "GCLIENT");
      expect(challenge.transaction).toContain("GCLIENT");

      expect(verifySep10ChallengeResponse(challenge.transaction, "GCLIENT")).toBe(true);
      expect(verifySep10ChallengeResponse(challenge.transaction, "GOTHER")).toBe(false);
      expect(verifySep10ChallengeResponse("", "")).toBe(false);
    });

    it("tests registerUser and fetchCampaign", async () => {
      const { registerUser, fetchCampaign, fetchConversions } = await import("../utils/api");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/users")) {
            return Promise.resolve({
              ok: true,
              json: async () => ({ id: "u1", walletAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777", role: "AFFILIATE" }),
            });
          }
          if (url.includes("/campaigns/")) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                id: "c1",
                name: "Test",
                description: "desc",
                budgetAmount: 1000,
                commissionRatePercent: 10,
                clearingPeriodSecs: 3600,
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => [],
          });
        }),
      );

      const validKey = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
      const user = await registerUser(validKey, "AFFILIATE");
      expect(user.walletAddress).toBe(validKey);

      const camp = await fetchCampaign("c1");
      expect(camp?.name).toBe("Test");

      const convs = await fetchConversions("c1");
      expect(Array.isArray(convs)).toBe(true);

      const { createCampaignApi } = await import("../utils/api");
      const created = await createCampaignApi(validKey, "ADVERTISER", {
        name: "Test Campaign",
        budgetAmount: 1000,
        commissionRatePercent: 10,
        clearingPeriodSecs: 3600,
      });
      expect(created).toBeDefined();

      await expect(
        createCampaignApi(validKey, "AFFILIATE", {
          name: "Denied",
          budgetAmount: 100,
          commissionRatePercent: 5,
          clearingPeriodSecs: 60,
        }),
      ).rejects.toThrow();
    });
  });

  describe("PerformanceAnalytics Component Suite", () => {
    it("renders analytics KPIs and active links table", async () => {
      const { PerformanceAnalytics } = await import("../components/affiliate/PerformanceAnalytics");
      const { NotificationProvider } = await import("../context/NotificationContext");

      render(
        <NotificationProvider>
          <PerformanceAnalytics />
        </NotificationProvider>,
      );

      expect(await screen.findByText("Real-Time CVR & Conversion Analytics")).toBeDefined();
      expect(screen.getByText("Overall Conversion Rate")).toBeDefined();
      expect(screen.getByText("Total Tracked Clicks")).toBeDefined();
      expect(screen.getByText("Total Conversions")).toBeDefined();
      expect(screen.getByText("Commissions Earned")).toBeDefined();

      // Wait for mock data
      expect(await screen.findByText("Hardware Wallet SuperSale")).toBeDefined();
      expect(screen.getByText("Solidity & Rust Course")).toBeDefined();
    });

    it("handles time range switching, simulate click, simulate sale, copy link, and sync backend", async () => {
      const { PerformanceAnalytics } = await import("../components/affiliate/PerformanceAnalytics");
      const { NotificationProvider } = await import("../context/NotificationContext");

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <NotificationProvider>
          <PerformanceAnalytics />
        </NotificationProvider>,
      );

      expect(await screen.findByText("Hardware Wallet SuperSale")).toBeDefined();

      // Switch time ranges
      const btn24h = screen.getByRole("button", { name: "24H" });
      await act(async () => {
        fireEvent.click(btn24h);
      });

      const btnAll = screen.getByRole("button", { name: "ALL" });
      await act(async () => {
        fireEvent.click(btnAll);
      });

      // Simulate click
      const clickBtns = screen.getAllByRole("button", { name: /\+Click/i });
      await act(async () => {
        fireEvent.click(clickBtns[0]);
      });

      // Simulate sale
      const saleBtns = screen.getAllByRole("button", { name: /\+Sale/i });
      await act(async () => {
        fireEvent.click(saleBtns[0]);
      });

      // Copy referral link
      const copyBtns = screen.getAllByTitle("Copy referral link");
      await act(async () => {
        fireEvent.click(copyBtns[0]);
      });
      expect(writeTextMock).toHaveBeenCalled();

      // Copy referral link failure
      writeTextMock.mockRejectedValueOnce(new Error("Permission denied"));
      await act(async () => {
        fireEvent.click(copyBtns[0]);
      });

      // Sync backend button
      const syncBtn = screen.getByRole("button", { name: /Sync Backend/i });
      await act(async () => {
        fireEvent.click(syncBtn);
      });
    });

    it("handles fetch failure gracefully and displays offline status", async () => {
      const { PerformanceAnalytics } = await import("../components/affiliate/PerformanceAnalytics");
      const { NotificationProvider } = await import("../context/NotificationContext");

      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network connection dropped")),
      );

      render(
        <NotificationProvider>
          <PerformanceAnalytics />
        </NotificationProvider>,
      );

      expect(await screen.findByText(/Offline \/ Stale/i)).toBeDefined();

      const syncBtn = screen.getByRole("button", { name: /Sync Backend/i });
      await act(async () => {
        fireEvent.click(syncBtn);
      });
      expect(screen.getByText(/Offline \/ Stale/i)).toBeDefined();
    });
  });

  describe("Affiliate Page Suite", () => {
    it("renders tabs and switches content correctly", async () => {
      const { Affiliate } = await import("../pages/Affiliate");
      const onBack = vi.fn();

      render(<Affiliate onBack={onBack} />);

      expect(screen.getByText("Affiliate Pro Portal")).toBeDefined();
      expect(screen.getByTestId("overview")).toBeDefined();

      // Switch to performance tab via sidebar
      const cvrBtn = screen.getByRole("button", { name: "CVR Analytics" });
      act(() => {
        fireEvent.click(cvrBtn);
      });

      // Click preferences button
      const prefBtn = screen.getByRole("button", { name: /Preferences/i });
      act(() => {
        fireEvent.click(prefBtn);
      });
      expect(screen.getByTestId("settings")).toBeDefined();

      // Click sidebar tab buttons
      const joinBtn = screen.getByRole("button", { name: "Join Campaign" });
      act(() => {
        fireEvent.click(joinBtn);
      });
      expect(screen.getByTestId("join-campaign")).toBeDefined();

      const salesBtn = screen.getByRole("button", { name: "My Sales & Commissions" });
      act(() => {
        fireEvent.click(salesBtn);
      });
      expect(screen.getByTestId("my-sales")).toBeDefined();

      const claimsBtn = screen.getByRole("button", { name: "Claim Payouts" });
      act(() => {
        fireEvent.click(claimsBtn);
      });
      expect(screen.getByTestId("claim-payouts")).toBeDefined();

      const tgBtn = screen.getByRole("button", { name: "Telegram Campaigns" });
      act(() => {
        fireEvent.click(tgBtn);
      });
      expect(screen.getByTestId("telegram-browser")).toBeDefined();

      // Back button
      const backBtn = screen.getByRole("button", { name: "Back Button" });
      act(() => {
        fireEvent.click(backBtn);
      });
      expect(onBack).toHaveBeenCalled();
    });

    it("initializes active tab from URL search parameters", async () => {
      const { Affiliate } = await import("../pages/Affiliate");
      window.history.pushState({}, "", "/affiliate?tab=settings");

      render(<Affiliate onBack={vi.fn()} />);
      expect(screen.getByTestId("settings")).toBeDefined();
    });
  });
});

