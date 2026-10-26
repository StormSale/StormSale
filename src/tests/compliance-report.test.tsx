// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../config/contracts", () => ({
  CONTRACT_ADDRESSES: {
    CAMPAIGN_ESCROW: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    NATIVE_XLM_SAC: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
  STELLAR_NETWORK: {
    network: "TESTNET",
    passphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    nativeCurrency: { name: "Lumen", symbol: "XLM", decimals: 7 },
  },
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
  STELLAR_NETWORKS: {
    TESTNET: {
      name: "Testnet",
      passphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
      horizonUrl: "https://horizon-testnet.stellar.org",
    },
    PUBLIC: {
      name: "Public (Mainnet)",
      passphrase: "Public Global Stellar Network ; September 2015",
      rpcUrl: "https://soroban-rpc.mainnet.stellar.org",
      horizonUrl: "https://horizon.stellar.org",
    },
  },
  ISSUERS: {
    TESTNET: { USDC: "GBBD...", EURC: "GB3Q..." },
    PUBLIC: { USDC: "GA5Z...", EURC: "GDHU..." },
  },
  NETWORK_ESCROW_ASSETS: {
    TESTNET: { USDC: { contractAddress: "CUSDC", issuer: "GBBD..." } },
    PUBLIC: { USDC: { contractAddress: "CUSDCPUB", issuer: "GA5Z..." } },
  },
  getSupportedEscrowAssets: vi.fn(),
}));

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ComplianceReport } from "../components/auditor/ComplianceReport";
import * as Web3Hooks from "../hooks/useWeb3";
import * as NotificationContext from "../context/NotificationContext";
import * as ComplianceNistUtils from "../utils/complianceNist";
import * as ComplianceExportLib from "../lib/complianceExport";

