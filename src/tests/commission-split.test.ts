import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  validateSplitPlan,
  computeSplitAllocations,
  buildSplitPaymentOperations,
  formatStroopsAsXlm,
  xlmToStroops,
  resolveActiveSplitPlan,
  toSplitAllocationReceipts,
  type SplitDestination,
  type SplitPlan,
} from "../lib/commissionSplit";
import {
  executeBatchCommissionClaim,
  type ClaimableCampaignItem,
} from "../lib/batchClaim";
import {
  loadAffiliatePreferences,
  sanitizeSplitDestinations,
  DEFAULT_PREFERENCES,
  SETTINGS_STORAGE_KEY,
} from "../components/affiliate/AffiliateSettings";

const MAIN = Keypair.random().publicKey();
const VAULT = Keypair.random().publicKey();
const THIRD = Keypair.random().publicKey();

const campaignItems: ClaimableCampaignItem[] = [
  {
    campaignId: 101,
    campaignName: "Apex Alpha Performance Tech",
    advertiserAddress: MAIN,
    maturedSalesCount: 4,
    claimableXlm: 45.5,
    clearingPeriodDays: 7,
    lastSaleDate: "2026-10-01",
    status: "matured",
  },
  {
    campaignId: 204,
    campaignName: "Nova Quantum Cloud Services",
    advertiserAddress: MAIN,
    maturedSalesCount: 7,
    claimableXlm: 78.0,
    clearingPeriodDays: 14,
    lastSaleDate: "2026-09-28",
    status: "matured",
  },
  {
    campaignId: 309,
    campaignName: "Stellar Horizon SaaS Hub",
    advertiserAddress: MAIN,
    maturedSalesCount: 3,
    claimableXlm: 32.25,
    clearingPeriodDays: 3,
    lastSaleDate: "2026-10-08",
    status: "matured",
  },
];

function dest(address: string, percentage: number, label = "Vault"): SplitDestination {
  return { id: `split-${address.slice(0, 5)}-${percentage}`, label, address, percentage };
}

describe("Commission Auto-Split Plan Validation (#167)", () => {
  it("accepts a plan whose allocations sum to exactly 100%", () => {
    const plan: SplitPlan = {
      enabled: true,
      destinations: [dest(MAIN, 70, "Main Wallet"), dest(VAULT, 30, "Cold Storage Vault")],
    };
    const result = validateSplitPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.totalPercentage).toBe(100);
  });

  it("rejects a plan that does not sum to exactly 100%", () => {
    const plan: SplitPlan = {
      enabled: true,
      destinations: [dest(MAIN, 70), dest(VAULT, 20)],
    };
    const result = validateSplitPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/exactly 100%/);
  });

  it("handles fractional percentages without float drift (33.3 + 33.3 + 33.4 = 100)", () => {
    const plan: SplitPlan = {
      enabled: true,
      destinations: [dest(MAIN, 33.3), dest(VAULT, 33.3), dest(THIRD, 33.4)],
    };
    expect(validateSplitPlan(plan).valid).toBe(true);
  });

  it("rejects invalid destination public keys", () => {
    const plan: SplitPlan = {
      enabled: true,
      destinations: [dest("not-a-stellar-key", 100)],
    };
    const result = validateSplitPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/valid Stellar public key/);
  });

  it("rejects duplicate destination addresses", () => {
    const plan: SplitPlan = {
      enabled: true,
      destinations: [dest(MAIN, 50), dest(MAIN, 50)],
    };
    const result = validateSplitPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Duplicate/);
  });

  it("treats disabled plans as valid regardless of content", () => {
    expect(validateSplitPlan({ enabled: false, destinations: [] }).valid).toBe(true);
    expect(
      validateSplitPlan({ enabled: false, destinations: [dest("garbage", 40)] }).valid,
    ).toBe(true);
  });
});

describe("Stroop-exact split allocation math", () => {
  it("splits 155.75 XLM 70/30 and sums to the original stroop total exactly", () => {
    const destinations = [dest(MAIN, 70, "Main Wallet"), dest(VAULT, 30, "Vault")];
    const total = xlmToStroops(155.75);
    const allocations = computeSplitAllocations(total, destinations);

    expect(allocations).toHaveLength(2);
    expect(allocations[0].amountStroops).toBe(1090250000n); // 109.025 XLM
    expect(allocations[1].amountStroops).toBe(467250000n); // 46.725 XLM
    const sum = allocations.reduce((acc, a) => acc + a.amountStroops, 0n);
    expect(sum).toBe(total);
  });

  it("distributes indivisible remainder stroops so nothing is lost or minted", () => {
    // 100.0000001 XLM split three ways with equal-ish shares cannot floor evenly
    const destinations = [dest(MAIN, 33.33), dest(VAULT, 33.33), dest(THIRD, 33.34)];
    const total = xlmToStroops(100.0000001);
    const allocations = computeSplitAllocations(total, destinations);
    const sum = allocations.reduce((acc, a) => acc + a.amountStroops, 0n);
    expect(sum).toBe(total);
  });

  it("returns no allocations for zero or empty inputs", () => {
    expect(computeSplitAllocations(0n, [dest(MAIN, 100)])).toEqual([]);
    expect(computeSplitAllocations(1000n, [])).toEqual([]);
  });

  it("formats stroops to 7-decimal XLM strings", () => {
    expect(formatStroopsAsXlm(1090250000n)).toBe("109.0250000");
    expect(formatStroopsAsXlm(1n)).toBe("0.0000001");
  });

  it("builds one payment operation per allocation", () => {
    const allocations = computeSplitAllocations(xlmToStroops(50), [
      dest(MAIN, 70),
      dest(VAULT, 30),
    ]);
    const ops = buildSplitPaymentOperations(allocations);
    expect(ops).toHaveLength(2);
    // Must serialize into a real Stellar transaction envelope
    expect(() => ops[0].toXDR()).not.toThrow();
  });
});

