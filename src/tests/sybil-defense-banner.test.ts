// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  detectSybilCluster,
  recordSybilTelemetry,
  isAffiliateSybilRestricted,
  clearSybilTelemetry,
  type SybilClusterTelemetry,
} from "../lib/sybilDefense";
import { RestrictedModeBanner } from "../components/affiliate/RestrictedModeBanner";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { NotificationProvider } from "../context/NotificationContext";

// Mock framer-motion to prevent happy-dom animation cancel errors
vi.mock("framer-motion", () => {
  const MotionComponent = (props: any) => {
    const { initial, animate, exit, transition, ...rest } = props;
    return React.createElement("div", rest, props.children);
  };
  return {
    motion: new Proxy({}, { get: () => MotionComponent }),
    AnimatePresence: ({ children }: any) => children,
  };
});

// Mock Web3 hook so we can control userAddress and connection state
const mockWeb3State = {
  userAddress: "GAFFILIATE_SYBIL_TARGET_1234567890ABCDEF1234567890ABCDEF56",
  batchClaimPayoutsOnChain: vi.fn(),
  claimPayoutOnChain: vi.fn(),
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3State,
}));

vi.mock("../lib/fraudRiskEngine", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetchAuthoritativeAffiliatePauseState: vi.fn().mockResolvedValue(false),
  };
});

// Mock batchClaim items so ClaimPayouts renders with claimable campaigns
vi.mock("../lib/batchClaim", () => ({
  fetchAffiliateMaturedClaims: vi.fn().mockResolvedValue([
    {
      campaignId: 101,
      campaignName: "Test Affiliate Program",
      advertiserAddress: "GADV111122223333444455556666777788889999AAAABBBBCCCC5678",
      maturedSalesCount: 5,
      claimableXlm: 250.0,
      clearingPeriodDays: 7,
      lastSaleDate: "2026-11-20",
      status: "matured",
    },
  ]),
  calculateTotalClaimableXlm: vi.fn().mockReturnValue(250.0),
}));

