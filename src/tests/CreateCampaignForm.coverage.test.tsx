// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const web3 = vi.hoisted(() => ({ current: {} as any }));
const notification = vi.hoisted(() => ({ showNotification: vi.fn() }));
const reserve = vi.hoisted(() => ({ current: {} as any }));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3.current }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => notification,
}));
vi.mock("../hooks/useAccountReserve", () => ({
  useAccountReserve: () => reserve.current,
}));

import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function makeWeb3(overrides: Record<string, unknown> = {}) {
  return {
    createCampaignOnChain: vi.fn().mockResolvedValue({ campaignId: 7, txHash: "0xabc" }),
    isConnected: true,
    userAddress: ADDRESS,
    xlmBalance: "100",
    tokenAllowance: 0,
    refreshTokenAllowance: vi.fn().mockResolvedValue(0),
    approveTokenAllowance: vi.fn().mockResolvedValue({ success: true, txHash: "approve-hash" }),
    assetBalances: { XLM: "100", USDC: "50", EURC: "20" },
    isMultiSigAccount: false,
    openMultiSigModal: vi.fn(),
    ...overrides,
  };
}

function makeReserve(overrides: Record<string, unknown> = {}) {
  return {
    spendableXlm: 10,
    reserveXlm: 1,
    balanceXlm: 11,
    subentries: 0,
    baseReserveXlm: 0.5,
    isLoading: false,
    isReady: true,
    isFallback: false,
    isUnavailable: false,
    sellingLiabilitiesXlm: 0,
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function renderForm() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CreateCampaignForm />);
  });
}

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

