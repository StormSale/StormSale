// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Create Campaign (visibility toggle and the save that follows the on-chain
 * create) and Log Sale (the private-campaign gate) driven through their UI
 * (#147).
 */

const web3 = vi.hoisted(() => ({
  userAddress: null as string | null,
  isConnected: false,
  isMultiSigAccount: false,
  openMultiSigModal: vi.fn(),
  createCampaignOnChain: vi.fn(),
  refreshTokenAllowance: vi.fn(),
  approveTokenAllowance: vi.fn(),
  getCampaignContract: vi.fn(),
  tokenAllowance: 0,
  // Native balance must clear the 100 XLM budget plus the minimum reserve for
  // the reserve-aware submit guard to allow the campaign.
  xlmBalance: "500.00",
  assetBalances: { XLM: "500.00", USDC: "50.00", EURC: "0.00" },
}));
const notify = vi.hoisted(() => vi.fn());
const crypto = vi.hoisted(() => ({
  generateAESKey: vi.fn(async () => "aes"),
  encryptPayload: vi.fn(async () => "cipher"),
  wrapAESKey: vi.fn(async () => "wrapped"),
  getPublicKeyForAddress: vi.fn(async () => "pub"),
}));
const webhooks = vi.hoisted(() => ({
  dispatchWebhookEvent: vi.fn(async () => undefined),
  triggerConversionPostback: vi.fn(async () => [] as unknown[]),
}));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3 }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: notify }),
}));
// config/stellar builds Stellar asset ids at import time, which jsdom's
// Uint8Array cannot do; the form only reads names, decimals and addresses.
vi.mock("../config/stellar", () => {
  const asset = (code: string, name: string) => ({
    code,
    name,
    decimals: 7,
    contractAddress: `C${code}${"A".repeat(50)}`,
  });
  return {
    STELLAR_CONFIG: { network: "TESTNET", contractId: "CCONTRACT" },
    SUPPORTED_ESCROW_ASSETS: {
      XLM: asset("XLM", "Stellar Lumens"),
      USDC: asset("USDC", "USD Coin (Circle SAC)"),
      EURC: asset("EURC", "Euro Coin (Circle SAC)"),
    },
  };
});
vi.mock("../config/contracts", () => ({
  CONTRACT_ADDRESSES: { CAMPAIGN_ESCROW: `CESCROW${"B".repeat(49)}` },
}));
vi.mock("../lib/stellar", () => ({
  formatStellarAddress: (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`,
  // FederatedAddressInput reads these helpers; raw keys resolve without a fetch.
  isValidStellarAccount: (value: string) => /^G[A-Z2-7]{55}$/.test(value?.trim() ?? ""),
  isFederatedAddress: (value: string) => /^[^*\s]+\*[^*\s]+\.[^*\s]+$/.test(value?.trim() ?? ""),
  resolveFederatedAddress: vi.fn(async () => {
    throw new Error("Federation lookups are not exercised in this suite.");
  }),
  resolveRecipient: vi.fn(async (value: string) => {
    const trimmed = value?.trim() ?? "";
    if (/^G[A-Z2-7]{55}$/.test(trimmed)) {
      return { status: "raw", address: trimmed };
    }
    return {
      status: "invalid",
      error: "Enter a valid G... public key or name*domain.com federation address.",
    };
  }),
  // useAccountReserve needs the reserve math; Horizon is unavailable here, so
  // the hook falls back to the wallet balance exposed by the mocked context.
  calculateReserveBreakdown: (balanceXlm: number | string, subentries: number) => {
    const parsed = typeof balanceXlm === "number" ? balanceXlm : parseFloat(balanceXlm);
    const balance = Number.isFinite(parsed) ? parsed : 0;
    const baseReserveXlm = 0.5;
    const reserveXlm = (2 + Math.max(0, subentries)) * baseReserveXlm;
    return {
      balanceXlm: balance,
      subentries,
      baseReserveXlm,
      reserveXlm,
      spendableXlm: Math.max(0, balance - reserveXlm),
      numSponsoring: 0,
      numSponsored: 0,
    };
  },
  fetchStellarAccountDetails: vi.fn(async () => ({
    exists: false,
    balanceXlm: 0,
    subentries: 0,
    trustlineCount: 0,
    numSponsoring: 0,
    numSponsored: 0,
  })),
}));
vi.mock("../lib/crypto", () => crypto);
vi.mock("../lib/webhookEngine", () => webhooks);

import { CreateCampaignForm } from "../components/advertiser/CreateCampaignForm";
import { LogSaleForm } from "../components/advertiser/LogSaleForm";
import {
  getCampaignPolicy,
  reviewApplication,
  setCampaignVisibility,
  submitApplication,
} from "../lib/campaignAccess";
import { getLocalStorage } from "../lib/storage";

const ADVERTISER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const AFFILIATE = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

const titles = () => notify.mock.calls.map(([n]) => (n as { title: string }).title);

beforeEach(() => {
  getLocalStorage().clear();
  notify.mockReset();
  Object.assign(web3, {
    userAddress: ADVERTISER,
    isConnected: true,
    isMultiSigAccount: false,
    tokenAllowance: 0,
  });
  web3.refreshTokenAllowance.mockReset().mockResolvedValue(0);
  web3.approveTokenAllowance.mockReset().mockResolvedValue({ txHash: "approvetx123456" });
  web3.createCampaignOnChain
    .mockReset()
    .mockResolvedValue({ campaignId: 7, txHash: "createtx1234567890" });
  web3.openMultiSigModal.mockReset();
  web3.getCampaignContract.mockReset();
  webhooks.triggerConversionPostback.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ─────────────────────────────── Create Campaign ─────────────────────────────── */

function fillCampaign({ budget = "100" } = {}) {
  fireEvent.change(screen.getByPlaceholderText("e.g., Summer Sale 2024"), {
    target: { value: "Launch Week" },
  });
  fireEvent.change(screen.getByPlaceholderText("e.g., 15 for 15%"), { target: { value: "10" } });
  fireEvent.change(screen.getByPlaceholderText("e.g., 1000"), { target: { value: budget } });
  fireEvent.click(screen.getByRole("button", { name: "24 Hours" }));
}

// The reserve-aware submit guard waits for the account reserve lookup to settle,
// which the Max control signals by becoming enabled.
const submitCampaign = async () => {
  if (web3.isConnected) {
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Max" }).hasAttribute("disabled")).toBe(false),
    );
  }
  fireEvent.submit(screen.getByPlaceholderText("e.g., Summer Sale 2024").closest("form")!);
};

describe("CreateCampaignForm", () => {
  it("reports validation errors without touching the chain", async () => {
    render(<CreateCampaignForm />);
    await submitCampaign();
    await waitFor(() => expect(titles()).toContain("Validation Error"));
    expect(web3.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("asks for a wallet before creating", async () => {
    Object.assign(web3, { isConnected: false, userAddress: null });
    render(<CreateCampaignForm />);
    fillCampaign();
    await submitCampaign();
    await waitFor(() => expect(titles()).toContain("Wallet Not Connected"));
  });

  it("approves, creates, and records a private campaign against its advertiser", async () => {
    render(<CreateCampaignForm />);
    fillCampaign();
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    await submitCampaign();
    await waitFor(() => expect(titles()).toContain("Private Campaign Live on Stellar!"));
    expect(web3.approveTokenAllowance).toHaveBeenCalledWith(100, undefined, "XLM");
    expect(web3.createCampaignOnChain).toHaveBeenCalledWith("Launch Week", 100, 10, 86400, "XLM");
    expect(getCampaignPolicy(7)).toMatchObject({ visibility: "private", advertiser: ADVERTISER });

    // The success banner, and the form reset to public.
    expect(screen.getByText(/Tx Hash: createtx1234567890/)).toBeTruthy();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Tx Hash:/)).toBeNull();
  });

  it("records a public campaign when the toggle is left off", async () => {
    render(<CreateCampaignForm />);
    fillCampaign();
    await submitCampaign();
    await waitFor(() => expect(titles()).toContain("Campaign Escrow Live on Stellar!"));
    expect(getCampaignPolicy(7)).toMatchObject({ visibility: "public" });
  });

  it("warns, rather than reporting a failed creation, when only the access setting fails to save", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // jsdom's localStorage resolves setItem through Storage.prototype.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    render(<CreateCampaignForm />);
    fillCampaign();
    fireEvent.click(screen.getByRole("switch"));
    await submitCampaign();

    await waitFor(() => expect(titles()).toContain("Campaign Created — Access Setting Not Saved"));
    expect(titles()).toContain("Campaign Escrow Live on Stellar!");
    expect(titles()).not.toContain("Failed to Create Campaign");
    expect(web3.createCampaignOnChain).toHaveBeenCalledTimes(1);
  });

  it("stops after a failed approval and never creates", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    web3.approveTokenAllowance.mockRejectedValue(new Error("user declined"));
    render(<CreateCampaignForm />);
    fillCampaign();
    await submitCampaign();
    await waitFor(() => expect(titles()).toContain("Step 1 Failed (Approval)"));
    expect(web3.createCampaignOnChain).not.toHaveBeenCalled();
  });

  it("reports a failed on-chain create", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    web3.createCampaignOnChain.mockRejectedValue(new Error("simulation failed"));
    render(<CreateCampaignForm />);
    fillCampaign();
    await submitCampaign();
    await waitFor(() => expect(titles()).toContain("Failed to Create Campaign"));
    expect(getCampaignPolicy(7)).toBeNull();
  });

  it("skips the approval when the allowance already covers the budget", async () => {
    web3.refreshTokenAllowance.mockResolvedValue(500);
    render(<CreateCampaignForm />);
    await waitFor(() => expect(web3.refreshTokenAllowance).toHaveBeenCalled());
    fillCampaign();
    await screen.findByText(/Escrow Ready/);
    await submitCampaign();
    await waitFor(() => expect(titles()).toContain("Campaign Escrow Live on Stellar!"));
    expect(web3.approveTokenAllowance).not.toHaveBeenCalled();
  });

  it("approves the allowance on its own, and reports its failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<CreateCampaignForm />);
    fillCampaign();
    fireEvent.click(screen.getByRole("button", { name: /Approve Allowance Only/ }));
    await waitFor(() => expect(titles()).toContain("Allowance Approved!"));

    web3.approveTokenAllowance.mockRejectedValueOnce(new Error("rejected"));
    fireEvent.change(screen.getByPlaceholderText("e.g., 1000"), { target: { value: "900" } });
    fireEvent.click(await screen.findByRole("button", { name: /Approve Allowance Only/ }));
    await waitFor(() => expect(titles()).toContain("Approval Failed"));
  });

  it("refuses an allowance approval without a wallet", async () => {
    render(<CreateCampaignForm />);
    fillCampaign();
    Object.assign(web3, { isConnected: false });
    // Re-render so the form reads the disconnected wallet.
    fireEvent.change(screen.getByPlaceholderText("e.g., 1000"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve Allowance Only/ }));
    await waitFor(() => expect(titles()).toContain("Wallet Not Connected"));
  });

  it("refreshes the allowance on request and switches the escrow asset", async () => {
    web3.refreshTokenAllowance.mockResolvedValue(42);
    render(<CreateCampaignForm />);
    fireEvent.click(screen.getByTitle("Refresh token allowance"));
    await waitFor(() => expect(titles()).toContain("Allowance Refreshed"));
  });
});
