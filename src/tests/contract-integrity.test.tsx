// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Header } from "../components/shared/Header";
import { ContractIntegrityModal } from "../components/auditor/ContractIntegrityModal";
import {
  checkContractIntegrity,
  isValidContractAddress,
  getExpectedContractAddress,
  getActiveContractAddress,
  setContractAddressOverride,
  subscribeToContractIntegrity,
  VERIFIED_CONTRACT_REGISTRY,
} from "../lib/contractIntegrity";

// Mock Web3 hook
vi.mock("../hooks/useWeb3", () => ({
  useWeb3: vi.fn().mockReturnValue({
    userAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    openWalletModal: vi.fn(),
    disconnectWallet: vi.fn(),
    isConnected: true,
    xlmBalance: "500.00",
    isMultiSigAccount: false,
    multiSigInfo: null,
    openMultiSigModal: vi.fn(),
    activeRpcEndpoint: {
      id: "primary-rpc",
      name: "Stellar SDF Testnet",
      url: "https://soroban-testnet.stellar.org",
      status: "healthy",
      latencyMs: 45,
      type: "primary",
    },
    openRpcModal: vi.fn(),
    network: "TESTNET",
    connectorType: "freighter",
  }),
}));

// Mock Telegram hook
vi.mock("../hooks/useTelegram", () => ({
  useTelegram: vi.fn().mockReturnValue({
    isTelegram: false,
    user: null,
    platform: "desktop",
  }),
}));

// Mock network verification
vi.mock("../lib/networkVerification", () => ({
  verifyFreighterNetwork: vi.fn().mockResolvedValue({
    network: "TESTNET",
    isStellarNetwork: true,
  }),
}));

