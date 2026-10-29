// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { StorageTTLHealthIndicator } from "../components/advertiser/StorageTTLHealthIndicator";
import { EscrowTopUpModal } from "../components/advertiser/EscrowTopUpModal";
import { ContractIntegrityModal } from "../components/shared/ContractIntegrityModal";
import { Header } from "../components/shared/Header";
import { AffiliatePerformanceCharts } from "../components/affiliate/AffiliatePerformanceCharts";
import type { StorageTTLInfo, SACSimulationFeedback } from "../lib/stellar";

const mockWeb3 = {
  isConnected: true,
  userAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  network: "TESTNET",
  connectorType: "mock",
  openRpcModal: vi.fn(),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getStorageTTL: vi.fn(),
  extendStorageTTL: vi.fn(),
  checkTopUpAllowance: vi.fn(),
  simulateApprove: vi.fn(),
  approveTokenAllowance: vi.fn(),
  topUpCampaignEscrow: vi.fn(),
};

const mockNotification = {
  showNotification: vi.fn(),
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3,
}));

vi.mock("../hooks/useTelegram", () => ({
  useTelegram: () => ({ isTelegram: false, user: null, platform: null }),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotification: () => mockNotification,
}));

describe("SAC Allowance, TTL & Affiliate Component Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("StorageTTLHealthIndicator Component", () => {
    const healthyTTL: StorageTTLInfo = {
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      liveUntilLedger: 1145230,
      currentLedger: 1045230,
      remainingLedgers: 100000,
      threshold: 50000,
      status: "healthy",
      estimatedHoursRemaining: 138.8,
    };

    const warningTTL: StorageTTLInfo = {
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      liveUntilLedger: 1087230,
      currentLedger: 1045230,
      remainingLedgers: 42000,
      threshold: 50000,
      status: "warning",
      estimatedHoursRemaining: 58.3,
    };

    const criticalTTL: StorageTTLInfo = {
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      liveUntilLedger: 1053230,
      currentLedger: 1045230,
      remainingLedgers: 8000,
      threshold: 50000,
      status: "critical",
      estimatedHoursRemaining: 11.1,
    };

    it("renders loading state when TTL info is unresolved", () => {
      mockWeb3.getStorageTTL.mockImplementationOnce(() => new Promise(() => {}));
      render(<StorageTTLHealthIndicator />);
      expect(screen.getByText(/Loading Soroban storage TTL/i)).toBeTruthy();
    });

    it("renders full command widget for healthy status", async () => {
      mockWeb3.getStorageTTL.mockResolvedValueOnce(healthyTTL);
      render(<StorageTTLHealthIndicator />);

      await waitFor(() => {
        expect(screen.getByText("Soroban Escrow State TTL")).toBeTruthy();
        expect(screen.getByText("Healthy State")).toBeTruthy();
      });
    });

    it("renders warning status with Extend button and triggers extension", async () => {
      mockWeb3.getStorageTTL.mockResolvedValue(warningTTL);
      mockWeb3.extendStorageTTL.mockResolvedValueOnce({
        txHash: "0x_extended_tx_hash",
        ttlInfo: healthyTTL,
      });

      const onExtendedMock = vi.fn();
      render(<StorageTTLHealthIndicator onExtended={onExtendedMock} />);

      await waitFor(() => {
        expect(screen.getByText(/Threshold Warning/i)).toBeTruthy();
      });

      const extendButton = screen.getByRole("button", { name: /Extend TTL/i });
      fireEvent.click(extendButton);

      await waitFor(() => {
        expect(mockWeb3.extendStorageTTL).toHaveBeenCalledWith(undefined, 100000);
        expect(onExtendedMock).toHaveBeenCalledWith(healthyTTL);
        expect(mockNotification.showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "success",
            title: "Storage TTL Extended Successfully!",
          }),
        );
      });
    });

    it("renders critical status card", async () => {
      mockWeb3.getStorageTTL.mockResolvedValueOnce(criticalTTL);
      render(<StorageTTLHealthIndicator />);

      await waitFor(() => {
        expect(screen.getByText("Critical TTL")).toBeTruthy();
      });
    });

    it("renders compact mode badges for healthy and warning states", async () => {
      // Healthy compact
      mockWeb3.getStorageTTL.mockResolvedValueOnce(healthyTTL);
      const { unmount } = render(<StorageTTLHealthIndicator compact={true} />);

      await waitFor(() => {
        expect(screen.getByText(/100,000 Ledgers/i)).toBeTruthy();
      });
      unmount();

      // Warning compact with quick extend
      mockWeb3.getStorageTTL.mockResolvedValueOnce(warningTTL);
      mockWeb3.extendStorageTTL.mockResolvedValueOnce({
        txHash: "0x_compact_tx",
        ttlInfo: healthyTTL,
      });

      render(<StorageTTLHealthIndicator compact={true} />);
      await waitFor(() => {
        expect(screen.getByText(/42,000 Ledgers/i)).toBeTruthy();
      });

      const quickExtend = screen.getByRole("button", { name: /Extend/i });
      fireEvent.click(quickExtend);

      await waitFor(() => {
        expect(mockWeb3.extendStorageTTL).toHaveBeenCalled();
      });
    });

    it("auto-extends TTL when autoExtend is enabled and remaining ledgers fall below threshold", async () => {
      mockWeb3.getStorageTTL.mockResolvedValue(warningTTL);
      mockWeb3.extendStorageTTL.mockResolvedValueOnce({
        txHash: "0x_auto_tx",
        ttlInfo: healthyTTL,
      });

      render(<StorageTTLHealthIndicator autoExtend={true} compact={false} />);

      await waitFor(() => {
        expect(mockWeb3.extendStorageTTL).toHaveBeenCalledWith(undefined, 100000);
      });
    });

    it("handles error during TTL extension gracefully", async () => {
      mockWeb3.getStorageTTL.mockResolvedValueOnce(warningTTL);
      mockWeb3.extendStorageTTL.mockRejectedValueOnce(new Error("RPC submission timeout"));

      render(<StorageTTLHealthIndicator />);
      await waitFor(() => {
        expect(screen.getByText(/Threshold Warning/i)).toBeTruthy();
      });

      const extendButton = screen.getByRole("button", { name: /Extend TTL/i });
      fireEvent.click(extendButton);

      await waitFor(() => {
        expect(mockNotification.showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "error",
            title: "TTL Extension Failed",
            message: "RPC submission timeout",
          }),
        );
      });
    });
  });

  describe("EscrowTopUpModal Component", () => {
    const insufficientAllowance = {
      isSufficient: false,
      hasSufficientAllowance: false,
      currentAllowance: "100",
      requiredAllowance: "500",
      spender: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      sacContractId: "CUSDC",
    };

    const sufficientAllowance = {
      isSufficient: true,
      hasSufficientAllowance: true,
      currentAllowance: "1000",
      requiredAllowance: "500",
      spender: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      sacContractId: "CUSDC",
    };

    const mockSimulation: SACSimulationFeedback = {
      success: true,
      minResourceFee: "0.0001 XLM",
      cpuInstructions: "100,000",
      memoryBytes: "1.2 KB",
      eventsCount: 1,
      spenderAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      tokenContractId: "CUSDC",
      amountAuthorized: "500 USDC",
      tokenSymbol: "USDC",
      liveUntilLedger: 1500000,
    };

    it("renders nothing when isOpen is false", () => {
      const { container } = render(
        <EscrowTopUpModal
          campaignId={1}
          campaignName="Summer Blast"
          isOpen={false}
          onClose={() => {}}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders modal when open and checks allowance", async () => {
      mockWeb3.checkTopUpAllowance.mockResolvedValue(insufficientAllowance);
      mockWeb3.simulateApprove.mockResolvedValue(mockSimulation);

      render(
        <EscrowTopUpModal
          campaignId={1}
          campaignName="Summer Blast"
          isOpen={true}
          onClose={() => {}}
        />,
      );

      expect(screen.getByText(/Top Up Campaign Escrow/i)).toBeTruthy();
      expect(screen.getByText(/Summer Blast/i)).toBeTruthy();

      await waitFor(() => {
        expect(mockWeb3.checkTopUpAllowance).toHaveBeenCalled();
      });
    });

    it("handles delegated allowance approval", async () => {
      mockWeb3.checkTopUpAllowance.mockResolvedValue(insufficientAllowance);
      mockWeb3.simulateApprove.mockResolvedValue(mockSimulation);
      mockWeb3.approveTokenAllowance.mockResolvedValue({
        success: true,
        txHash: "0x_approve_tx",
        simulationFeedback: mockSimulation,
      });

      render(
        <EscrowTopUpModal
          campaignId={1}
          campaignName="Summer Blast"
          isOpen={true}
          onClose={() => {}}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Authorize SAC Delegation/i }),
        ).toBeTruthy();
      });

      const approveBtn = screen.getByRole("button", { name: /Authorize SAC Delegation/i });
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(mockWeb3.approveTokenAllowance).toHaveBeenCalledWith(500, "USDC");
        expect(mockNotification.showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "success",
            title: "Allowance Approved!",
          }),
        );
      });
    });

    it("submits campaign escrow top-up when allowance is sufficient", async () => {
      mockWeb3.checkTopUpAllowance.mockResolvedValue(sufficientAllowance);
      mockWeb3.simulateApprove.mockResolvedValue(mockSimulation);
      mockWeb3.topUpCampaignEscrow.mockResolvedValue({ success: true, txHash: "0x_topup_tx" });

      const onCloseMock = vi.fn();
      const onSuccessMock = vi.fn();

      render(
        <EscrowTopUpModal
          campaignId={1}
          campaignName="Summer Blast"
          isOpen={true}
          onClose={onCloseMock}
          onSuccess={onSuccessMock}
        />,
      );

      await waitFor(() => {
        const topUpBtn = screen.getByRole("button", { name: /Confirm Escrow Top-Up/i });
        expect(topUpBtn.hasAttribute("disabled")).toBe(false);
      });

      const topUpBtn = screen.getByRole("button", { name: /Confirm Escrow Top-Up/i });
      fireEvent.click(topUpBtn);

      await waitFor(() => {
        expect(mockWeb3.topUpCampaignEscrow).toHaveBeenCalledWith(1, 500, "USDC");
        expect(onSuccessMock).toHaveBeenCalled();
        expect(onCloseMock).toHaveBeenCalled();
      });
    });

    it("switches token and calls top-up allowance check", async () => {
      mockWeb3.checkTopUpAllowance.mockResolvedValue(sufficientAllowance);
      mockWeb3.simulateApprove.mockResolvedValue(mockSimulation);

      render(
        <EscrowTopUpModal
          campaignId={1}
          campaignName="Summer Blast"
          isOpen={true}
          onClose={() => {}}
        />,
      );

      const eurcBtn = screen.getByRole("button", { name: /EURC/i });
      fireEvent.click(eurcBtn);

      await waitFor(() => {
        expect(mockWeb3.checkTopUpAllowance).toHaveBeenCalledWith(500, "EURC");
      });
    });
  });

  describe("ContractIntegrityModal Component", () => {
    it("renders nothing when closed", () => {
      const { container } = render(
        <ContractIntegrityModal isOpen={false} onClose={() => {}} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders verified status and handles copy and close actions", async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      const onCloseMock = vi.fn();
      render(<ContractIntegrityModal isOpen={true} onClose={onCloseMock} />);

      expect(screen.getByText(/Verified Protocol Deployment/i)).toBeTruthy();

      const copyBtn = screen.getByRole("button", { name: "Copy contract address" });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      });

      const closeBtn = screen.getByRole("button", { name: "Close dialog" });
      fireEvent.click(closeBtn);
      expect(onCloseMock).toHaveBeenCalled();
    });

    it("renders mismatch warning when overrideMismatch is true", () => {
      render(
        <ContractIntegrityModal
          isOpen={true}
          onClose={() => {}}
          overrideMismatch={true}
        />,
      );

      expect(screen.getByText(/Contract Address Mismatch/i)).toBeTruthy();
    });
  });

  describe("AffiliatePerformanceCharts Component", () => {
    it("renders performance trends, balance cards and switches timeframe", () => {
      render(<AffiliatePerformanceCharts />);

      expect(screen.getByText(/Affiliate Performance Trends/i)).toBeTruthy();
      expect(screen.getByText(/Available Balance/i)).toBeTruthy();
      expect(screen.getByText(/Pending Clearing/i)).toBeTruthy();
      expect(screen.getByText(/Lifetime Earnings/i)).toBeTruthy();

      // Click timeframe buttons
      const btn7D = screen.getByRole("button", { name: "7D" });
      const btn30D = screen.getByRole("button", { name: "30D" });
      const btn90D = screen.getByRole("button", { name: "90D" });
      const btn1Y = screen.getByRole("button", { name: "1Y" });

      fireEvent.click(btn30D);
      fireEvent.click(btn90D);
      fireEvent.click(btn1Y);
      fireEvent.click(btn7D);

      // Switch metric to conversions and back to earnings
      const conversionsBtn = screen.getByRole("button", { name: "Conversions" });
      fireEvent.click(conversionsBtn);

      const earningsBtn = screen.getByRole("button", { name: "Earnings ($)" });
      fireEvent.click(earningsBtn);

      // Inspect bars hover and keyboard interactions
      const bars = screen.getAllByRole("button", { name: /Mon:|Tue:|Wed:|Thu:|Fri:|Sat:|Sun:/i });
      if (bars.length > 0) {
        fireEvent.mouseEnter(bars[0]);
        fireEvent.mouseLeave(bars[0]);
        fireEvent.focus(bars[0]);
        fireEvent.blur(bars[0]);
        fireEvent.keyDown(bars[0], { key: "Enter" });
        fireEvent.keyDown(bars[0], { key: " " });
        fireEvent.keyDown(bars[0], { key: "Escape" });
      }

      expect(screen.getByText(/Historical Payout & Clearing Ledger/i)).toBeTruthy();
    });
  });

  describe("Header Component with Contract Integrity Integration", () => {
    it("opens and closes contract integrity modal from verified contract button", async () => {
      render(<Header />);
      const integrityBtn = screen.getByRole("button", {
        name: "Soroban Verified Contract - Click to inspect integrity",
      });
      expect(integrityBtn).toBeTruthy();
      fireEvent.click(integrityBtn);

      expect(await screen.findByText(/Verified Protocol Deployment/i)).toBeTruthy();

      const closeBtn = screen.getByRole("button", { name: "Close dialog" });
      fireEvent.click(closeBtn);
    });
  });
});
