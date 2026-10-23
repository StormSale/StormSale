// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Advertiser } from "../pages/Advertiser";
import { Affiliate } from "../pages/Affiliate";
import { NotificationProvider } from "../context/NotificationContext";

// Mock subcomponents that make contract/RPC calls to keep page tests fast and reliable
vi.mock("../components/advertiser/ContractTTLRestorer", () => ({
  ContractTTLRestorer: () => <div data-testid="contract-ttl-restorer" />,
}));
vi.mock("../components/advertiser/CreateCampaignForm", () => ({
  CreateCampaignForm: () => <div data-testid="create-campaign-form" />,
}));
vi.mock("../components/advertiser/LogSaleForm", () => ({
  LogSaleForm: () => <div data-testid="log-sale-form" />,
}));
vi.mock("../components/advertiser/GrantAccessForm", () => ({
  GrantAccessForm: () => <div data-testid="grant-access-form" />,
}));
vi.mock("../components/advertiser/AuditAccessPortal", () => ({
  AuditAccessPortal: () => <div data-testid="audit-access-portal" />,
}));
vi.mock("../components/advertiser/CohortVisualizer", () => ({
  CohortVisualizer: () => <div data-testid="cohort-visualizer" />,
}));
vi.mock("../components/advertiser/WebhookManager", () => ({
  WebhookManager: () => <div data-testid="webhook-manager" />,
}));
vi.mock("../components/advertiser/CampaignAnalytics", () => ({
  CampaignAnalytics: () => <div data-testid="campaign-analytics" />,
}));
vi.mock("../components/advertiser/MyCampaignsList", async (importOriginal) => ({
  // Keep the campaign data exports (used by AssetUploader); stub only the component
  ...(await importOriginal<typeof import("../components/advertiser/MyCampaignsList")>()),
  MyCampaignsList: () => <div data-testid="my-campaigns-list" />,
}));
vi.mock("../components/affiliate/TelegramCampaignBrowser", () => ({
  TelegramCampaignBrowser: () => <div data-testid="telegram-campaign-browser" />,
}));
vi.mock("../components/affiliate/JoinCampaignButton", () => ({
  JoinCampaignButton: () => <div data-testid="join-campaign-button" />,
}));
vi.mock("../components/affiliate/SalesList", () => ({
  SalesList: () => <div data-testid="sales-list" />,
}));
vi.mock("../components/affiliate/ClaimPayouts", () => ({
  ClaimPayouts: () => <div data-testid="claim-payouts" />,
}));
vi.mock("../components/affiliate/AffiliateSettings", () => ({
  AffiliateSettings: () => <div data-testid="affiliate-settings" />,
}));
vi.mock("../components/affiliate/AffiliateOverview", () => ({
  AffiliateOverview: () => <div data-testid="affiliate-overview" />,
}));
vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GASTORM1234567890TESTNETADDRESS1234567890",
  }),
}));
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        return ({ children, ...props }: any) => {
          const Tag = (typeof prop === "string" ? prop : "div") as any;
          return <Tag {...props}>{children}</Tag>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("Advertiser and Affiliate Pages Suite", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    vi.stubGlobal("localStorage", mockStorage);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("Advertiser Page", () => {
    it("renders advertiser overview and navigates tabs", () => {
      const onBack = vi.fn();
      render(
        <NotificationProvider>
          <Advertiser onBack={onBack} />
        </NotificationProvider>,
      );

      // Verify overview components
      expect(screen.getByText("Advertiser Command Center")).toBeDefined();
      expect(screen.getByText("Quick Execution")).toBeDefined();

      // Click Quick Execution action buttons
      const createBtns = screen.getAllByText("Create Campaign");
      fireEvent.click(createBtns[createBtns.length - 1]);
      expect(screen.getByTestId("create-campaign-form")).toBeDefined();

      // Click Promotion Assets tab
      const assetTab = screen.getByText("Promotion Assets & IPFS");
      fireEvent.click(assetTab);
      expect(screen.getByText("Campaign Asset Library")).toBeDefined();

      // Navigate to My Campaigns
      const myCampaignsTabs = screen.getAllByText("My Campaigns");
      fireEvent.click(myCampaignsTabs[0]);
      expect(screen.getByTestId("my-campaigns-list")).toBeDefined();

      // Navigate to Cohort Analysis
      const cohortTab = screen.getByText("Cohort & LTV Analysis");
      fireEvent.click(cohortTab);
      expect(screen.getByTestId("cohort-visualizer")).toBeDefined();

      // Navigate to Webhooks
      const webhooksTab = screen.getByText("Postback Webhooks");
      fireEvent.click(webhooksTab);
      expect(screen.getByTestId("webhook-manager")).toBeDefined();

      // Navigate to Grant Access
      const grantAccessTab = screen.getByText("Grant Audit Access");
      fireEvent.click(grantAccessTab);
      expect(screen.getByTestId("grant-access-form")).toBeDefined();

      // Navigate to Audit Logs
      const auditLogsTab = screen.getByText("Audit Access Logs");
      fireEvent.click(auditLogsTab);
      expect(screen.getByTestId("audit-access-portal")).toBeDefined();

      // Navigate to Analytics
      const analyticsTab = screen.getByText("Campaign Analytics");
      fireEvent.click(analyticsTab);
      expect(screen.getByTestId("campaign-analytics")).toBeDefined();

      // Navigate to Storefront Branding
      const brandingTab = screen.getByText("Storefront & Branding");
      fireEvent.click(brandingTab);

      // Navigate to Log Encrypted Sale
      const logSaleTab = screen.getByText("Log Encrypted Sale");
      fireEvent.click(logSaleTab);
      expect(screen.getByTestId("log-sale-form")).toBeDefined();

      // Navigate back to overview
      const overviewTab = screen.getByText("Dashboard Overview");
      fireEvent.click(overviewTab);
      expect(screen.getByText("Advertiser Command Center")).toBeDefined();
    });
  });

  describe("Affiliate Page", () => {
    it("renders affiliate page and navigates all tabs", () => {
      const onBack = vi.fn();
      render(
        <NotificationProvider>
          <Affiliate onBack={onBack} />
        </NotificationProvider>,
      );

      // Creative Assets tab
      const creativeTab = screen.getByText("Creative Assets & IPFS");
      fireEvent.click(creativeTab);
      expect(screen.getByText("Creative Marketing Assets")).toBeDefined();

      // Telegram Campaigns tab
      const telegramTab = screen.getByText("Telegram Campaigns");
      fireEvent.click(telegramTab);
      expect(screen.getByTestId("telegram-campaign-browser")).toBeDefined();

      // Join Campaign tab
      const joinTab = screen.getByText("Join Campaign");
      fireEvent.click(joinTab);
      expect(screen.getByTestId("join-campaign-button")).toBeDefined();

      // My Sales tab
      const salesTab = screen.getByText("My Sales & Commissions");
      fireEvent.click(salesTab);
      expect(screen.getByTestId("sales-list")).toBeDefined();

      // Claim Payouts tab
      const claimTab = screen.getByText("Claim Payouts");
      fireEvent.click(claimTab);
      expect(screen.getByTestId("claim-payouts")).toBeDefined();

      // Settings tab
      const settingsTab = screen.getByText("Personalized Settings");
      fireEvent.click(settingsTab);
      expect(screen.getByTestId("affiliate-settings")).toBeDefined();

      // Overview tab
      const overviewTab = screen.getByText("Dashboard Overview");
      fireEvent.click(overviewTab);
      expect(screen.getByTestId("affiliate-overview")).toBeDefined();
    });
  });
});
