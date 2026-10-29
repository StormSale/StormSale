// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

const web3 = vi.hoisted(() => ({ current: {} as any }));
const notification = vi.hoisted(() => ({ showNotification: vi.fn() }));
const cryptoMocks = vi.hoisted(() => ({
  getPublicKeyForAddress: vi.fn(),
  wrapAESKey: vi.fn(),
}));
const stellarMocks = vi.hoisted(() => ({
  resolveRecipient: vi.fn(),
  resolveFederatedAddress: vi.fn(),
}));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3.current }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => notification,
}));
vi.mock("../lib/crypto", () => cryptoMocks);
vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    resolveRecipient: stellarMocks.resolveRecipient,
    resolveFederatedAddress: stellarMocks.resolveFederatedAddress,
  };
});

import { GrantAccessForm } from "../components/advertiser/GrantAccessForm";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const AUDITOR = Keypair.random().publicKey();
const CAMPAIGN = StrKey.encodeContract(Buffer.alloc(32, 2));

let container: HTMLDivElement;
let root: Root;

function inputByPlaceholder(placeholder: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!input) throw new Error(`Missing input: ${placeholder}`);
  return input;
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = container.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<GrantAccessForm />);
  });
}

async function fill(campaign: string, saleId: string, auditor: string) {
  setInput(inputByPlaceholder("CCAMPAIGN... (56-char Soroban Contract Address)"), campaign);
  setInput(inputByPlaceholder("e.g., 123"), saleId);
  setInput(inputByPlaceholder("GAUDITOR... or auditor*stormsale.io"), auditor);
}

beforeEach(() => {
  vi.clearAllMocks();
  cryptoMocks.getPublicKeyForAddress.mockResolvedValue("AUDITOR_PUBLIC_KEY");
  cryptoMocks.wrapAESKey.mockResolvedValue("wrapped-key");
  stellarMocks.resolveRecipient.mockResolvedValue({ status: "federated", address: AUDITOR });
  stellarMocks.resolveFederatedAddress.mockResolvedValue({
    accountId: AUDITOR,
    federatedAddress: "auditor*stormsale.io",
  });
  web3.current = {
    getCampaignContract: vi.fn(() => ({
      grantAuditAccess: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
    })),
  };
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
});

describe("GrantAccessForm coverage", () => {
  it("rejects incomplete submissions", async () => {
    await render();
    await submit();

    expect(notification.showNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Access Granted!" }),
    );
    expect(container.textContent).toContain("Must be a valid");
  });

  it("grants access using the resolved raw auditor key", async () => {
    const grantAuditAccess = vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) });
    web3.current.getCampaignContract.mockReturnValue({ grantAuditAccess });

    await render();
    await fill(CAMPAIGN, "5", AUDITOR);
    await submit();

    expect(grantAuditAccess).toHaveBeenCalledWith("5", AUDITOR, "wrapped-key");
    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Access Granted!" }),
    );
    expect(inputByPlaceholder("e.g., 123").value).toBe("");
  });

  it("resolves a federation address on submit before calling the contract", async () => {
    const grantAuditAccess = vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) });
    web3.current.getCampaignContract.mockReturnValue({ grantAuditAccess });

    await render();
    await fill(CAMPAIGN, "9", "auditor*stormsale.io");
    await submit();

    expect(stellarMocks.resolveRecipient).toHaveBeenCalledWith("auditor*stormsale.io");
    expect(grantAuditAccess).toHaveBeenCalledWith("9", AUDITOR, "wrapped-key");
  });

  it("blocks submission when the federation lookup cannot resolve", async () => {
    stellarMocks.resolveRecipient.mockResolvedValue({
      status: "unresolved",
      error: "lookup failed",
    });

    await render();
    await fill(CAMPAIGN, "3", "auditor*stormsale.io");
    await submit();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Auditor Not Verified", message: "lookup failed" }),
    );
    expect(web3.current.getCampaignContract).not.toHaveBeenCalled();
  });

  it("surfaces contract failures", async () => {
    const grantAuditAccess = vi.fn().mockRejectedValue(new Error("ledger rejected"));
    web3.current.getCampaignContract.mockReturnValue({ grantAuditAccess });

    await render();
    await fill(CAMPAIGN, "6", AUDITOR);
    await submit();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Access Grant Failed", message: "ledger rejected" }),
    );
  });
});
