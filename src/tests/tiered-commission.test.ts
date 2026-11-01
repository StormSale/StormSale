// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  type CommissionTier,
  DEFAULT_COMMISSION_TIERS,
  validateCommissionTiers,
  resolveTierForSales,
  mapTierToScVal,
  mapTiersToScValVec,
  mapScValToTier,
  mapScValVecToTiers,
} from "../lib/commissionTiers";

const web3 = vi.hoisted(() => ({ current: {} as any }));
const notification = vi.hoisted(() => ({ showNotification: vi.fn() }));
const reserve = vi.hoisted(() => ({ current: {} as any }));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3.current }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => notification,
}));
vi.mock("../hooks/useAccountReserve", () => ({
  useAccountReserve: () => reserve.current,
}));

import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

describe("Tiered Multi-Level Commission Structure (#102)", () => {
  describe("Tier Validation Logic", () => {
    it("should accept default predefined performance tiers", () => {
      const res = validateCommissionTiers(DEFAULT_COMMISSION_TIERS);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("should reject an empty tier array", () => {
      const res = validateCommissionTiers([]);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("At least one commission tier is required");
    });

    it("should reject tiers without a name", () => {
      const invalidTiers: CommissionTier[] = [
        { id: "1", name: "", minSales: 0, commissionRate: 10 },
      ];
      const res = validateCommissionTiers(invalidTiers);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("must have a name");
    });

    it("should reject negative sales thresholds", () => {
      const invalidTiers: CommissionTier[] = [
        { id: "1", name: "Base", minSales: -5, commissionRate: 10 },
      ];
      const res = validateCommissionTiers(invalidTiers);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("valid sales threshold");
    });

    it("should reject invalid commission rates (<= 0% or > 100%)", () => {
      const zeroRate: CommissionTier[] = [
        { id: "1", name: "Base", minSales: 0, commissionRate: 0 },
      ];
      expect(validateCommissionTiers(zeroRate).valid).toBe(false);

      const excessiveRate: CommissionTier[] = [
        { id: "1", name: "Base", minSales: 0, commissionRate: 110 },
      ];
      expect(validateCommissionTiers(excessiveRate).valid).toBe(false);
    });

    it("should reject duplicate sales thresholds", () => {
      const duplicateTiers: CommissionTier[] = [
        { id: "1", name: "Tier 1", minSales: 0, commissionRate: 10 },
        { id: "2", name: "Tier 2", minSales: 50, commissionRate: 15 },
        { id: "3", name: "Tier 3", minSales: 50, commissionRate: 20 },
      ];
      const res = validateCommissionTiers(duplicateTiers);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Thresholds must be unique");
    });

    it("should enforce a baseline tier starting at 0 sales", () => {
      const noBaseTier: CommissionTier[] = [
        { id: "1", name: "Silver", minSales: 50, commissionRate: 15 },
        { id: "2", name: "Gold", minSales: 100, commissionRate: 20 },
      ];
      const res = validateCommissionTiers(noBaseTier);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("baseline tier with a threshold of 0 sales is required");
    });
  });

  describe("Affiliate Tier Resolution Logic", () => {
    it("should resolve Base Tier for 0 sales", () => {
      const result = resolveTierForSales(0, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Base Tier");
      expect(result.commissionRate).toBe(10);
      expect(result.nextTier?.name).toBe("Silver Tier");
      expect(result.salesToNextTier).toBe(50);
    });

    it("should resolve Base Tier for sales under 50", () => {
      const result = resolveTierForSales(49, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Base Tier");
      expect(result.commissionRate).toBe(10);
      expect(result.nextTier?.name).toBe("Silver Tier");
      expect(result.salesToNextTier).toBe(1);
    });

    it("should resolve Silver Tier at 50 sales", () => {
      const result = resolveTierForSales(50, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Silver Tier");
      expect(result.commissionRate).toBe(15);
      expect(result.nextTier?.name).toBe("Gold Tier");
      expect(result.salesToNextTier).toBe(50);
    });

    it("should resolve Gold Tier at milestone threshold (>100 sales)", () => {
      const at100 = resolveTierForSales(100, DEFAULT_COMMISSION_TIERS);
      expect(at100.tier?.name).toBe("Gold Tier");
      expect(at100.commissionRate).toBe(20);
      expect(at100.nextTier?.name).toBe("Platinum Tier");
      expect(at100.salesToNextTier).toBe(150);

      const above100 = resolveTierForSales(150, DEFAULT_COMMISSION_TIERS);
      expect(above100.tier?.name).toBe("Gold Tier");
      expect(above100.commissionRate).toBe(20);
      expect(above100.salesToNextTier).toBe(100);
    });

    it("should resolve top Platinum Tier for >=250 sales with no next tier", () => {
      const result = resolveTierForSales(300, DEFAULT_COMMISSION_TIERS);
      expect(result.tier?.name).toBe("Platinum Tier");
      expect(result.commissionRate).toBe(25);
      expect(result.nextTier).toBeNull();
      expect(result.salesToNextTier).toBe(0);
    });

    it("should fallback gracefully if tiers list is empty", () => {
      const result = resolveTierForSales(50, [], 12);
      expect(result.tier).toBeNull();
      expect(result.commissionRate).toBe(12);
      expect(result.nextTier).toBeNull();
    });
  });

  describe("On-Chain Soroban Tier Mapping Logic", () => {
    it("should correctly encode CommissionTier into Soroban ScVal Map", () => {
      const tier: CommissionTier = {
        id: "tier-gold",
        name: "Gold Tier",
        minSales: 100,
        commissionRate: 20,
      };

      const scVal = mapTierToScVal(tier);
      expect(scVal).toBeDefined();
      expect((scVal as any).type).toBe("scvMap");

      // Decode back
      const decoded = mapScValToTier(scVal, 0);
      expect(decoded.name).toBe("Gold Tier");
      expect(decoded.minSales).toBe(100);
      expect(decoded.commissionRate).toBe(20);
    });

    it("should accurately encode and decode an array of tiers as ScVal Vec", () => {
      const scValVec = mapTiersToScValVec(DEFAULT_COMMISSION_TIERS);
      expect((scValVec as any).type).toBe("scvVec");

      const decodedTiers = mapScValVecToTiers(scValVec);
      expect(decodedTiers.length).toBe(DEFAULT_COMMISSION_TIERS.length);

      expect(decodedTiers[0].minSales).toBe(0);
      expect(decodedTiers[0].commissionRate).toBe(10);

      expect(decodedTiers[1].minSales).toBe(50);
      expect(decodedTiers[1].commissionRate).toBe(15);

      expect(decodedTiers[2].minSales).toBe(100);
      expect(decodedTiers[2].commissionRate).toBe(20);

      expect(decodedTiers[3].minSales).toBe(250);
      expect(decodedTiers[3].commissionRate).toBe(25);
    });

    it("should handle non-vec ScVal and primitive ScVal fallbacks safely", () => {
      const singleMap = mapTierToScVal(DEFAULT_COMMISSION_TIERS[0]);
      expect(mapScValVecToTiers(singleMap)).toEqual([]);

      const fallbackTier = mapScValToTier({ type: "scvVoid" } as any, 2);
      expect(fallbackTier.name).toBe("Tier 3");
      expect(fallbackTier.minSales).toBe(0);
      expect(fallbackTier.commissionRate).toBe(10);
    });
  });

  describe("CreateCampaignForm Tiered UI & Submission", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      vi.clearAllMocks();
      web3.current = {
        createCampaignOnChain: vi.fn().mockResolvedValue({ campaignId: 42, txHash: "0xtiered" }),
        isConnected: true,
        userAddress: ADDRESS,
        xlmBalance: "500",
        tokenAllowance: 500,
        refreshTokenAllowance: vi.fn().mockResolvedValue(500),
        approveTokenAllowance: vi.fn().mockResolvedValue({ success: true, txHash: "0xapp" }),
        assetBalances: { XLM: "500", USDC: "500", EURC: "500" },
        isMultiSigAccount: false,
        openMultiSigModal: vi.fn(),
      };
      reserve.current = {
        spendableXlm: 400,
        reserveXlm: 1,
        balanceXlm: 401,
        subentries: 0,
        baseReserveXlm: 0.5,
        isLoading: false,
        isReady: true,
        isFallback: false,
        isUnavailable: false,
        sellingLiabilitiesXlm: 0,
        refresh: vi.fn().mockResolvedValue(undefined),
      };
    });

    afterEach(async () => {
      await act(async () => {
        root?.unmount();
      });
      container?.remove();
    });

    async function renderForm() {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root.render(React.createElement(CreateCampaignForm));
      });
    }

    function setInput(input: HTMLInputElement, value: string) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    async function clickButton(label: string) {
      const btn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes(label),
      );
      if (!btn) throw new Error(`Button not found: ${label}`);
      await act(async () => {
        btn.click();
      });
    }

    it("switches to Tiered Performance Rates, applies presets, edits tiers, simulates sales, and submits", async () => {
      await renderForm();

      // Switch to Tiered mode
      await clickButton("Tiered Performance Rates");
      expect(container.textContent).toContain("Affiliate Performance Tiers");
      expect(container.textContent).toContain("Tier Ladder:");

      // Apply presets
      await clickButton("Aggressive Scale");
      expect(container.textContent).toContain("8% - 22% (3 Tiers)");

      await clickButton("High-Ticket");
      expect(container.textContent).toContain("5% - 15% (3 Tiers)");

      await clickButton("Standard 4-Tier");
      expect(container.textContent).toContain("10% - 25% (4 Tiers)");

      // Add a new tier and edit tier fields
      await clickButton("Add Performance Tier");
      expect(container.textContent).toContain("(5 Tiers)");

      const tierNameInputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[placeholder="Tier Name"]'),
      );
      expect(tierNameInputs.length).toBe(5);
      setInput(tierNameInputs[4], "Diamond Tier");

      const thresholdInputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[placeholder="0"]'),
      );
      setInput(thresholdInputs[4], "400");

      const rateInputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[placeholder="15"]'),
      );
      setInput(rateInputs[4], "30");
      expect(container.textContent).toContain("10% - 30% (5 Tiers)");

      // Simulate sales via slider and number input
      const slider = container.querySelector<HTMLInputElement>(
        'input[aria-label="Simulated sales slider"]',
      )!;
      setInput(slider, "120");
      expect(container.textContent).toContain("Simulating 120 Sales");

      const simNumber = container.querySelector<HTMLInputElement>(
        'input[aria-label="Simulated sales count"]',
      )!;
      setInput(simNumber, "420");
      expect(container.textContent).toContain("Simulating 420 Sales");
      expect(container.textContent).toContain("Diamond Tier");

      // Remove non-base tiers
      const removeButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button[title="Remove tier"]'),
      );
      await act(async () => {
        removeButtons[removeButtons.length - 1].click();
      });
      expect(container.textContent).toContain("(4 Tiers)");

      // Fill campaign details and submit in tiered mode
      const nameInput = container.querySelector<HTMLInputElement>(
        'input[placeholder="e.g., Summer Sale 2024"]',
      )!;
      const budgetInput = container.querySelector<HTMLInputElement>(
        'input[placeholder="e.g., 1000"]',
      )!;
      setInput(nameInput, "Tiered Promo");
      setInput(budgetInput, "50");
      await clickButton("24 Hours");

      const form = container.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(web3.current.createCampaignOnChain).toHaveBeenCalledWith(
        "Tiered Promo",
        50,
        10,
        86400,
        "XLM",
      );
    });

    it("blocks submission when commission tiers have duplicate thresholds", async () => {
      await renderForm();
      await clickButton("Tiered Performance Rates");

      // Set Silver Tier threshold to 100 (same as Gold Tier)
      const thresholdInputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[placeholder="0"]'),
      );
      setInput(thresholdInputs[1], "100");
      expect(container.textContent).toContain("Thresholds must be unique");

      const form = container.querySelector("form")!;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(notification.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Invalid Commission Tiers" }),
      );
      expect(web3.current.createCampaignOnChain).not.toHaveBeenCalled();

      // Switch back to flat mode
      await clickButton("Flat Commission Rate");
      expect(container.querySelector('input[placeholder="e.g., 15 for 15%"]')).not.toBeNull();
    });
  });
});