describe("ComplianceReport Component", () => {
  const mockShowNotification = vi.fn();
  let mockUserAddress: string | null = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5";
  let mockNetwork = "TESTNET";

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserAddress = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5";
    mockNetwork = "TESTNET";

    vi.spyOn(Web3Hooks, "useWeb3").mockImplementation(() => ({
      userAddress: mockUserAddress,
      network: mockNetwork,
      isConnected: Boolean(mockUserAddress),
      userRole: "AUDITOR",
      balance: "100",
      connectWallet: vi.fn(),
      disconnectWallet: vi.fn(),
      openWalletModal: vi.fn(),
      updateUserRole: vi.fn(),
    } as any));

    vi.spyOn(NotificationContext, "useNotification").mockImplementation(() => ({
      showNotification: mockShowNotification,
      notifications: [],
      dismissNotification: vi.fn(),
    } as any));

    vi.spyOn(ComplianceNistUtils, "fetchLiveNistControls").mockResolvedValue({
      controls: [],
      telemetry: {
        isOnline: true,
        latestLedger: 123456,
        recentTransactions: ["a".repeat(64)],
        contractVerified: true,
      },
    });

    vi.spyOn(ComplianceNistUtils, "exportFullCompliancePack").mockResolvedValue(undefined as any);
    vi.spyOn(ComplianceExportLib, "printOrSavePDF").mockImplementation(() => {});
    vi.spyOn(ComplianceExportLib, "downloadFile").mockImplementation(() => {});

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders with Frameworks Overview by default and switches to NIST SP 800-53 Scorecard", () => {
    render(<ComplianceReport />);
    expect(screen.getByRole("tab", { name: /NIST SP 800-53 Scorecard/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Frameworks Overview/ })).toBeTruthy();
    expect(screen.getByText("Compliance Report & Export Suite")).toBeTruthy();

    // Switch to NIST scorecard
    const nistTab = screen.getByRole("tab", { name: /NIST SP 800-53 Scorecard/ });
    fireEvent.click(nistTab);
    expect(screen.getByText("Security Control Compliance Scorecard")).toBeTruthy();
  });

  it("switches to Frameworks Overview tab and displays summary KPIs", () => {
    render(<ComplianceReport defaultTab="nist" />);
    const overviewTab = screen.getByRole("tab", { name: /Frameworks Overview/ });
    fireEvent.click(overviewTab);

    expect(screen.getByText("Compliance Report & Export Suite")).toBeTruthy();
    expect(screen.getByText(/Regulatory Standards Assessment/)).toBeTruthy();
    expect(screen.getByText(/Standards Compliant/)).toBeTruthy();
    expect(screen.getByText("Require Review")).toBeTruthy();

    // Switch back to NIST scorecard
    const nistTab = screen.getByRole("tab", { name: /NIST SP 800-53 Scorecard/ });
    fireEvent.click(nistTab);
    expect(screen.getByText("Security Control Compliance Scorecard")).toBeTruthy();
  });

  it("handles Quick Export in Frameworks Overview header", async () => {
    render(<ComplianceReport />);
    fireEvent.click(screen.getByRole("tab", { name: /Frameworks Overview/ }));

    const exportBtn = screen.getByRole("button", { name: /Export Full NIST Pack/ });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(ComplianceNistUtils.fetchLiveNistControls).toHaveBeenCalledWith("TESTNET");
      expect(ComplianceNistUtils.exportFullCompliancePack).toHaveBeenCalledWith(
        mockUserAddress,
        expect.any(Array),
        "TESTNET",
      );
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "Compliance Pack Exported",
        }),
      );
    });
  });

  it("handles Quick Export failure in Frameworks Overview", async () => {
    vi.spyOn(ComplianceNistUtils, "exportFullCompliancePack").mockRejectedValueOnce(
      new Error("Packaging Error"),
    );

    render(<ComplianceReport />);
    fireEvent.click(screen.getByRole("tab", { name: /Frameworks Overview/ }));

    const exportBtn = screen.getByRole("button", { name: /Export Full NIST Pack/ });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Export Failed",
          message: "Packaging Error",
        }),
      );
    });
  });

  it("toggles Date-Range Batch Export drawer and updates boundaries", () => {
    render(<ComplianceReport />);
    fireEvent.click(screen.getByRole("tab", { name: /Frameworks Overview/ }));

    const toggleDrawerBtn = screen.getByRole("button", { name: /Date-Range Batch Export/ });
    fireEvent.click(toggleDrawerBtn);

    expect(screen.getByText("Regulatory Audit Export Controls")).toBeTruthy();

    // Update start date
    const startDateInput = screen.getByLabelText("Start Date:");
    fireEvent.change(startDateInput, { target: { value: "2026-05-10" } });
    expect((startDateInput as HTMLInputElement).value).toBe("2026-05-10");

    // Update end date
    const endDateInput = screen.getByLabelText("End Date:");
    fireEvent.change(endDateInput, { target: { value: "2026-05-25" } });
    expect((endDateInput as HTMLInputElement).value).toBe("2026-05-25");

    // Change status filter
    const statusSelect = screen.getByLabelText("Standards Filter:");
    fireEvent.change(statusSelect, { target: { value: "Compliant" } });
    expect((statusSelect as HTMLSelectElement).value).toBe("Compliant");

    fireEvent.change(statusSelect, { target: { value: "Review Needed" } });
    expect((statusSelect as HTMLSelectElement).value).toBe("Review Needed");

    fireEvent.change(statusSelect, { target: { value: "ALL" } });
    expect((statusSelect as HTMLSelectElement).value).toBe("ALL");
  });

  it("applies quick presets in batch export drawer", () => {
    render(<ComplianceReport />);
    fireEvent.click(screen.getByRole("tab", { name: /Frameworks Overview/ }));
    fireEvent.click(screen.getByRole("button", { name: /Date-Range Batch Export/ }));

    const startDateInput = screen.getByLabelText("Start Date:") as HTMLInputElement;
    const endDateInput = screen.getByLabelText("End Date:") as HTMLInputElement;

    // Preset 7D
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    expect(startDateInput.value).toBe("2026-05-09");
    expect(endDateInput.value).toBe("2026-05-16");

    // Preset 30D
    fireEvent.click(screen.getByRole("button", { name: "30D" }));
    expect(startDateInput.value).toBe("2026-04-16");
    expect(endDateInput.value).toBe("2026-05-16");

    // Preset May '26
    fireEvent.click(screen.getByRole("button", { name: "May '26" }));
    expect(startDateInput.value).toBe("2026-05-01");
    expect(endDateInput.value).toBe("2026-05-31");

    // Preset All
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(startDateInput.value).toBe("2026-01-01");
    expect(endDateInput.value).toBe("2026-12-31");
  });

  it("exports CSV from header and drawer, and dismisses export banner", () => {
    render(<ComplianceReport />);
    fireEvent.click(screen.getByRole("tab", { name: /Frameworks Overview/ }));

    const exportCsvHeader = screen.getByRole("button", { name: /Export CSV/ });
    fireEvent.click(exportCsvHeader);

    expect(ComplianceExportLib.downloadFile).toHaveBeenCalled();
    expect(screen.getByText(/Successfully exported signed report at/)).toBeTruthy();

    // Dismiss banner
    const dismissBtn = screen.getByRole("button", { name: /Dismiss export notice/i });
    fireEvent.click(dismissBtn);
    expect(screen.queryByText(/Successfully exported signed report at/)).toBeNull();

    // Export CSV from drawer
    fireEvent.click(screen.getByRole("button", { name: /Date-Range Batch Export/ }));
    const downloadCsvDrawer = screen.getByRole("button", { name: "Download CSV" });
    fireEvent.click(downloadCsvDrawer);
    expect(ComplianceExportLib.downloadFile).toHaveBeenCalledTimes(2);
  });

  it("exports Signed PDF from header and drawer", () => {
    render(<ComplianceReport />);
    fireEvent.click(screen.getByRole("tab", { name: /Frameworks Overview/ }));

    const exportPdfHeader = screen.getByRole("button", { name: /Export Signed PDF/ });
    fireEvent.click(exportPdfHeader);

    expect(ComplianceExportLib.printOrSavePDF).toHaveBeenCalled();
    expect(screen.getByText(/Successfully exported signed report at/)).toBeTruthy();

    // Export PDF from drawer
    fireEvent.click(screen.getByRole("button", { name: /Date-Range Batch Export/ }));
    const downloadPdfDrawer = screen.getByRole("button", { name: "Download Signed PDF" });
    fireEvent.click(downloadPdfDrawer);
    expect(ComplianceExportLib.printOrSavePDF).toHaveBeenCalledTimes(2);
  });

  it("falls back to unattributed auditor when userAddress is null", async () => {
    mockUserAddress = null;
    render(<ComplianceReport />);
    fireEvent.click(screen.getByRole("tab", { name: /Frameworks Overview/ }));

    const exportBtn = screen.getByRole("button", { name: /Export Full NIST Pack/ });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(ComplianceNistUtils.exportFullCompliancePack).toHaveBeenCalledWith(
        "Unattributed (Wallet Not Connected)",
        expect.any(Array),
        "TESTNET",
      );
    });
  });
});
