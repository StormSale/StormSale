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
import { NistScorecard } from "../components/auditor/NistScorecard";
import * as Web3Hooks from "../hooks/useWeb3";
import * as NotificationContext from "../context/NotificationContext";
import * as ComplianceNistUtils from "../utils/complianceNist";
import type { NistControl } from "../types/compliance";

describe("NistScorecard Component", () => {
  const mockShowNotification = vi.fn();
  let mockUserAddress: string | null = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5";
  let mockNetwork = "TESTNET";

  const sampleControls: NistControl[] = [
    {
      id: "AC-3",
      family: "AC",
      familyName: "Access Control",
      title: "Access Enforcement",
      nistDescription: "Enforce approved authorizations for logical access to information.",
      platformImplementation: "Role-based verification and Soroban auth proofs.",
      status: "PASS",
      verificationMethod: "Automated On-Chain Inspection",
      lastEvaluated: "2026-05-16",
      metrics: [
        {
          name: "Contract Access Verification",
          value: "5 Confirmed Txs",
          threshold: ">= 1",
          status: "PASS",
          description: "Verifiable contract-scoped authorization transactions.",
        },
      ],
      evidenceLinks: [
        {
          label: "Soroban Auth Transaction",
          identifier: "a".repeat(64),
          url: "https://stellar.expert/explorer/testnet/tx/" + "a".repeat(64),
          type: "transaction",
          description: "Stellar auth event",
        },
      ],
    },
    {
      id: "AU-3",
      family: "AU",
      familyName: "Audit and Accountability",
      title: "Content of Audit Records",
      nistDescription: "Ensure that audit records contain essential event information.",
      platformImplementation: "Immutable ledger events and transaction records.",
      status: "PASS",
      verificationMethod: "Automated Ledger Query",
      lastEvaluated: "2026-05-16",
      metrics: [
        {
          name: "Audit Field Capture",
          value: "8 of 8 Fields",
          threshold: "8/8",
          status: "PASS",
          description: "All standard audit fields present.",
        },
      ],
      evidenceLinks: [],
    },
    {
      id: "SC-8",
      family: "SC",
      familyName: "System and Communications Protection",
      title: "Transmission Confidentiality and Integrity",
      nistDescription: "Protect the confidentiality and integrity of transmitted information.",
      platformImplementation: "AES-256-GCM encrypted payloads.",
      status: "REVIEW",
      verificationMethod: "Cryptographic Payload Scan",
      lastEvaluated: "2026-05-16",
      metrics: [
        {
          name: "Encrypted Records",
          value: "0 Recent Payloads",
          threshold: ">= 1",
          status: "WARN",
          description: "Encrypted ciphertext payload records on target ledger.",
        },
      ],
      evidenceLinks: [],
    },
  ];

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
      controls: sampleControls,
      telemetry: {
        isOnline: true,
        latestLedger: 123456,
        recentTransactions: ["a".repeat(64)],
        contractVerified: true,
      },
    });

    vi.spyOn(ComplianceNistUtils, "exportFullCompliancePack").mockResolvedValue(undefined as any);
    vi.spyOn(ComplianceNistUtils, "generateCompliancePackJson").mockResolvedValue({
      reportId: "EVAL-TEST-1234",
      framework: "NIST SP 800-53 Rev. 5",
      auditorAddress: mockUserAddress || "Unattributed (Wallet Not Connected)",
      generatedAt: new Date().toISOString(),
      network: "TESTNET",
      controls: sampleControls,
      summary: {
        totalControls: 3,
        passedControls: 2,
        reviewControls: 1,
        failedControls: 0,
        complianceScorePercent: 67,
      },
    } as any);
    vi.spyOn(ComplianceNistUtils, "exportCompliancePdf").mockImplementation(() => {});
    vi.spyOn(ComplianceNistUtils, "exportCompliancePackJson").mockImplementation(() => {});

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

  it("renders scorecard with initial controls and updates after mount fetch", async () => {
    render(<NistScorecard />);
    expect(screen.getByText("Security Control Compliance Scorecard")).toBeTruthy();
    expect(screen.getByText(/NIST SP 800-53 Rev. 5/)).toBeTruthy();

    await waitFor(() => {
      expect(ComplianceNistUtils.fetchLiveNistControls).toHaveBeenCalledWith("TESTNET");
    });

    expect(screen.getByText("NIST AC-3")).toBeTruthy();
    expect(screen.getByText("NIST AU-3")).toBeTruthy();
    expect(screen.getByText("NIST SC-8")).toBeTruthy();
  });

  it("handles mount fetch failure by falling back to offline standard controls", async () => {
    vi.spyOn(ComplianceNistUtils, "fetchLiveNistControls").mockRejectedValueOnce(
      new Error("RPC Offline"),
    );

    render(<NistScorecard />);

    await waitFor(() => {
      expect(ComplianceNistUtils.fetchLiveNistControls).toHaveBeenCalled();
    });

    // Scorecard still renders standard controls fallback
    expect(screen.getByText("Security Control Compliance Scorecard")).toBeTruthy();
  });

  it("filters controls by family tabs and resets to all", async () => {
    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    // Filter AC
    const acTab = screen.getByRole("tab", { name: /Access Control \(AC\)/ });
    fireEvent.click(acTab);
    expect(screen.getByText("NIST AC-3")).toBeTruthy();
    expect(screen.queryByText("NIST AU-3")).toBeNull();
    expect(screen.queryByText("NIST SC-8")).toBeNull();

    // Filter AU
    const auTab = screen.getByRole("tab", { name: /Audit Trail \(AU\)/ });
    fireEvent.click(auTab);
    expect(screen.queryByText("NIST AC-3")).toBeNull();
    expect(screen.getByText("NIST AU-3")).toBeTruthy();
    expect(screen.queryByText("NIST SC-8")).toBeNull();

    // Filter SC
    const scTab = screen.getByRole("tab", { name: /System Protection \(SC\)/ });
    fireEvent.click(scTab);
    expect(screen.queryByText("NIST AC-3")).toBeNull();
    expect(screen.queryByText("NIST AU-3")).toBeNull();
    expect(screen.getByText("NIST SC-8")).toBeTruthy();

    // Filter All
    const allTab = screen.getByRole("tab", { name: /All Families/ });
    fireEvent.click(allTab);
    expect(screen.getByText("NIST AC-3")).toBeTruthy();
    expect(screen.getByText("NIST AU-3")).toBeTruthy();
    expect(screen.getByText("NIST SC-8")).toBeTruthy();
  });

  it("filters controls via search input query", async () => {
    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const searchInput = screen.getByPlaceholderText("Search controls...");
    fireEvent.change(searchInput, { target: { value: "Transmission" } });

    expect(screen.queryByText("NIST AC-3")).toBeNull();
    expect(screen.queryByText("NIST AU-3")).toBeNull();
    expect(screen.getByText("NIST SC-8")).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "non-existent-query" } });
    expect(screen.queryByText("NIST SC-8")).toBeNull();

    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("NIST AC-3")).toBeTruthy();
  });

  it("handles Re-Verify Live button click with successful telemetry and notification", async () => {
    render(<NistScorecard />);
    const reVerifyBtn = await screen.findByRole("button", { name: /Re-Verify Live/ });
    fireEvent.click(reVerifyBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "On-Chain Audit Completed",
        }),
      );
    });
  });

  it("handles Re-Verify Live when endpoint is offline", async () => {
    render(<NistScorecard />);
    const reVerifyBtn = await screen.findByRole("button", { name: /Re-Verify Live/ });

    vi.spyOn(ComplianceNistUtils, "fetchLiveNistControls").mockResolvedValueOnce({
      controls: sampleControls,
      telemetry: {
        isOnline: false,
      },
    });

    fireEvent.click(reVerifyBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning",
          title: "Audit Completed with Warnings",
        }),
      );
    });
  });

  it("handles Re-Verify Live when no transactions are found in retention window", async () => {
    render(<NistScorecard />);
    const reVerifyBtn = await screen.findByRole("button", { name: /Re-Verify Live/ });

    vi.spyOn(ComplianceNistUtils, "fetchLiveNistControls").mockResolvedValueOnce({
      controls: sampleControls,
      telemetry: {
        isOnline: true,
        latestLedger: 200000,
        recentTransactions: [],
      },
    });

    fireEvent.click(reVerifyBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning",
          title: "Audit Completed - Review Required",
        }),
      );
    });
  });

  it("handles Re-Verify Live when audit throws an error", async () => {
    render(<NistScorecard />);
    const reVerifyBtn = await screen.findByRole("button", { name: /Re-Verify Live/ });

    vi.spyOn(ComplianceNistUtils, "fetchLiveNistControls").mockRejectedValueOnce(
      new Error("Soroban RPC timeout"),
    );

    fireEvent.click(reVerifyBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Audit Verification Failed",
          message: "Soroban RPC timeout",
        }),
      );
    });
  });

  it("discards stale audit responses when multiple requests overlap", async () => {
    let resolveFirst: ((val: any) => void) | null = null;
    let resolveSecond: ((val: any) => void) | null = null;

    const { rerender } = render(<NistScorecard />);
    const reVerifyBtn = await screen.findByRole("button", { name: /Re-Verify Live/ });

    vi.spyOn(ComplianceNistUtils, "fetchLiveNistControls")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    fireEvent.click(reVerifyBtn); // triggers request 1

    // Switch network to PUBLIC to trigger request 2 in useEffect
    mockNetwork = "PUBLIC";
    rerender(<NistScorecard />);

    // Resolve second request first
    const freshControlsSecond = [{ ...sampleControls[0], title: "Public Network Title" }];
    resolveSecond!({
      controls: freshControlsSecond,
      telemetry: { isOnline: true, recentTransactions: ["b".repeat(64)] },
    });

    await waitFor(() => {
      expect(screen.getByText("Public Network Title")).toBeTruthy();
    });

    // Now resolve first request late (should be discarded)
    const freshControlsFirst = [{ ...sampleControls[0], title: "Stale Testnet Title" }];
    resolveFirst!({
      controls: freshControlsFirst,
      telemetry: { isOnline: true, recentTransactions: ["a".repeat(64)] },
    });

    // Expect the state still to have "Public Network Title", not overwritten by stale first request
    expect(screen.queryByText("Stale Testnet Title")).toBeNull();
    expect(screen.getByText("Public Network Title")).toBeTruthy();
  });

  it("exports PDF scorecard report", async () => {
    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const pdfBtn = screen.getByRole("button", { name: "PDF" });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(ComplianceNistUtils.generateCompliancePackJson).toHaveBeenCalledWith(
        mockUserAddress,
        expect.any(Array),
        "TESTNET",
      );
      expect(ComplianceNistUtils.exportCompliancePdf).toHaveBeenCalled();
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "PDF Report Exported",
        }),
      );
    });
  });

  it("handles PDF export error", async () => {
    vi.spyOn(ComplianceNistUtils, "exportCompliancePdf").mockImplementationOnce(() => {
      throw new Error("PDF Canvas render failed");
    });

    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const pdfBtn = screen.getByRole("button", { name: "PDF" });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "PDF Export Failed",
          message: "PDF Canvas render failed",
        }),
      );
    });
  });

  it("exports JSON compliance pack", async () => {
    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const jsonBtn = screen.getByRole("button", { name: "JSON" });
    fireEvent.click(jsonBtn);

    await waitFor(() => {
      expect(ComplianceNistUtils.generateCompliancePackJson).toHaveBeenCalledWith(
        mockUserAddress,
        expect.any(Array),
        "TESTNET",
      );
      expect(ComplianceNistUtils.exportCompliancePackJson).toHaveBeenCalled();
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "JSON Pack Exported",
        }),
      );
    });
  });

  it("handles JSON export error", async () => {
    vi.spyOn(ComplianceNistUtils, "exportCompliancePackJson").mockImplementationOnce(() => {
      throw new Error("Disk write blocked");
    });

    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const jsonBtn = screen.getByRole("button", { name: "JSON" });
    fireEvent.click(jsonBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "JSON Export Failed",
          message: "Disk write blocked",
        }),
      );
    });
  });

  it("exports 1-Click full compliance pack (PDF & JSON) and footer button", async () => {
    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const fullPackBtn = screen.getByRole("button", { name: /1-Click Compliance Pack/ });
    fireEvent.click(fullPackBtn);

    await waitFor(() => {
      expect(ComplianceNistUtils.exportFullCompliancePack).toHaveBeenCalledWith(
        mockUserAddress,
        expect.any(Array),
        "TESTNET",
      );
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          title: "1-Click Export Complete",
        }),
      );
    });

    const footerBtn = screen.getByRole("button", { name: /Download Audit Pack/ });
    fireEvent.click(footerBtn);

    await waitFor(() => {
      expect(ComplianceNistUtils.exportFullCompliancePack).toHaveBeenCalledTimes(2);
    });
  });

  it("handles 1-Click export failure", async () => {
    vi.spyOn(ComplianceNistUtils, "exportFullCompliancePack").mockRejectedValueOnce(
      new Error("Archival pack compression error"),
    );

    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const fullPackBtn = screen.getByRole("button", { name: /1-Click Compliance Pack/ });
    fireEvent.click(fullPackBtn);

    await waitFor(() => {
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Export Failed",
          message: "Archival pack compression error",
        }),
      );
    });
  });

  it("falls back to unattributed auditor when userAddress is null", async () => {
    mockUserAddress = null;
    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const fullPackBtn = screen.getByRole("button", { name: /1-Click Compliance Pack/ });
    fireEvent.click(fullPackBtn);

    await waitFor(() => {
      expect(ComplianceNistUtils.exportFullCompliancePack).toHaveBeenCalledWith(
        "Unattributed (Wallet Not Connected)",
        expect.any(Array),
        "TESTNET",
      );
    });
  });

  it("copies evaluation ID seal to clipboard", async () => {
    render(<NistScorecard />);
    await waitFor(() => expect(screen.getByText("NIST AC-3")).toBeTruthy());

    const copyBtn = screen.getByTitle("Click to copy evaluation ID");
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          title: "Evaluation ID Copied",
        }),
      );
    });
  });
});