describe("Contract Integrity Verification Suite (#65)", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    setContractAddressOverride(null);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    setContractAddressOverride(null);
    Object.assign(navigator, { clipboard: originalClipboard });
    vi.clearAllMocks();
  });

  /* =========================================================================
     1. LIB UNIT TESTS: contractIntegrity.ts
     ========================================================================= */

  describe("Contract Integrity Core Engine", () => {
    it("validates valid and invalid Soroban contract addresses correctly", () => {
      // Valid 56-char C... address
      const validAddress = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      expect(isValidContractAddress(validAddress)).toBe(true);

      // Invalid prefix (G instead of C)
      expect(isValidContractAddress("GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777")).toBe(
        false,
      );

      // Invalid length
      expect(isValidContractAddress("CAAA")).toBe(false);
      expect(isValidContractAddress("")).toBe(false);
      expect(isValidContractAddress(null as any)).toBe(false);
      expect(isValidContractAddress(undefined as any)).toBe(false);
    });

    it("resolves expected contract addresses for TESTNET and PUBLIC", () => {
      expect(getExpectedContractAddress("TESTNET")).toBe(VERIFIED_CONTRACT_REGISTRY.TESTNET);
      expect(getExpectedContractAddress("PUBLIC")).toBe(VERIFIED_CONTRACT_REGISTRY.PUBLIC);
      expect(getExpectedContractAddress("unknown-net")).toBeDefined();
    });

    it("verifies contract integrity when address matches authoritative registry", () => {
      const res = checkContractIntegrity(VERIFIED_CONTRACT_REGISTRY.TESTNET, "TESTNET");
      expect(res.status).toBe("verified");
      expect(res.isVerified).toBe(true);
      expect(res.configuredAddress).toBe(VERIFIED_CONTRACT_REGISTRY.TESTNET);
      expect(res.expectedAddress).toBe(VERIFIED_CONTRACT_REGISTRY.TESTNET);
    });

    it("detects address mismatch when configured address differs from registry", () => {
      const rogueAddress = "CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const res = checkContractIntegrity(rogueAddress, "TESTNET");
      expect(res.status).toBe("mismatch");
      expect(res.isVerified).toBe(false);
      expect(res.configuredAddress).toBe(rogueAddress);
      expect(res.reason).toContain("Contract address mismatch");
    });

    it("detects invalid format for malformed addresses", () => {
      const res = checkContractIntegrity("INVALID_ADDR", "TESTNET");
      expect(res.status).toBe("invalid_format");
      expect(res.isVerified).toBe(false);
      expect(res.reason).toContain("does not conform to valid Soroban contract identifier format");
    });

    it("supports runtime overrides and subscriber notifications", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToContractIntegrity(listener);

      const rogueAddress = "CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      setContractAddressOverride(rogueAddress);

      expect(getActiveContractAddress()).toBe(rogueAddress);
      expect(listener).toHaveBeenCalled();

      setContractAddressOverride(null);
      expect(getActiveContractAddress()).not.toBe(rogueAddress);

      unsubscribe();
    });
  });

  /* =========================================================================
     2. MODAL UNIT TESTS: ContractIntegrityModal.tsx
     ========================================================================= */

  describe("ContractIntegrityModal Component", () => {
    it("renders nothing when integrity prop is null", () => {
      const { container } = render(
        <ContractIntegrityModal isOpen={true} onClose={vi.fn()} integrity={null} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders verified status details and explorer link when verified", () => {
      const integrity = checkContractIntegrity(VERIFIED_CONTRACT_REGISTRY.TESTNET, "TESTNET");
      render(<ContractIntegrityModal isOpen={true} onClose={vi.fn()} integrity={integrity} />);

      expect(screen.getByText("Contract Integrity Verified")).toBeTruthy();
      expect(screen.getByTestId("contract-verified-banner")).toBeTruthy();
      expect(screen.getByText(VERIFIED_CONTRACT_REGISTRY.TESTNET)).toBeTruthy();
      expect(screen.getByText("Stellar Expert")).toBeTruthy();
    });

    it("renders security warning modal and reset button on address mismatch", () => {
      const rogueAddress = "CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const integrity = checkContractIntegrity(rogueAddress, "TESTNET");
      const onReset = vi.fn();
      const onClose = vi.fn();

      render(
        <ContractIntegrityModal
          isOpen={true}
          onClose={onClose}
          integrity={integrity}
          onReset={onReset}
        />,
      );

      expect(screen.getByText("Warning: Contract Address Mismatch")).toBeTruthy();
      expect(screen.getByTestId("contract-mismatch-warning")).toBeTruthy();
      expect(screen.getByText(rogueAddress)).toBeTruthy();
      expect(screen.getByText(integrity.expectedAddress)).toBeTruthy();

      const resetButton = screen.getByTestId("reset-contract-button");
      fireEvent.click(resetButton);
      expect(onReset).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("allows copying configured and expected addresses", async () => {
      const rogueAddress = "CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const integrity = checkContractIntegrity(rogueAddress, "TESTNET");

      render(
        <ContractIntegrityModal
          isOpen={true}
          onClose={vi.fn()}
          integrity={integrity}
          onReset={vi.fn()}
        />,
      );

      const copyButtons = screen.getAllByText("Copy");
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);

      await act(async () => {
        fireEvent.click(copyButtons[0]);
      });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(rogueAddress);
    });
  });

  /* =========================================================================
     3. HEADER INTEGRATION TESTS: Header.tsx
     ========================================================================= */

  describe("Header Contract Integrity Indicator Integration", () => {
    it("renders Verified indicator pill in Header under normal configuration", async () => {
      await act(async () => {
        render(<Header />);
      });

      const indicator = screen.getByTestId("contract-integrity-indicator");
      expect(indicator).toBeTruthy();
      expect(indicator.textContent).toContain("Verified");
    });

    it("opens verification modal when Verified indicator is clicked", async () => {
      await act(async () => {
        render(<Header />);
      });

      const indicator = screen.getByTestId("contract-integrity-indicator");
      await act(async () => {
        fireEvent.click(indicator);
      });

      expect(screen.getByTestId("contract-integrity-modal")).toBeTruthy();
      expect(screen.getByText("Contract Integrity Verified")).toBeTruthy();
    });

    it("switches to Mismatch indicator and displays warning modal on contract mismatch override", async () => {
      await act(async () => {
        render(<Header />);
      });

      const rogueAddress = "CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

      await act(async () => {
        setContractAddressOverride(rogueAddress);
      });

      const indicator = screen.getByTestId("contract-integrity-indicator");
      expect(indicator.textContent).toContain("Mismatch");
      expect(indicator.className).toContain("animate-pulse");

      // Warning modal is auto-opened
      expect(screen.getByTestId("contract-integrity-modal")).toBeTruthy();
      expect(screen.getByText("Warning: Contract Address Mismatch")).toBeTruthy();
    });

    it("restores Verified state when reset to verified address", async () => {
      await act(async () => {
        render(<Header />);
      });

      const rogueAddress = "CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

      await act(async () => {
        setContractAddressOverride(rogueAddress);
      });

      const resetButton = screen.getByTestId("reset-contract-button");
      await act(async () => {
        fireEvent.click(resetButton);
      });

      const indicator = screen.getByTestId("contract-integrity-indicator");
      expect(indicator.textContent).toContain("Verified");
    });

    it("renders mobile contract integrity indicator button", async () => {
      await act(async () => {
        render(<Header />);
      });

      const mobileIndicator = screen.getByTestId("mobile-contract-integrity-indicator");
      expect(mobileIndicator).toBeTruthy();

      await act(async () => {
        fireEvent.click(mobileIndicator);
      });

      expect(screen.getByTestId("contract-integrity-modal")).toBeTruthy();
    });
  });
});
