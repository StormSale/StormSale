// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Keypair } from "@stellar/stellar-sdk";

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
    return <div {...rest} />;
  };
  return {
    motion: new Proxy({}, { get: () => MotionComponent }),
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});
vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, resolveRecipient: stellarMocks.resolveRecipient };
});

import { ConnectWalletModal } from "../components/shared/ConnectWalletModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_KEY = Keypair.random().publicKey();

let container: HTMLDivElement;
let root: Root;

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button: ${text}`);
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

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ConnectWalletModal />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  qr.toDataURL.mockResolvedValue("data:image/png;base64,qr");
  walletConnect.connect.mockResolvedValue(undefined);
  stellarMocks.resolveRecipient.mockResolvedValue({ status: "raw", address: PUBLIC_KEY });
  web3.current = {
    isWalletModalOpen: true,
    closeWalletModal: vi.fn(),
    connectWallet: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
});

describe("ConnectWalletModal coverage", () => {
  it("connects extension and web wallets", async () => {
    await render();

    await click(buttonByText("Freighter"));
    expect(web3.current.connectWallet).toHaveBeenCalledWith("freighter");

    await click(buttonByText("Albedo"));
    expect(web3.current.connectWallet).toHaveBeenCalledWith("albedo");

    await click(buttonByText("xBull Wallet"));
    expect(web3.current.connectWallet).toHaveBeenCalledWith("xbull");

    await click(buttonByText("1-Tap Demo Account"));
    expect(web3.current.connectWallet).toHaveBeenCalledWith("mock");

    await click(buttonByText("Continue with Passkey"));
    expect(web3.current.connectWallet).toHaveBeenCalledWith("passkey");
  });

  it("connects Ledger with selectable derivation paths", async () => {
    await render();

    await click(buttonByText("Derivation Path:"));
    await click(buttonByText("Account #1"));
    await click(buttonByText("Ledger Hardware Wallet"));

    expect(web3.current.connectWallet).toHaveBeenCalledWith(
      "ledger",
      undefined,
      "m/44'/148'/1'",
    );
  });

  it("uses a custom derivation path when provided", async () => {
    await render();

    await click(buttonByText("Derivation Path:"));
    const customPath = container.querySelector<HTMLInputElement>(
      'input[placeholder="m/44\'/148\'/0\'"]',
    )!;
    setInput(customPath, "m/44'/148'/9'");
    await click(buttonByText("Ledger Hardware Wallet"));

    expect(web3.current.connectWallet).toHaveBeenCalledWith(
      "ledger",
      undefined,
      "m/44'/148'/9'",
    );
  });

  it("surfaces wallet connection failures", async () => {
    web3.current.connectWallet.mockRejectedValue(new Error("device not ready"));

    await render();
    await click(buttonByText("Freighter"));

    expect(container.textContent).toContain("device not ready");
    expect(container.textContent).toContain("Connection Notice");
  });

  it("connects a read-only watch address", async () => {
    await render();

    await click(buttonByText("Or enter Stellar Public Key"));
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="GXXXX... or alice*stormsale.io"]',
    )!;
    setInput(input, PUBLIC_KEY);
    await click(buttonByText("Connect Watch Key"));

    expect(stellarMocks.resolveRecipient).toHaveBeenCalledWith(PUBLIC_KEY);
    expect(web3.current.connectWallet).toHaveBeenCalledWith("readonly", PUBLIC_KEY);
  });

  it("rejects an invalid read-only address", async () => {
    stellarMocks.resolveRecipient.mockResolvedValue({
      status: "invalid",
      error: "Invalid Stellar public key format.",
    });

    await render();
    await click(buttonByText("Or enter Stellar Public Key"));
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="GXXXX... or alice*stormsale.io"]',
    )!;
    setInput(input, "not-a-key");
    await click(buttonByText("Connect Watch Key"));

    expect(container.textContent).toContain("Invalid Stellar public key format.");
    expect(web3.current.connectWallet).not.toHaveBeenCalled();
  });

  it("shows and completes the WalletConnect QR flow", async () => {
    await render();

    await click(buttonByText("WalletConnect"));
    expect(qr.toDataURL).toHaveBeenCalled();
    expect(container.textContent).toContain("Scan WalletConnect QR");
    expect(container.querySelector('[data-testid="walletconnect-qr-code"]')).not.toBeNull();

    await click(buttonByText("Refresh Code"));
    await click(buttonByText("Open Desktop Session"));
    expect(walletConnect.connect).toHaveBeenCalled();

    await click(buttonByText("WalletConnect"));
    await click(buttonByText("Other Wallets"));
    expect(container.textContent).toContain("Connect Stellar Wallet");
  });

  it("reports WalletConnect completion failures", async () => {
    walletConnect.connect.mockRejectedValue(new Error("session expired"));

    await render();
    await click(buttonByText("WalletConnect"));
    await click(buttonByText("Open Desktop Session"));

    expect(container.textContent).toContain("session expired");
  });

  it("generates a QR image failure notice", async () => {
    qr.toDataURL.mockRejectedValue(new Error("canvas unavailable"));

    await render();
    await click(buttonByText("WalletConnect"));

    expect(container.textContent).toContain("Failed to generate WalletConnect QR code");
  });
});
