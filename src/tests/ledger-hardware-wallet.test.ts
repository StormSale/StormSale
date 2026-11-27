// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Keypair,
  TransactionBuilder,
  Networks,
  Account,
  Operation,
  Asset,
} from "@stellar/stellar-sdk";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import {
  DEFAULT_STELLAR_BIP_PATH,
  formatBipPath,
  getBipPathForAccount,
  parseLedgerError,
  isWebHIDSupported,
  isWebUSBSupported,
  isHardwareTransportSupported,
  connectLedgerDevice,
  extractLedgerVerificationDetails,
  signLedgerTransaction,
} from "../lib/ledgerBridge";

// Hoisted mocks for ConnectWalletModal UI tests
const web3 = vi.hoisted(() => ({ current: {} as any }));
const walletConnect = vi.hoisted(() => ({ connect: vi.fn() }));
const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }));
const stellarMocks = vi.hoisted(() => ({ resolveRecipient: vi.fn() }));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3.current }));
vi.mock("../context/WalletConnectContext", () => ({
  useWalletConnect: () => walletConnect,
}));
vi.mock("qrcode", () => ({ default: qr }));
vi.mock("framer-motion", () => {
  const MotionComponent = (props: any) => {
    const { initial, animate, exit, transition, ...rest } = props;
    return React.createElement("div", rest);
  };
  return {
    motion: new Proxy({}, { get: () => MotionComponent }),
    AnimatePresence: ({ children }: any) => children,
  };
});
vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, resolveRecipient: stellarMocks.resolveRecipient };
});

// Mock @ledgerhq/hw-transport-webhid
vi.mock("@ledgerhq/hw-transport-webhid", () => ({
  default: {
    create: vi.fn(),
  },
}));

// Mock instance methods for StrApp
const mockStrApp = {
  getAppConfiguration: vi.fn(),
  getPublicKey: vi.fn(),
  signTransaction: vi.fn(),
};

vi.mock("@ledgerhq/hw-app-str", () => {
  return {
    default: class MockStrApp {
      getAppConfiguration() {
        return mockStrApp.getAppConfiguration();
      }
      getPublicKey(path: string, bool: boolean) {
        return mockStrApp.getPublicKey(path, bool);
      }
      signTransaction(path: string, buffer: Buffer) {
        return mockStrApp.signTransaction(path, buffer);
      }
    },
  };
});

import { ConnectWalletModal } from "../components/shared/ConnectWalletModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const MOCK_SOURCE_KEYPAIR = Keypair.random();
const MOCK_DEST_KEYPAIR = Keypair.random();

function buildSamplePaymentXdr(): string {
  const source = new Account(MOCK_SOURCE_KEYPAIR.publicKey(), "100");
  const builder = new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  });
  builder.addOperation(
    Operation.payment({
      destination: MOCK_DEST_KEYPAIR.publicKey(),
      asset: Asset.native(),
      amount: "10",
    }),
  );
  builder.setTimeout(300);
  const tx = builder.build();
  return tx.toXDR();
}

function buildSampleContractXdr(): string {
  const source = new Account(MOCK_SOURCE_KEYPAIR.publicKey(), "100");
  const builder = new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  });
  builder.addOperation(
    Operation.invokeContractFunction({
      contract: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      function: "deposit_escrow",
      args: [],
    }),
  );
  builder.setTimeout(300);
  const tx = builder.build();
  return tx.toXDR();
}

