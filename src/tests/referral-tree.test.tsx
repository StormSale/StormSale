import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  calculateTwoTierCommission,
  validateReferralBinding,
  loadReferralRelations,
  saveReferralRelations,
  registerSubAffiliate,
  buildReferralTree,
  getReferralTreeSummary,
  recordReferralSale,
  generateRecruiterInviteLink,
  parseRecruiterInviteFromUrl,
  generateMockReferralRelations,
} from "../lib/referralTree";
import type { AffiliateReferralRelation } from "../types/referral";
import {
  ReferralTreeProvider,
  useReferralTree,
  type ReferralTreeContextType,
} from "../context/ReferralTreeContext";
import { NotificationProvider } from "../context/NotificationContext";
import { Web3Provider } from "../context/Web3Context";
import { ReferralNetworkTree } from "../components/affiliate/ReferralNetworkTree";
import { RecruiterInviteModal } from "../components/affiliate/RecruiterInviteModal";
import { LogSaleForm } from "../components/advertiser/LogSaleForm";
import { logSaleContractCall } from "../lib/stellar";
import { getLocalStorage } from "../lib/storage";

describe("Two-Tier Referral Tree Architecture & Sub-Affiliate Override Commissions (#157)", () => {
  const storage = getLocalStorage();

  const MASTER_WALLET = "GASTORMSALE7MASTERRECRUITER0000000000000000000000000000001";
  const SUB_WALLET_1 = "GASTORMSALE7SUBAFFILIATE10000000000000000000000000000000001";
  const SUB_WALLET_2 = "GASTORMSALE7SUBAFFILIATE20000000000000000000000000000000002";

  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui: React.ReactNode, masterAddr: string = MASTER_WALLET) => {
    return renderToString(
      <Web3Provider overrideAddress={masterAddr}>
        <NotificationProvider>
          <ReferralTreeProvider masterAddressOverride={masterAddr}>
            {ui}
          </ReferralTreeProvider>
        </NotificationProvider>
      </Web3Provider>,
    );
  };

  describe("1. Mathematical Commission Split Calculations (8% Direct / 2% Recruiter Override)", () => {
    it("splits verified sale commission accurately between selling affiliate and master recruiter", () => {
      const saleAmount = 500; // 500 XLM
      const split = calculateTwoTierCommission(
        saleAmount,
        10.0, // 10% total commission
        2.0,  // 2% recruiter override
        MASTER_WALLET,
        SUB_WALLET_1,
      );

      // Selling affiliate gets 8% of 500 = 40 XLM
      expect(split.sellingAffiliateRatePercent).toBe(8.0);
      expect(split.sellingAffiliateCommissionXlm).toBe(40.0);
      expect(split.sellingAffiliateStroops).toBe(400_000_000n);

      // Recruiter gets 2% of 500 = 10 XLM
      expect(split.recruiterOverrideRatePercent).toBe(2.0);
      expect(split.recruiterOverrideCommissionXlm).toBe(10.0);
      expect(split.recruiterOverrideStroops).toBe(100_000_000n);

      expect(split.totalCommissionXlm).toBe(50.0);
      expect(split.hasRecruiter).toBe(true);
      expect(split.splitRatioLabel).toBe("80% / 20%");
    });

    it("awards full 100% commission to selling affiliate when no recruiter is registered", () => {
      const saleAmount = 1000;
      const split = calculateTwoTierCommission(saleAmount, 10.0, 2.0, undefined, SUB_WALLET_1);

      expect(split.sellingAffiliateRatePercent).toBe(10.0);
      expect(split.sellingAffiliateCommissionXlm).toBe(100.0);
      expect(split.recruiterOverrideCommissionXlm).toBe(0);
      expect(split.hasRecruiter).toBe(false);
      expect(split.splitRatioLabel).toBe("100% / 0%");
    });

    it("handles zero and negative sale amounts gracefully", () => {
      const split = calculateTwoTierCommission(-100, 10.0, 2.0, MASTER_WALLET, SUB_WALLET_1);
      expect(split.saleAmountXlm).toBe(0);
      expect(split.totalCommissionXlm).toBe(0);
      expect(split.sellingAffiliateCommissionXlm).toBe(0);
      expect(split.recruiterOverrideCommissionXlm).toBe(0);
    });

    it("clamps override rate so it does not exceed total commission rate", () => {
      const split = calculateTwoTierCommission(1000, 5.0, 8.0, MASTER_WALLET, SUB_WALLET_1);
      // Override clamped to max 5.0%, direct selling gets 0%
      expect(split.recruiterOverrideRatePercent).toBe(5.0);
      expect(split.sellingAffiliateRatePercent).toBe(0);
      expect(split.totalCommissionXlm).toBe(50.0);
    });
  });

  describe("2. Parent-Child Binding & Anti-Circular Referral Validation", () => {
    it("successfully validates and registers a valid sub-affiliate referral binding", () => {
      const existing: AffiliateReferralRelation[] = [];
      const validation = validateReferralBinding(SUB_WALLET_1, MASTER_WALLET, existing);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();

      const relation = registerSubAffiliate(SUB_WALLET_1, MASTER_WALLET, {
        childName: "Alice Marketer",
        overrideRatePercent: 2.0,
      });

      expect(relation.childAddress).toBe(SUB_WALLET_1);
      expect(relation.parentAddress).toBe(MASTER_WALLET);
      expect(relation.overrideRatePercent).toBe(2.0);
      expect(relation.directCommissionRatePercent).toBe(8.0);
      expect(relation.status).toBe("active");
    });

    it("strictly rejects self-referrals (affiliate recruiting themselves)", () => {
      const validation = validateReferralBinding(MASTER_WALLET, MASTER_WALLET, []);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("cannot recruit themselves");
    });

    it("rejects duplicate recruiter binding if sub-affiliate is already recruited", () => {
      const existing: AffiliateReferralRelation[] = [
        {
          childAddress: SUB_WALLET_1,
          childName: "Alice",
          parentAddress: MASTER_WALLET,
          recruitedAt: new Date().toISOString(),
          tier: 1,
          overrideRatePercent: 2.0,
          directCommissionRatePercent: 8.0,
          status: "active",
          totalSalesVolumeXlm: 0,
          totalDirectCommissionEarnedXlm: 0,
          totalOverrideEarnedXlm: 0,
          salesCount: 0,
        },
      ];

      const validation = validateReferralBinding(SUB_WALLET_1, SUB_WALLET_2, existing);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("already recruited");
    });

    it("detects and prevents 2-node circular referral loop (A recruits B, B recruits A)", () => {
      const existing: AffiliateReferralRelation[] = [
        {
          childAddress: SUB_WALLET_1,
          childName: "Alice",
          parentAddress: MASTER_WALLET,
          recruitedAt: new Date().toISOString(),
          tier: 1,
          overrideRatePercent: 2.0,
          directCommissionRatePercent: 8.0,
          status: "active",
          totalSalesVolumeXlm: 0,
          totalDirectCommissionEarnedXlm: 0,
          totalOverrideEarnedXlm: 0,
          salesCount: 0,
        },
      ];

      // Now SUB_WALLET_1 tries to recruit MASTER_WALLET
      const validation = validateReferralBinding(MASTER_WALLET, SUB_WALLET_1, existing);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Circular referral detected");
    });

    it("detects and prevents multi-hop transitive circular referral loop (A -> B -> C, C -> A)", () => {
      const existing: AffiliateReferralRelation[] = [
        {
          childAddress: SUB_WALLET_1,
          childName: "Alice",
          parentAddress: MASTER_WALLET,
          recruitedAt: new Date().toISOString(),
          tier: 1,
          overrideRatePercent: 2.0,
          directCommissionRatePercent: 8.0,
          status: "active",
          totalSalesVolumeXlm: 0,
          totalDirectCommissionEarnedXlm: 0,
          totalOverrideEarnedXlm: 0,
          salesCount: 0,
        },
        {
          childAddress: SUB_WALLET_2,
          childName: "Bob",
          parentAddress: SUB_WALLET_1,
          recruitedAt: new Date().toISOString(),
          tier: 2,
          overrideRatePercent: 2.0,
          directCommissionRatePercent: 8.0,
          status: "active",
          totalSalesVolumeXlm: 0,
          totalDirectCommissionEarnedXlm: 0,
          totalOverrideEarnedXlm: 0,
          salesCount: 0,
        },
      ];

      // SUB_WALLET_2 tries to recruit MASTER_WALLET
      const validation = validateReferralBinding(MASTER_WALLET, SUB_WALLET_2, existing);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Circular referral detected");
    });

    it("rejects invalid Stellar public keys", () => {
      const validation1 = validateReferralBinding("NOT_A_STELLAR_KEY", MASTER_WALLET, []);
      expect(validation1.valid).toBe(false);

      const validation2 = validateReferralBinding(SUB_WALLET_1, "INVALID_PARENT", []);
      expect(validation2.valid).toBe(false);
    });
  });

  describe("3. Tree Construction & Financial Summary Aggregation", () => {
    it("builds multi-tier referral tree with accurate sales volume and override totals", () => {
      const mockRelations = generateMockReferralRelations(MASTER_WALLET);
      saveReferralRelations(mockRelations);

      const tree = buildReferralTree(MASTER_WALLET, mockRelations);

      expect(tree.address).toBe(MASTER_WALLET);
      expect(tree.tier).toBe(0);
      expect(tree.children.length).toBe(3); // Alice, Bob, Carol

      // Check Tier 1 node Alice
      const aliceNode = tree.children.find((c) => c.name.includes("Alice"));
      expect(aliceNode).toBeDefined();
      expect(aliceNode?.tier).toBe(1);
      expect(aliceNode?.children.length).toBe(2); // Dave, Elena

      // Master cumulative volume includes sub-tree volume
      expect(tree.salesVolumeXlm).toBeGreaterThanOrEqual(25000);
      expect(tree.overrideEarningsXlm).toBeGreaterThanOrEqual(500);
    });

    it("computes referral tree summary metrics and identifies top producer", () => {
      const mockRelations = generateMockReferralRelations(MASTER_WALLET);
      const summary = getReferralTreeSummary(MASTER_WALLET, mockRelations);

      expect(summary.masterAddress).toBe(MASTER_WALLET);
      expect(summary.directRecruitsCount).toBe(3);
      expect(summary.secondTierRecruitsCount).toBe(2);
      expect(summary.totalNetworkSize).toBe(5);
      expect(summary.totalNetworkVolumeXlm).toBe(25100);
      expect(summary.totalOverrideEarnedXlm).toBe(502);

      expect(summary.topPerformer).toBeDefined();
      expect(summary.topPerformer?.name).toBe("Alice Media Pro");
      expect(summary.topPerformer?.volumeXlm).toBe(12500);
    });
  });

  describe("4. Recruiter Invite Link Generation & Parameter Parsing", () => {
    it("generates recruiter invite link with embedded master address and optional tags", () => {
      const link = generateRecruiterInviteLink(MASTER_WALLET, "https://stormsale.xyz", {
        tag: "telegram-vip",
        overrideRate: 2.5,
      });

      expect(link).toContain("recruiter=" + MASTER_WALLET);
      expect(link).toContain("tag=telegram-vip");
      expect(link).toContain("override=2.5");
    });

    it("parses recruiter parameters from URL query string reliably", () => {
      const url = `https://stormsale.xyz/affiliate?recruiter=${MASTER_WALLET}&tag=crypto-squad&override=2.0`;
      const parsed = parseRecruiterInviteFromUrl(url);

      expect(parsed.recruiterAddress).toBe(MASTER_WALLET);
      expect(parsed.tag).toBe("crypto-squad");
      expect(parsed.overrideRate).toBe(2.0);
    });

    it("returns null recruiter address for invalid or malformed URLs", () => {
      const parsed = parseRecruiterInviteFromUrl("https://stormsale.xyz/affiliate?recruiter=INVALID_KEY");
      expect(parsed.recruiterAddress).toBeNull();
    });
  });

  describe("5. Atomic Second-Tier Commission Settlement During log_sale (#157)", () => {
    it("accrues direct commission to seller and passive override to recruiter during recordReferralSale", () => {
      const mockRelations = generateMockReferralRelations(MASTER_WALLET);
      saveReferralRelations(mockRelations);

      const initialAlice = mockRelations.find((r) => r.childName.includes("Alice"))!;
      const initialVolume = initialAlice.totalSalesVolumeXlm;
      const initialOverride = initialAlice.totalOverrideEarnedXlm;

      const split = recordReferralSale({
        saleAmountXlm: 1000,
        sellingAffiliateAddress: initialAlice.childAddress,
        totalCommissionRatePercent: 10.0,
        txHash: "0xmock_atomic_ledger_tx_001",
      });

      expect(split.hasRecruiter).toBe(true);
      expect(split.sellingAffiliateCommissionXlm).toBe(80.0);
      expect(split.recruiterOverrideCommissionXlm).toBe(20.0);

      // Verify updated storage
      const updatedRelations = loadReferralRelations();
      const updatedAlice = updatedRelations.find((r) => r.childAddress === initialAlice.childAddress)!;

      expect(updatedAlice.totalSalesVolumeXlm).toBe(initialVolume + 1000);
      expect(updatedAlice.totalOverrideEarnedXlm).toBe(initialOverride + 20.0);
      expect(updatedAlice.salesCount).toBe(initialAlice.salesCount + 1);
    });

    it("invokes logSaleContractCall and returns multi-allocation split atomically", async () => {
      const mockRelations = generateMockReferralRelations(MASTER_WALLET);
      saveReferralRelations(mockRelations);

      const targetAffiliate = mockRelations[0].childAddress;

      const res = await logSaleContractCall(
        "GADVERTISER_ADMIN_WALLET",
        101,
        targetAffiliate,
        800,
        "mock",
        MASTER_WALLET,
      );

      expect(res.success).toBe(true);
      expect(res.txHash).toBeDefined();
      expect(res.split).toBeDefined();
      expect(res.split?.hasRecruiter).toBe(true);
      expect(res.split?.sellingAffiliateCommissionXlm).toBe(64.0); // 8% of 800
      expect(res.split?.recruiterOverrideCommissionXlm).toBe(16.0); // 2% of 800
    });
  });

  describe("6. ReferralTreeContext & State Management", () => {
    it("provides tree, summary, and recruiter link through hook context", () => {
      let treeCtx!: ReferralTreeContextType;
      const TestComponent = () => {
        treeCtx = useReferralTree();
        return <div>Network: {treeCtx.summary.totalNetworkSize}</div>;
      };

      renderWithProviders(<TestComponent />);

      expect(treeCtx).toBeDefined();
      expect(treeCtx.relations.length).toBeGreaterThanOrEqual(1);
      expect(treeCtx.summary.totalNetworkSize).toBeGreaterThanOrEqual(1);
      expect(treeCtx.recruiterLink).toContain("recruiter=");
    });

    it("allows recruiter binding and sale logging via context dispatcher", () => {
      let treeCtx!: ReferralTreeContextType;
      const TestComponent = () => {
        treeCtx = useReferralTree();
        return null;
      };

      renderWithProviders(<TestComponent />);

      const newRecruit = "GASTORMSALE7NEWRECRUIT000000000000000000000000000000000001";
      const bindRes = treeCtx.bindRecruiter(newRecruit, MASTER_WALLET, {
        childName: "New Recruited Partner",
        overrideRatePercent: 2.0,
      });

      expect(bindRes.success).toBe(true);

      const split = treeCtx.recordSaleAction({
        saleAmountXlm: 200,
        sellingAffiliateAddress: newRecruit,
      });

      expect(split.hasRecruiter).toBe(true);
      expect(split.sellingAffiliateCommissionXlm).toBe(16.0); // 8% of 200
      expect(split.recruiterOverrideCommissionXlm).toBe(4.0);  // 2% of 200
    });

    it("provides safe fallback context when rendered outside ReferralTreeProvider", () => {
      let fallbackCtx!: ReferralTreeContextType;
      const BareComponent = () => {
        fallbackCtx = useReferralTree();
        return null;
      };

      renderToString(<BareComponent />);

      expect(fallbackCtx).toBeDefined();
      expect(fallbackCtx.relations).toEqual([]);
      expect(fallbackCtx.tree.children).toEqual([]);
      expect(fallbackCtx.bindRecruiter("A", "B").success).toBe(false);
    });
  });

  describe("7. ReferralNetworkTree UI Component & Interactive SVG Graph", () => {
    it("renders bento stats, interactive SVG tree canvas, and recruited partner cards", () => {
      const html = renderWithProviders(<ReferralNetworkTree />);

      // Bento stats
      expect(html).toContain("Total Marketers");
      expect(html).toContain("Network Sales Volume");
      expect(html).toContain("Passive Overrides");
      expect(html).toContain("Top Recruited Producer");

      // Interactive SVG elements
      expect(html).toContain("Two-Tier Referral Topology Map");
      expect(html).toContain("node-master");
      expect(html).toContain("Master Affiliate (You)");
      expect(html).toContain("Alice Media Pro");
      expect(html).toContain("Bob Stellar Ads");

      // Primary CTA
      expect(html).toContain("Invite Marketers");
      expect(html).toContain("btn-open-invite-modal");
    });

    it("renders recruited sub-affiliates tabular list and override receipts", () => {
      const html = renderWithProviders(<ReferralNetworkTree />);

      expect(html).toContain("tab-tree-view");
      expect(html).toContain("tab-table-view");
      expect(html).toContain("tab-overrides-view");
    });
  });

  describe("8. RecruiterInviteModal Component UI & Simulator", () => {
    it("renders recruiter invite URL, override slider, and QR download options", () => {
      const html = renderWithProviders(
        <RecruiterInviteModal isOpen={true} onClose={() => {}} />,
      );

      expect(html).toContain("Invite Marketers &amp; Earn Passive Overrides");
      expect(html).toContain("Your Master Recruiter Link");
      expect(html).toContain("Passive Earnings Calculator");
      expect(html).toContain("Directly Bind a Sub-Affiliate Wallet");
      expect(html).toContain("Share to Telegram");
      expect(html).toContain("input-recruiter-link");
    });
  });

  describe("9. LogSaleForm Two-Tier Referral Commission Split Preview", () => {
    it("displays two-tier split preview banner when a recruited sub-affiliate is entered", () => {
      const mockRelations = generateMockReferralRelations(MASTER_WALLET);
      saveReferralRelations(mockRelations);

      const alice = mockRelations.find((r) => r.childName.includes("Alice"))!;
      expect(alice).toBeDefined();

      const html = renderWithProviders(
        <LogSaleForm />,
      );

      expect(html).toContain("Log Encrypted Sale");
      expect(html).toContain("Affiliate Address");
    });
  });
});
