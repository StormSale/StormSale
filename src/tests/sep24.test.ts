import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import {
  Sep24Error,
  fetchAnchorToml,
  discoverWithdrawalAssets,
  startInteractiveWithdrawal,
  fetchTransferStatus,
  pollTransferStatus,
  buildWithdrawalReceipt,
  isTerminalStatus,
  runWithdrawalFlow,
} from "../lib/sep24";

const TOML_URL = "https://anchor.test";

const fullToml = {
  NETWORK_PASSPHRASE: "Test Stellar Network ; SEP0000",
  DOCUMENTATION: "Anchor Test",
  TRANSFER_SERVER_SEP24: "https://anchor.test/sep24",
  CURRENCIES: [
    { code: "USDC", issuer: "issuer", status: "tradeable" },
    { code: "XLM", issuer: "issuer", status: "inactive" },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SEP-024 client", () => {
  const fetchMock: Mock = vi.fn();
  const openMock: Mock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    openMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      open: openMock,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and parses anchor TOML", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fullToml));
    const toml = await fetchAnchorToml(TOML_URL);
    expect(toml.transferServerSep24).toBe("https://anchor.test/sep24");
    expect(toml.displayName).toBe("Anchor Test");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://anchor.test/.full-toml",
      expect.objectContaining({ headers: { Accept: "application/toml-json" } }),
    );
  });

  it("throws when SEP-24 is not declared", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...fullToml, TRANSFER_SERVER_SEP24: undefined }),
    );
    await expect(fetchAnchorToml(TOML_URL)).rejects.toMatchObject({
      code: "sep24_not_supported",
    });
  });

  it("discovers tradeable withdrawal assets", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fullToml));
    const assets = await discoverWithdrawalAssets(TOML_URL);
    expect(assets).toEqual([{ code: "USDC", issuer: "issuer" }]);
  });

  it("initiates interactive withdrawal with auth token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "tx-1",
        type: "withdrawal",
        url_interactive: "https://anchor.test/interactive?token=abc",
      }),
    );
    const res = await startInteractiveWithdrawal(
      "https://anchor.test/sep24",
      { assetCode: "USDC", assetIssuer: "issuer", amount: "10", account: "GABC" },
      "jwt.token",
    );
    expect(res.id).toBe("tx-1");
    expect(res.url_interactive).toContain("interactive");
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://anchor.test/sep24/transactions/withdraw/interactive");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.Authorization).toBe("Bearer jwt.token");
    expect(call[1].body).toContain("asset_code=USDC");
  });

  it("requires auth token for withdrawal", async () => {
    await expect(
      startInteractiveWithdrawal(
        "https://anchor.test/sep24",
        { assetCode: "USDC", assetIssuer: "issuer", amount: "10", account: "GABC" },
        "",
      ),
    ).rejects.toMatchObject({ code: "missing_token" });
  });

  it("returns transfer status with fiat reference", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        transaction: {
          id: "tx-1",
          status: "completed",
          amount_in: "10",
          amount_out: "9.5",
          amount_fee: "0.5",
          external_transaction_id: "FIAT-REF-999",
        },
      }),
    );
    const status = await fetchTransferStatus(
      "https://anchor.test/sep24",
      "tx-1",
      "jwt.token",
    );
    expect(status.status).toBe("completed");
    expect(status.external_transaction_id).toBe("FIAT-REF-999");
  });

  it("polls until terminal status", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ transaction: { id: "tx-1", status: "pending_anchor" } }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        transaction: {
          id: "tx-1",
          status: "completed",
          external_transaction_id: "FIAT-REF-999",
        },
      }),
    );
    const updates: string[] = [];
    const final = await pollTransferStatus(
      "https://anchor.test/sep24",
      "tx-1",
      "jwt.token",
      (s) => updates.push(s.status),
      { intervalMs: 1, timeoutMs: 1000 },
    );
    expect(updates).toEqual(["pending_anchor", "completed"]);
    expect(final.status).toBe("completed");
  });

  it("builds receipt with fiat reference", () => {
    const receipt = buildWithdrawalReceipt({
      id: "tx-1",
      status: "completed",
      amount_in: "10",
      amount_out: "9.5",
      amount_fee: "0.5",
      external_transaction_id: "FIAT-REF-999",
    });
    expect(receipt.fiatReference).toBe("FIAT-REF-999");
    expect(receipt.transactionId).toBe("tx-1");
  });

  it("rejects receipt for completed without fiat reference", () => {
    expect(() =>
      buildWithdrawalReceipt({ id: "tx-1", status: "completed" }),
    ).toThrow(Sep24Error);
  });

  it("identifies terminal statuses", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("pending_anchor")).toBe(false);
  });

  it("runs end to end withdrawal flow with popup and receipt", async () => {
    const popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
    };
    openMock.mockReturnValue(popup);
    fetchMock.mockResolvedValueOnce(jsonResponse(fullToml));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "tx-1",
        type: "withdrawal",
        url_interactive: "https://anchor.test/interactive?token=abc",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        transaction: {
          id: "tx-1",
          status: "completed",
          amount_in: "10",
          amount_out: "9.5",
          amount_fee: "0.5",
          external_transaction_id: "FIAT-REF-999",
        },
      }),
    );
    const result = await runWithdrawalFlow(
      TOML_URL,
      { assetCode: "USDC", assetIssuer: "issuer", amount: "10", account: "GABC" },
      { token: "jwt.token", pollingIntervalMs: 1, pollingTimeoutMs: 1000 },
    );
    expect(openMock).toHaveBeenCalledWith(
      "https://anchor.test/interactive?token=abc",
      "sep24-interactive",
      expect.stringContaining("width=480"),
    );
    expect(result.receipt.fiatReference).toBe("FIAT-REF-999");
    expect(popup.close).toHaveBeenCalled();
  });
});