describe("Atomic split routing during payout claim", () => {
  it("itemizes split payment operations in the batch claim receipt (mock envelope)", async () => {
    const plan: SplitPlan = {
      enabled: true,
      destinations: [dest(MAIN, 70, "Main Wallet"), dest(VAULT, 30, "Cold Vault")],
    };
    const receipt = await executeBatchCommissionClaim(MAIN, campaignItems, "mock", plan);

    expect(receipt.success).toBe(true);
    expect(receipt.totalClaimedXlm).toBe(155.75);
    expect(receipt.paymentOperationCount).toBe(2);
    expect(receipt.splitAllocations).toBeDefined();
    expect(receipt.splitAllocations).toHaveLength(2);

    const [mainShare, vaultShare] = receipt.splitAllocations!;
    expect(mainShare.label).toBe("Main Wallet");
    expect(vaultShare.address).toBe(VAULT);
    expect(mainShare.amountStroops).toBe("1090250000");
    expect(vaultShare.amountStroops).toBe("467250000");
    const allocatedStroops =
      BigInt(mainShare.amountStroops) + BigInt(vaultShare.amountStroops);
    expect(allocatedStroops).toBe(xlmToStroops(receipt.totalClaimedXlm));
  });

  it("leaves receipts unsplit when no plan is active (full payout to affiliate)", async () => {
    const receipt = await executeBatchCommissionClaim(MAIN, campaignItems, "mock", null);
    expect(receipt.splitAllocations).toBeUndefined();
    expect(receipt.paymentOperationCount).toBe(0);
  });

  it("serializes allocations to receipt-safe records", () => {
    const allocations = computeSplitAllocations(xlmToStroops(10), [dest(VAULT, 100)]);
    const [row] = toSplitAllocationReceipts(allocations);
    expect(row.amountStroops).toBe("100000000");
    expect(row.amountXlm).toBeCloseTo(10, 7);
    expect(row.address).toBe(VAULT);
  });

  it("ignores an enabled but invalid stored plan at claim time", () => {
    const plan = resolveActiveSplitPlan({
      autoSplitEnabled: true,
      autoSplitDestinations: [dest("broken", 55), dest(MAIN, 45)],
    });
    expect(plan).toBeNull();
  });

  it("resolves an enabled and valid plan for claim time", () => {
    const plan = resolveActiveSplitPlan({
      autoSplitEnabled: true,
      autoSplitDestinations: [dest(MAIN, 70), dest(VAULT, 30)],
    });
    expect(plan).not.toBeNull();
    expect(plan!.enabled).toBe(true);
  });
});

describe("Split plan persistence inside affiliate preferences", () => {
  let store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] ?? null,
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies split defaults for preferences saved before this feature existed", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ theme: "light", preferredAsset: "USDC" }),
    );
    const prefs = loadAffiliatePreferences();
    expect(prefs.autoSplitEnabled).toBe(false);
    expect(prefs.autoSplitDestinations).toEqual([]);
  });

  it("loads a persisted split plan intact", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_PREFERENCES,
        autoSplitEnabled: true,
        autoSplitDestinations: [dest(MAIN, 70), dest(VAULT, 30)],
      }),
    );
    const prefs = loadAffiliatePreferences();
    const plan = resolveActiveSplitPlan(prefs);
    expect(plan).not.toBeNull();
    expect(plan!.destinations.map((d) => d.percentage)).toEqual([70, 30]);
  });

  it("sanitizes malformed destination payloads defensively", () => {
    const cleaned = sanitizeSplitDestinations([
      null,
      42,
      { label: "Vault", address: ` ${VAULT.toLowerCase()} `, percentage: 130 },
      { address: MAIN, percentage: "not-a-number" },
    ]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].address).toBe(VAULT);
    expect(cleaned[0].percentage).toBe(100); // clamped
    expect(cleaned[0].id).toBeTruthy();
    expect(cleaned[1].percentage).toBe(0);
  });
});