describe("Ledger Hardware Wallet WebUSB & WebHID Bridge Test Suite (#423)", () => {
  let container: HTMLDivElement;
  let root: Root;

  function buttonByText(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(text),
    );
    if (!button) throw new Error(`Missing button with text: ${text}`);
    return button;
  }

  async function click(element: HTMLElement) {
    await act(async () => {
      element.click();
    });
  }

  function setInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function renderModal() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ConnectWalletModal));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__MOCK_LEDGER__;

    qr.toDataURL.mockResolvedValue("data:image/png;base64,qr");
    walletConnect.connect.mockResolvedValue(undefined);
    stellarMocks.resolveRecipient.mockResolvedValue({
      status: "raw",
      address: MOCK_SOURCE_KEYPAIR.publicKey(),
    });

    web3.current = {
      isWalletModalOpen: true,
      closeWalletModal: vi.fn(),
      connectWallet: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  // =========================================================================
  // Criteria 1: Mock WebHID and WebUSB navigator interfaces
  // =========================================================================
  describe("1. Mock WebHID and WebUSB Navigator Interfaces", () => {
    it("detects WebHID support when navigator.hid is available with requestDevice", async () => {
      Object.defineProperty(navigator, "hid", {
        value: { requestDevice: vi.fn().mockResolvedValue([]) },
        configurable: true,
      });

      const supported = await isWebHIDSupported();
      expect(supported).toBe(true);
    });

    it("reports WebHID unsupported when navigator.hid is missing or incomplete", async () => {
      Object.defineProperty(navigator, "hid", {
        value: undefined,
        configurable: true,
      });
      expect(await isWebHIDSupported()).toBe(false);

      Object.defineProperty(navigator, "hid", {
        value: {},
        configurable: true,
      });
      expect(await isWebHIDSupported()).toBe(false);
    });

    it("detects WebUSB support when navigator.usb is available with requestDevice", async () => {
      Object.defineProperty(navigator, "usb", {
        value: { requestDevice: vi.fn().mockResolvedValue([]) },
        configurable: true,
      });

      const supported = await isWebUSBSupported();
      expect(supported).toBe(true);
    });

    it("reports WebUSB unsupported when navigator.usb is missing or incomplete", async () => {
      Object.defineProperty(navigator, "usb", {
        value: undefined,
        configurable: true,
      });
      expect(await isWebUSBSupported()).toBe(false);

      Object.defineProperty(navigator, "usb", {
        value: {},
        configurable: true,
      });
      expect(await isWebUSBSupported()).toBe(false);
    });

    it("checks overall hardware transport capability for WebHID and WebUSB", async () => {
      Object.defineProperty(navigator, "hid", {
        value: { requestDevice: vi.fn() },
        configurable: true,
      });
      Object.defineProperty(navigator, "usb", {
        value: undefined,
        configurable: true,
      });

      const transport = await isHardwareTransportSupported();
      expect(transport).toEqual({ hid: true, usb: false });
    });

    it("throws helpful error when browser lacks both WebHID and WebUSB", async () => {
      Object.defineProperty(navigator, "hid", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "usb", { value: undefined, configurable: true });

      await expect(connectLedgerDevice()).rejects.toThrow(
        "WebHID and WebUSB are not supported on this browser. Please use Chrome, Brave, or Edge on Desktop.",
      );
    });
  });

  // =========================================================================
  // Criteria 2: Verify error guidance when Ledger device is locked or Stellar app not open
  // =========================================================================
  describe("2. Error Guidance for Device Locked, App Not Open, and Blind Signing", () => {
    it("translates device locked status (0x6b0c / 27404) into clear PIN unlock guidance", () => {
      const errByCode = parseLedgerError({ statusCode: 0x6b0c });
      expect(errByCode.code).toBe("DEVICE_LOCKED");
      expect(errByCode.friendlyMessage).toContain("Your Ledger device is locked");
      expect(errByCode.friendlyMessage).toContain("PIN code");

      const errByNumeric = parseLedgerError({ statusCode: 27404 });
      expect(errByNumeric.code).toBe("DEVICE_LOCKED");

      const errByMsg = parseLedgerError(new Error("Ledger device locked"));
      expect(errByMsg.code).toBe("DEVICE_LOCKED");
    });

    it("translates app not open status (0x6d00 / 0x6e00) into Stellar app prompt", () => {
      const errByCode = parseLedgerError({ statusCode: 0x6d00 });
      expect(errByCode.code).toBe("APP_NOT_OPEN");
      expect(errByCode.friendlyMessage).toContain(
        "Please open the official Stellar application on your Ledger device.",
      );

      const errByMsg = parseLedgerError(new Error("CLA not supported or app not open"));
      expect(errByMsg.code).toBe("APP_NOT_OPEN");
    });

    it("translates user rejection status (0x6985 / 27013) into clear decline feedback", () => {
      const errByCode = parseLedgerError({ statusCode: 0x6985 });
      expect(errByCode.code).toBe("USER_REJECTED");
      expect(errByCode.friendlyMessage).toContain("Transaction or connection request was declined");

      const errByMsg = parseLedgerError(new Error("Condition of use not satisfied"));
      expect(errByMsg.code).toBe("USER_REJECTED");
    });

    it("translates blind signing disabled status (0x6807 / 0x6a80) into setting instructions", () => {
      const errByCode = parseLedgerError({ statusCode: 0x6807 });
      expect(errByCode.code).toBe("BLIND_SIGNING_DISABLED");
      expect(errByCode.friendlyMessage).toContain(
        "Blind signing is disabled on your Ledger device",
      );
      expect(errByCode.friendlyMessage).toContain("enable 'Blind signing' or 'Hash signing'");

      const errByMsg = parseLedgerError(new Error("Blind signing must be enabled in settings"));
      expect(errByMsg.code).toBe("BLIND_SIGNING_DISABLED");
    });

    it("translates transport disconnection into reconnect guidance", () => {
      const err = parseLedgerError(new Error("The device was disconnected during transport"));
      expect(err.code).toBe("TRANSPORT_DISCONNECT");
      expect(err.friendlyMessage).toContain("Ledger device was disconnected");
      expect(err.friendlyMessage).toContain("Ensure your USB/Bluetooth is connected");
    });

    it("provides fallback for unexpected ledger errors", () => {
      const err = parseLedgerError(new Error("Internal chip communication error"));
      expect(err.code).toBe("UNKNOWN_LEDGER_ERROR");
      expect(err.friendlyMessage).toBe("Internal chip communication error");
    });

    it("connectLedgerDevice surfaces locked device error with clean guidance", async () => {
      Object.defineProperty(navigator, "hid", {
        value: { requestDevice: vi.fn() },
        configurable: true,
      });

      const mockTransport = { close: vi.fn().mockResolvedValue(undefined) };
      (TransportWebHID.create as any).mockResolvedValue(mockTransport);

      mockStrApp.getAppConfiguration.mockResolvedValue({ version: "2.5.0" });
      mockStrApp.getPublicKey.mockRejectedValue({ statusCode: 0x6b0c });

      await expect(connectLedgerDevice()).rejects.toThrow(
        "Your Ledger device is locked. Please unlock it with your PIN code and try again.",
      );
      expect(mockTransport.close).toHaveBeenCalled();
    });

    it("connectLedgerDevice surfaces app not open error with clean guidance", async () => {
      Object.defineProperty(navigator, "hid", {
        value: { requestDevice: vi.fn() },
        configurable: true,
      });

      const mockTransport = { close: vi.fn().mockResolvedValue(undefined) };
      (TransportWebHID.create as any).mockResolvedValue(mockTransport);

      mockStrApp.getAppConfiguration.mockResolvedValue({ version: "2.5.0" });
      mockStrApp.getPublicKey.mockRejectedValue({ statusCode: 0x6d00 });

      await expect(connectLedgerDevice()).rejects.toThrow(
        "Please open the official Stellar application on your Ledger device.",
      );
      expect(mockTransport.close).toHaveBeenCalled();
    });

    it("connectLedgerDevice successfully returns public key and version when ready", async () => {
      Object.defineProperty(navigator, "hid", {
        value: { requestDevice: vi.fn() },
        configurable: true,
      });

      const mockTransport = { close: vi.fn().mockResolvedValue(undefined) };
      (TransportWebHID.create as any).mockResolvedValue(mockTransport);

      mockStrApp.getAppConfiguration.mockResolvedValue({ version: "2.5.0" });
      mockStrApp.getPublicKey.mockResolvedValue({
        rawPublicKey: MOCK_SOURCE_KEYPAIR.rawPublicKey(),
      });

      const result = await connectLedgerDevice("m/44'/148'/0'");
      expect(result.address).toBe(MOCK_SOURCE_KEYPAIR.publicKey());
      expect(result.bipPath).toBe("44'/148'/0'");
      expect(result.appVersion).toBe("2.5.0");
      expect(mockTransport.close).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Criteria 3: Test transaction approval timeout & clear rejection feedback in UI
  // =========================================================================
  describe("3. Transaction Approval Timeout and UI Rejection Feedback", () => {
    it("extracts tx details and issues blind signing warning for Soroban contract calls", () => {
      const contractXdr = buildSampleContractXdr();
      const details = extractLedgerVerificationDetails(contractXdr, Networks.TESTNET);

      expect(details.txHash).toHaveLength(64);
      expect(details.requiresBlindSigning).toBe(true);
      expect(details.blindSigningWarning).toContain("invokes a Soroban smart contract");
      expect(details.blindSigningWarning).toContain("Blind signing");
    });

    it("extracts tx details without blind signing requirement for standard payment", () => {
      const paymentXdr = buildSamplePaymentXdr();
      const details = extractLedgerVerificationDetails(paymentXdr, Networks.TESTNET);

      expect(details.txHash).toHaveLength(64);
      expect(details.requiresBlindSigning).toBe(false);
      expect(details.blindSigningWarning).toBeNull();
    });

    it("signLedgerTransaction times out when approval takes too long", async () => {
      Object.defineProperty(navigator, "hid", {
        value: { requestDevice: vi.fn() },
        configurable: true,
      });

      const mockTransport = { close: vi.fn().mockResolvedValue(undefined) };
      (TransportWebHID.create as any).mockResolvedValue(mockTransport);

      // Simulate a hanging signature request that never completes
      mockStrApp.signTransaction.mockReturnValue(new Promise(() => {}));

      const paymentXdr = buildSamplePaymentXdr();
      await expect(
        signLedgerTransaction(paymentXdr, DEFAULT_STELLAR_BIP_PATH, Networks.TESTNET, 20),
      ).rejects.toThrow("Approval timed out on your Ledger device");

      expect(mockTransport.close).toHaveBeenCalled();
    });

    it("signLedgerTransaction translates user decline error cleanly", async () => {
      Object.defineProperty(navigator, "hid", {
        value: { requestDevice: vi.fn() },
        configurable: true,
      });

      const mockTransport = { close: vi.fn().mockResolvedValue(undefined) };
      (TransportWebHID.create as any).mockResolvedValue(mockTransport);

      mockStrApp.signTransaction.mockRejectedValue({ statusCode: 0x6985 });

      const paymentXdr = buildSamplePaymentXdr();
      await expect(
        signLedgerTransaction(paymentXdr, DEFAULT_STELLAR_BIP_PATH, Networks.TESTNET),
      ).rejects.toThrow("Transaction or connection request was declined on your Ledger device.");

      expect(mockTransport.close).toHaveBeenCalled();
    });

    it("displays clear user rejection feedback in the ConnectWalletModal UI", async () => {
      web3.current.connectWallet = vi
        .fn()
        .mockRejectedValue(
          new Error("Transaction or connection request was declined on your Ledger device."),
        );

      await renderModal();
      await click(buttonByText("Ledger Hardware Wallet"));

      expect(container.textContent).toContain("Connection Notice");
      expect(container.textContent).toContain(
        "Transaction or connection request was declined on your Ledger device.",
      );
    });

    it("displays approval timeout feedback in the ConnectWalletModal UI", async () => {
      web3.current.connectWallet = vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Approval timed out on your Ledger device. Please verify and confirm the transaction promptly.",
          ),
        );

      await renderModal();
      await click(buttonByText("Ledger Hardware Wallet"));

      expect(container.textContent).toContain("Connection Notice");
      expect(container.textContent).toContain("Approval timed out on your Ledger device");
    });

    it("displays PIN unlock guidance in the ConnectWalletModal UI when device is locked", async () => {
      web3.current.connectWallet = vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Your Ledger device is locked. Please unlock it with your PIN code and try again.",
          ),
        );

      await renderModal();
      await click(buttonByText("Ledger Hardware Wallet"));

      expect(container.textContent).toContain("Connection Notice");
      expect(container.textContent).toContain("Your Ledger device is locked");
    });
  });

  // =========================================================================
  // Criteria 4: Verify derivation path (44'/148'/0') selection modal functions correctly
  // =========================================================================
  describe("4. Derivation Path Selection Modal & Normalization", () => {
    it("normalizes derivation paths and enforces 44'/148'/0' default", () => {
      expect(DEFAULT_STELLAR_BIP_PATH).toBe("44'/148'/0'");
      expect(formatBipPath()).toBe("44'/148'/0'");
      expect(formatBipPath("")).toBe("44'/148'/0'");
      expect(formatBipPath("m/44'/148'/0'")).toBe("44'/148'/0'");
      expect(formatBipPath("44'/148'/1'")).toBe("44'/148'/1'");
      expect(formatBipPath("  m/44'/148'/2'  ")).toBe("44'/148'/2'");
    });

    it("derives BIP-44 path for account indices", () => {
      expect(getBipPathForAccount(0)).toBe("44'/148'/0'");
      expect(getBipPathForAccount(1)).toBe("44'/148'/1'");
      expect(getBipPathForAccount(2)).toBe("44'/148'/2'");
      expect(getBipPathForAccount(-1)).toBe("44'/148'/0'");
    });

    it("allows switching derivation path accounts in ConnectWalletModal", async () => {
      await renderModal();

      // Open Derivation Path accordion
      await click(buttonByText("Derivation Path: m/44'/148'/0'"));
      expect(container.textContent).toContain("BIP-44 Derivation Path Selection");

      // Select Account #1
      await click(buttonByText("Account #1 (m/44'/148'/1')"));
      expect(container.textContent).toContain("Derivation Path: m/44'/148'/1'");

      // Connect with Account #1 path
      await click(buttonByText("Ledger Hardware Wallet"));
      expect(web3.current.connectWallet).toHaveBeenCalledWith("ledger", undefined, "m/44'/148'/1'");
    });

    it("allows entering a custom derivation path in ConnectWalletModal", async () => {
      await renderModal();

      // Open Derivation Path accordion
      await click(buttonByText("Derivation Path: m/44'/148'/0'"));

      const customInput = container.querySelector(
        "input[placeholder=\"m/44'/148'/0'\"]",
      ) as HTMLInputElement;
      expect(customInput).not.toBeNull();

      setInput(customInput, "m/44'/148'/5'");
      expect(container.textContent).toContain("Derivation Path: m/44'/148'/5'");

      await click(buttonByText("Ledger Hardware Wallet"));
      expect(web3.current.connectWallet).toHaveBeenCalledWith("ledger", undefined, "m/44'/148'/5'");
    });
  });
});