describe("Sybil Attack Defense & Restricted Mode Banner Suite (#473)", () => {
  const FLAGGED_AFFILIATE = "GAFFILIATE_SYBIL_TARGET_1234567890ABCDEF1234567890ABCDEF56";
  const CLEAN_AFFILIATE = "GCLEAN_AFFILIATE_HONEST_1234567890ABCDEF1234567890ABCDEF56";

  beforeEach(() => {
    clearSybilTelemetry();
    vi.restoreAllMocks();
    mockWeb3State.userAddress = FLAGGED_AFFILIATE;
  });

  describe("1. Sybil Cluster Detection & Restricted Mode Triggering", () => {
    it("detects Sybil cluster when multiple newly created accounts share identical IP hash", () => {
      const accounts = [
        {
          address: "GSYBIL_01_1111111111111111111111111111111111111111111111111111",
          ipHash: "ip_hash_datacenter_farm_999",
          createdAt: "2026-11-20T10:00:00Z",
        },
        {
          address: "GSYBIL_02_2222222222222222222222222222222222222222222222222222",
          ipHash: "ip_hash_datacenter_farm_999",
          createdAt: "2026-11-20T10:02:00Z",
        },
        {
          address: "GSYBIL_03_3333333333333333333333333333333333333333333333333333",
          ipHash: "ip_hash_datacenter_farm_999",
          createdAt: "2026-11-20T10:05:00Z",
        },
      ];

      const detection = detectSybilCluster(accounts, 3);
      expect(detection.isSybilCluster).toBe(true);
      expect(detection.clusterSize).toBe(3);
      expect(detection.sharedIpHash).toBe("ip_hash_datacenter_farm_999");
      expect(detection.reason).toContain("Sybil cluster detected");
    });

    it("triggers restricted mode banner when backend telemetry flags Sybil cluster", () => {
      const clusterTelemetry: SybilClusterTelemetry = {
        clusterId: "CLUSTER-SYBIL-8842",
        affiliateAddress: FLAGGED_AFFILIATE,
        clusterSize: 18,
        sharedIpHash: "ip_cluster_cloud_node_77",
        riskLevel: "critical",
        detectedAt: new Date().toISOString(),
        associatedAccounts: [FLAGGED_AFFILIATE],
      };

      // Record backend telemetry event
      recordSybilTelemetry(clusterTelemetry);

      expect(isAffiliateSybilRestricted(FLAGGED_AFFILIATE)).toBe(true);
      expect(isAffiliateSybilRestricted(CLEAN_AFFILIATE)).toBe(false);

      // Render banner for the flagged affiliate
      render(React.createElement(RestrictedModeBanner, { affiliateAddress: FLAGGED_AFFILIATE }));

      const banner = screen.getByTestId("banner-restricted-mode");
      expect(banner).toBeDefined();
      expect(screen.getByText("Restricted Mode: Sybil Cluster Activity Detected")).toBeDefined();
      expect(screen.getByText(/Cluster ID: CLUSTER-SYBIL-8842/)).toBeDefined();
      expect(screen.getByText(/Cluster Size: 18 accounts/)).toBeDefined();
    });

    it("does not render restricted mode banner for clean, unflagged affiliates", () => {
      render(React.createElement(RestrictedModeBanner, { affiliateAddress: CLEAN_AFFILIATE }));
      expect(screen.queryByTestId("banner-restricted-mode")).toBeNull();
    });
  });

  describe("2. Disabling High-Risk Actions (Instant Payout Claims)", () => {
    it("disables instant batch claim and single claim buttons while in restricted mode", async () => {
      // Flag the active affiliate in Sybil restricted mode
      recordSybilTelemetry({
        clusterId: "CLUSTER-SYBIL-9001",
        affiliateAddress: FLAGGED_AFFILIATE,
        clusterSize: 12,
        sharedIpHash: "ip_hash_suspicious_subnet",
        riskLevel: "high",
        detectedAt: new Date().toISOString(),
        associatedAccounts: [FLAGGED_AFFILIATE],
      });

      await act(async () => {
        render(
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(ClaimPayouts),
          ),
        );
      });

      // The restricted mode banner must be displayed
      expect(screen.getByTestId("banner-restricted-mode")).toBeDefined();

      // High-risk batch claim button must be disabled
      const batchClaimBtn = screen.getByTestId("btn-batch-claim");
      expect(batchClaimBtn).toBeDefined();
      expect((batchClaimBtn as HTMLButtonElement).disabled).toBe(true);
      expect(batchClaimBtn.textContent).toContain("Payouts Restricted");

      // Clicking batch claim button must not trigger on-chain transaction
      fireEvent.click(batchClaimBtn);
      expect(mockWeb3State.batchClaimPayoutsOnChain).not.toHaveBeenCalled();
    });

    it("enables payout claim actions when affiliate is clean and unrestricted", async () => {
      mockWeb3State.userAddress = CLEAN_AFFILIATE;

      await act(async () => {
        render(
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(ClaimPayouts),
          ),
        );
      });

      // Sybil banner should not be present
      expect(screen.queryByTestId("banner-restricted-mode")).toBeNull();

      // Batch claim button must not be locked into Sybil restriction
      const batchClaimBtn = screen.getByTestId("btn-batch-claim");
      expect(batchClaimBtn.textContent).not.toContain("Payouts Restricted (Sybil Mode)");
    });
  });

  describe("3. Prominent Dispute Submission Link", () => {
    it("prominently displays dispute submission link with ticket reference", () => {
      const onDisputeClick = vi.fn();

      render(
        React.createElement(RestrictedModeBanner, {
          isRestricted: true,
          clusterDetails: {
            clusterId: "CLUSTER-SYBIL-5541",
            affiliateAddress: FLAGGED_AFFILIATE,
            clusterSize: 6,
            sharedIpHash: "hash_vpn_exit_44",
            riskLevel: "high",
            detectedAt: new Date().toISOString(),
            associatedAccounts: [],
            disputeId: "DISPUTE-SYBIL-TICKET-7788",
          },
          onDisputeClick,
        }),
      );

      const disputeLink = screen.getByTestId("link-submit-dispute");
      expect(disputeLink).toBeDefined();
      expect(disputeLink.textContent).toContain("Submit Dispute");
      expect(disputeLink.getAttribute("href")).toContain("DISPUTE-SYBIL-TICKET-7788");

      fireEvent.click(disputeLink);
      expect(onDisputeClick).toHaveBeenCalledTimes(1);
    });
  });
});