async function submitForm() {
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

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

async function fillValidForm(budget = "5") {
  setInput(inputByPlaceholder("e.g., Summer Sale 2024"), "Launch Campaign");
  setInput(inputByPlaceholder("e.g., 15 for 15%"), "12");
  setInput(inputByPlaceholder("e.g., 1000"), budget);
  setInput(inputByPlaceholder("Or enter custom period in seconds"), "86400");
}

beforeEach(() => {
  vi.clearAllMocks();
  web3.current = makeWeb3();
  reserve.current = makeReserve();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
});

describe("CreateCampaignForm coverage", () => {
  it("renders the reserve panel and supports its controls", async () => {
    await renderForm();

    expect(container.textContent).toContain("Escrow Capacity");
    expect(container.textContent).toContain("10 XLM");

    await click(buttonByText("Max"));
    expect(inputByPlaceholder("e.g., 1000").value).toBe("10");

    await click(buttonByText("24 Hours"));
    expect(inputByPlaceholder("Or enter custom period in seconds").value).toBe("86400");

    const refresh = container.querySelector<HTMLButtonElement>(
      'button[title="Refresh token allowance"]',
    )!;
    await click(refresh);
    expect(web3.current.refreshTokenAllowance).toHaveBeenCalled();
    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Allowance Refreshed" }),
    );
  });

  it("updates the selected settlement asset", async () => {
    await renderForm();
    const select = container.querySelector<HTMLSelectElement>("#asset-selector")!;

    await act(async () => {
      select.value = "USDC";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("USD Coin");
    expect(container.textContent).toContain("Circle SAC Token");
  });

  it("disables escrow when the budget exceeds the spendable balance", async () => {
    await renderForm();
    setInput(inputByPlaceholder("e.g., 1000"), "25");

    expect(container.textContent).toContain("Amount exceeds your spendable balance");
    expect(buttonByText("Approve & Launch XLM Campaign").hasAttribute("disabled")).toBe(true);

    setInput(inputByPlaceholder("e.g., Summer Sale 2024"), "Too Big Campaign");
    setInput(inputByPlaceholder("e.g., 15 for 15%"), "10");
    setInput(inputByPlaceholder("Or enter custom period in seconds"), "86400");
    await submitForm();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Insufficient Spendable Balance" }),
    );
    expect(web3.current.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("reports validation errors for incomplete submissions", async () => {
    await renderForm();
    await submitForm();

    expect(container.textContent).toContain("Campaign name must be at least 3 characters");
    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Validation Error" }),
    );
    expect(web3.current.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("requires a wallet connection before submitting", async () => {
    web3.current = makeWeb3({ isConnected: false });
    await renderForm();
    await fillValidForm();
    await submitForm();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Wallet Not Connected" }),
    );
    expect(web3.current.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("approves the allowance then creates the campaign", async () => {
    await renderForm();
    await fillValidForm();
    await submitForm();

    expect(web3.current.approveTokenAllowance).toHaveBeenCalledWith(5, undefined, "XLM");
    expect(web3.current.createCampaignOnChain).toHaveBeenCalledWith(
      "Launch Campaign",
      5,
      12,
      86400,
      "XLM",
    );
    expect(container.textContent).toContain("Campaign #7 Successfully Initialized");
    // The escrow deposit changed the balance, so the reserve snapshot is reloaded.
    expect(reserve.current.refresh).toHaveBeenCalledTimes(1);

    await click(buttonByText("Dismiss"));
    expect(container.textContent).not.toContain("Campaign #7 Successfully Initialized");
  });

  it("surfaces allowance approval failures", async () => {
    web3.current = makeWeb3({
      approveTokenAllowance: vi.fn().mockRejectedValue(new Error("approval denied")),
    });
    await renderForm();
    await fillValidForm();
    await submitForm();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Step 1 Failed (Approval)", message: "approval denied" }),
    );
    expect(web3.current.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("surfaces escrow creation failures", async () => {
    web3.current = makeWeb3({
      tokenAllowance: 100,
      createCampaignOnChain: vi.fn().mockRejectedValue(new Error("contract reverted")),
    });
    await renderForm();
    await fillValidForm();
    await submitForm();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Failed to Create Campaign", message: "contract reverted" }),
    );
  });

  it("lets the advertiser approve an allowance on its own", async () => {
    await renderForm();
    setInput(inputByPlaceholder("e.g., 1000"), "4");
    await click(buttonByText("Approve Allowance Only"));

    expect(web3.current.approveTokenAllowance).toHaveBeenCalledWith(4, undefined, "XLM");
    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Allowance Approved!" }),
    );
  });

  it("opens the multi-signature console and renders connected capacity", async () => {
    web3.current = makeWeb3({ isMultiSigAccount: true });
    reserve.current = makeReserve({ subentries: 2, isFallback: true });
    await renderForm();

    expect(container.textContent).toContain("2 subentries detected");
    expect(container.textContent).toContain("Live reserve data is unavailable");

    await click(buttonByText("Multi-Sig Console"));
    expect(web3.current.openMultiSigModal).toHaveBeenCalled();
  });

  it("disables the Max control when there is no spendable balance", async () => {
    reserve.current = makeReserve({ spendableXlm: 0, balanceXlm: 1, reserveXlm: 1 });
    await renderForm();
    setInput(inputByPlaceholder("e.g., 1000"), "3");

    expect(buttonByText("Max").hasAttribute("disabled")).toBe(true);
  });
  it("blocks escrow and Max until the reserve lookup is ready", async () => {
    reserve.current = makeReserve({ isReady: false, isLoading: true });
    await renderForm();
    await fillValidForm("5");

    expect(buttonByText("Max").hasAttribute("disabled")).toBe(true);
    await submitForm();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Checking Balance" }),
    );
    expect(web3.current.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("rejects a budget one stroop above the spendable balance", async () => {
    await renderForm();
    setInput(inputByPlaceholder("e.g., 1000"), "10.0000001");
    expect(container.textContent).toContain("Amount exceeds your spendable balance");

    setInput(inputByPlaceholder("e.g., 1000"), "10.0000000");
    expect(container.textContent).not.toContain("Amount exceeds your spendable balance");
  });

  it("rejects exponent notation instead of bypassing the spendable check", async () => {
    await renderForm();
    await fillValidForm("1e3");
    // The amount is not treated as a valid budget, so it never reaches the chain.
    expect(container.textContent).not.toContain("Approve & Launch XLM Campaign");
    await submitForm();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Validation Error" }),
    );
    expect(container.textContent).toContain("without exponent notation");
    expect(web3.current.approveTokenAllowance).not.toHaveBeenCalled();
    expect(web3.current.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("clears a stale budget error and finished flow state when Max is used", async () => {
    await renderForm();
    await fillValidForm("1e3");
    await submitForm();
    expect(container.textContent).toContain("without exponent notation");

    await click(buttonByText("Max"));
    expect(inputByPlaceholder("e.g., 1000").value).toBe("10");
    expect(container.textContent).not.toContain("without exponent notation");

    // A finished flow resets to idle when Max refills the field.
    await submitForm();
    expect(container.textContent).toContain("Campaign #7 Successfully Initialized");
    web3.current.createCampaignOnChain.mockRejectedValueOnce(new Error("contract reverted"));
    await fillValidForm("2");
    await submitForm();
    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Failed to Create Campaign" }),
    );
    await click(buttonByText("Max"));
    expect(inputByPlaceholder("e.g., 1000").value).toBe("10");
    expect(buttonByText("Launch XLM Campaign").hasAttribute("disabled")).toBe(false);
  });

  it("disables Max when live reserve data is unavailable", async () => {
    reserve.current = makeReserve({ isFallback: true, isUnavailable: true });
    await renderForm();

    expect(buttonByText("Max").hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain("Max is disabled until the account can be loaded");
  });
});
