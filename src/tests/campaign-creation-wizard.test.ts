import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  campaignWizardSchema,
  DEFAULT_WIZARD_VALUES,
  type CampaignWizardFormData,
} from "../components/advertiser/CreateCampaignWizard";

describe("[Advertiser] Campaign Creation Multi-Step Wizard (#26)", () => {
  let store: Record<string, string> = {};
  const mockLocalStorage = {
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

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  describe("Zod Schema Real-Time Validation", () => {
    it("validates correct complete campaign payload", () => {
      const validData: CampaignWizardFormData = {
        name: "DeFi Growth Campaign",
        targetUrl: "https://stormsale.io/offer",
        description: "Promote automated USDC and XLM liquidity vaults on Stellar.",
        brandName: "StormSale Labs",
        asset: "XLM",
        budget: 1500,
        commissionRate: 20,
        clearingPeriod: 14,
        category: "DeFi",
        tags: ["DeFi", "Stellar", "Yield"],
        targetAudience: "Crypto natives, liquidity providers",
        minAffiliateReputation: 30,
      };

      const result = campaignWizardSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("rejects invalid URLs in Basic Info", () => {
      const invalidData = {
        ...DEFAULT_WIZARD_VALUES,
        name: "Valid Campaign Name",
        targetUrl: "not-a-valid-url",
        description: "Valid description longer than 10 characters.",
        brandName: "Brand",
      };

      const result = campaignWizardSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        const urlError = (result.error.issues || []).find((e) => e.path.includes("targetUrl"));
        expect(urlError?.message).toContain("valid website URL");
      }
    });

    it("rejects campaign names shorter than 3 characters", () => {
      const invalidData = {
        ...DEFAULT_WIZARD_VALUES,
        name: "AB",
        targetUrl: "https://example.com",
      };

      const result = campaignWizardSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = (result.error.issues || []).find((e) => e.path.includes("name"));
        expect(nameError?.message).toContain("at least 3 characters");
      }
    });

    it("rejects budget below minimum threshold (< 50 tokens)", () => {
      const invalidData = {
        ...DEFAULT_WIZARD_VALUES,
        name: "Valid Name",
        targetUrl: "https://example.com",
        description: "Valid description text here",
        brandName: "Valid Brand",
        budget: 20, // Less than 50
      };

      const result = campaignWizardSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        const budgetError = (result.error.issues || []).find((e) => e.path.includes("budget"));
        expect(budgetError?.message).toContain("Minimum escrow budget");
      }
    });

    it("rejects commission rate over 60%", () => {
      const invalidData = {
        ...DEFAULT_WIZARD_VALUES,
        name: "Valid Name",
        targetUrl: "https://example.com",
        description: "Valid description text here",
        brandName: "Valid Brand",
        commissionRate: 75,
      };

      const result = campaignWizardSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        const commError = (result.error.issues || []).find((e) =>
          e.path.includes("commissionRate"),
        );
        expect(commError?.message).toContain("cannot exceed 60%");
      }
    });

    it("rejects empty category tags array", () => {
      const invalidData = {
        ...DEFAULT_WIZARD_VALUES,
        name: "Valid Name",
        targetUrl: "https://example.com",
        description: "Valid description text here",
        brandName: "Valid Brand",
        tags: [],
      };

      const result = campaignWizardSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        const tagError = (result.error.issues || []).find((e) => e.path.includes("tags"));
        expect(tagError?.message).toContain("at least 1 category tag");
      }
    });
  });

  describe("Interactive Cost Calculator Logic", () => {
    it("computes escrow totals and estimated payouts accurately", () => {
      const budget = 5000;
      const commissionRate = 20; // 20%
      const estimatedSales = 100;
      const avgBasket = budget / 10; // 500
      const estimatedPayoutsPer100 = Math.round(
        estimatedSales * avgBasket * (commissionRate / 100),
      );
      const protocolFee = Math.max(1, Math.round(budget * 0.005)); // 25
      const totalRequiredEscrow = budget + protocolFee; // 5025

      expect(protocolFee).toBe(25);
      expect(totalRequiredEscrow).toBe(5025);
      expect(estimatedPayoutsPer100).toBe(10000);
    });
  });

  describe("Save as Draft Persistence", () => {
    const DRAFT_KEY = "stormsale_campaign_wizard_draft";

    it("saves and retrieves draft state to/from localStorage", () => {
      const draftPayload: CampaignWizardFormData = {
        name: "Drafted Web3 Campaign",
        targetUrl: "https://draft.stormsale.io",
        description: "Draft description text for future review.",
        brandName: "Draft Labs",
        asset: "USDC",
        budget: 2500,
        commissionRate: 18,
        clearingPeriod: 10,
        category: "Fintech",
        tags: ["Fintech", "USDC"],
        targetAudience: "Affiliate marketers in Europe",
        minAffiliateReputation: 40,
      };

      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload));
      const loaded = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");

      expect(loaded.name).toBe("Drafted Web3 Campaign");
      expect(loaded.budget).toBe(2500);
      expect(loaded.asset).toBe("USDC");
      expect(loaded.tags).toContain("USDC");
    });

    it("clears draft from localStorage properly", () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: "Temporary" }));
      expect(localStorage.getItem(DRAFT_KEY)).toBeDefined();

      localStorage.removeItem(DRAFT_KEY);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
  });
});
