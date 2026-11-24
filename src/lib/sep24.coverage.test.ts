// @vitest-environment happy-dom
/**
 * sep24.coverage.test.ts
 *
 * Direct unit tests for the REAL sep24.ts implementation (no module-level mocks).
 * Uses vi.spyOn(global, "fetch") to control HTTP responses and exercise every
 * branch in:
 *   - fetchWithTimeout()         (AbortError path, non-JSON body)
 *   - requireHttpsUrl()          (missing, invalid URL, non-HTTPS) — via callers
 *   - discoverTransferServer()   (200 TOML, 4xx error, timeout, missing key,
 *                                 fallback TRANSFER_SERVER key, non-HTTPS URL)
 *   - initiateSep24Withdrawal()  (success, non-2xx, unexpected body shape,
 *                                 missing/invalid url)
 *   - parseSep24Transaction()    (all field mappings, validation errors,
 *                                 fallback paths)
 *   - fetchSep24Transaction()    (success, non-2xx, missing transaction object)
 *   - pollSep24Transaction()     (terminal statuses, onStatusChange, maxAttempts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Import the REAL implementation — no vi.mock() wrapping sep24 here */
import {
  discoverTransferServer,
  initiateSep24Withdrawal,
  parseSep24Transaction,
  fetchSep24Transaction,
  pollSep24Transaction,
} from "./sep24";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                      */
/* -------------------------------------------------------------------------- */

function mockFetchOnce(
  status: number,
  body: unknown,
): ReturnType<typeof vi.spyOn> {
  const responseBody = JSON.stringify(body);
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(responseBody),
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function mockFetchToml(toml: string, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(toml),
    json: () => Promise.reject(new SyntaxError("Not JSON")),
  } as unknown as Response);
}

/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* ========================================================================== */
/* discoverTransferServer                                                        */
/* ========================================================================== */

describe("discoverTransferServer() – real implementation", () => {
  it("returns TRANSFER_SERVER_SEP0024 from a valid TOML", async () => {
    mockFetchToml(
      `[DOCUMENTATION]\nTRANSFER_SERVER_SEP0024 = "https://anchor.example/sep24"\n`,
    );

    const result = await discoverTransferServer("anchor.example");
    expect(result).toBe("https://anchor.example/sep24");
  });

  it("falls back to TRANSFER_SERVER when SEP0024 key is absent", async () => {
    mockFetchToml(
      `[DOCUMENTATION]\nTRANSFER_SERVER = "https://anchor.example/legacy"\n`,
    );

    const result = await discoverTransferServer("anchor.example");
    expect(result).toBe("https://anchor.example/legacy");
  });

  it("throws when neither transfer server key is present in TOML", async () => {
    mockFetchToml(`[DOCUMENTATION]\nNETWORK_PASSPHRASE = "Test SDF Network"\n`);

    await expect(discoverTransferServer("anchor.example")).rejects.toThrow(
      /does not declare TRANSFER_SERVER_SEP0024/i,
    );
  });

  it("throws when anchor TOML endpoint returns non-2xx", async () => {
    mockFetchToml("Not Found", 404);

    await expect(discoverTransferServer("bad-anchor.example")).rejects.toThrow(
      /HTTP 404/i,
    );
  });

  it("throws when discovered TRANSFER_SERVER_SEP0024 URL is not HTTPS", async () => {
    mockFetchToml(
      `[DOCUMENTATION]\nTRANSFER_SERVER_SEP0024 = "http://insecure.example/sep24"\n`,
    );

    await expect(discoverTransferServer("anchor.example")).rejects.toThrow(
      /must use HTTPS/i,
    );
  });

  it("throws when discovered TRANSFER_SERVER fallback URL is not a valid URL", async () => {
    mockFetchToml(
      `[DOCUMENTATION]\nTRANSFER_SERVER = "not-a-valid-url"\n`,
    );

    await expect(discoverTransferServer("anchor.example")).rejects.toThrow(
      /not a valid URL/i,
    );
  });

  it("throws with AbortError message when TOML fetch times out", async () => {
    vi.spyOn(global, "fetch").mockImplementationOnce((_url, init) => {
      return new Promise((_resolve, reject) => {
        (init?.signal as AbortSignal)?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const promise = discoverTransferServer("slow-anchor.example", 50);
    vi.advanceTimersByTime(60);
    await expect(promise).rejects.toThrow(/timed out/i);
  });
});

/* ========================================================================== */
/* initiateSep24Withdrawal                                                       */
/* ========================================================================== */

describe("initiateSep24Withdrawal() – real implementation", () => {
  const TOML_OK = `TRANSFER_SERVER_SEP0024 = "https://anchor.example/sep24"\n`;

  it("returns id and url on a successful interactive response", async () => {
    mockFetchToml(TOML_OK);
    mockFetchOnce(200, {
      type: "interactive_customer_info_needed",
      id: "txn_abc",
      url: "https://anchor.example/sep24/interactive?transaction_id=txn_abc",
    });

    const result = await initiateSep24Withdrawal({
      anchorDomain: "anchor.example",
      assetCode: "USDC",
      account: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
      amount: "50.00",
    });

    expect(result.id).toBe("txn_abc");
    expect(result.url).toContain("txn_abc");
  });

  it("throws when anchor POST returns non-2xx with error field", async () => {
    mockFetchToml(TOML_OK);
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    } as unknown as Response);

    await expect(
      initiateSep24Withdrawal({
        anchorDomain: "anchor.example",
        assetCode: "USDC",
        account: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
      }),
    ).rejects.toThrow(/Unauthorized/i);
  });

  it("throws with HTTP status fallback when anchor POST returns non-2xx without error body", async () => {
    mockFetchToml(TOML_OK);
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(
      initiateSep24Withdrawal({
        anchorDomain: "anchor.example",
        assetCode: "USDC",
        account: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
      }),
    ).rejects.toThrow(/HTTP 503/i);
  });

  it("throws when anchor returns unexpected type in body", async () => {
    mockFetchToml(TOML_OK);
    mockFetchOnce(200, {
      type: "non_interactive",
      id: "txn_abc",
      url: "https://anchor.example",
    });

    await expect(
      initiateSep24Withdrawal({
        anchorDomain: "anchor.example",
        assetCode: "USDC",
        account: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
      }),
    ).rejects.toThrow(/expected type=interactive_customer_info_needed/i);
  });

  it("throws when anchor response is missing id field", async () => {
    mockFetchToml(TOML_OK);
    mockFetchOnce(200, {
      type: "interactive_customer_info_needed",
      url: "https://anchor.example/interactive",
    });

    await expect(
      initiateSep24Withdrawal({
        anchorDomain: "anchor.example",
        assetCode: "USDC",
        account: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
      }),
    ).rejects.toThrow(/expected type=interactive_customer_info_needed/i);
  });

  it("throws when anchor returns a non-HTTPS interactive URL", async () => {
    mockFetchToml(TOML_OK);
    mockFetchOnce(200, {
      type: "interactive_customer_info_needed",
      id: "txn_abc",
      url: "http://insecure.example/interactive",
    });

    await expect(
      initiateSep24Withdrawal({
        anchorDomain: "anchor.example",
        assetCode: "USDC",
        account: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
      }),
    ).rejects.toThrow(/must use HTTPS/i);
  });

  it("throws when anchor returns an invalid URL string", async () => {
    mockFetchToml(TOML_OK);
    mockFetchOnce(200, {
      type: "interactive_customer_info_needed",
      id: "txn_abc",
      url: "not-a-valid-url",
    });

    await expect(
      initiateSep24Withdrawal({
        anchorDomain: "anchor.example",
        assetCode: "USDC",
        account: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZG5ZC3Q02I6Q4A5DRJNV",
      }),
    ).rejects.toThrow(/not a valid URL/i);
  });
});

/* ========================================================================== */
/* parseSep24Transaction                                                         */
/* ========================================================================== */

describe("parseSep24Transaction() – real implementation", () => {
  it("maps all standard fields correctly", () => {
    const raw = {
      id: "txn_xyz",
      kind: "withdrawal",
      status: "completed",
      message: "Done",
      external_transaction_id: "BANK-REF-00123",
      amount_in: "50.00",
      amount_out: "49.50",
      amount_in_asset: "USDC",
      amount_out_asset: "USD",
      started_at: "2026-11-19T08:00:00Z",
      completed_at: "2026-11-19T08:05:00Z",
      more_info_url: "https://anchor.example/info",
    };

    const tx = parseSep24Transaction(raw);

    expect(tx.id).toBe("txn_xyz");
    expect(tx.kind).toBe("withdrawal");
    expect(tx.status).toBe("completed");
    expect(tx.externalTransactionId).toBe("BANK-REF-00123");
    expect(tx.amountIn).toBe("50.00");
    expect(tx.amountOut).toBe("49.50");
    expect(tx.assetCode).toBe("USDC");
    expect(tx.amountOutAsset).toBe("USD");
    expect(tx.startedAt).toBe("2026-11-19T08:00:00Z");
    expect(tx.completedAt).toBe("2026-11-19T08:05:00Z");
    expect(tx.moreInfoUrl).toBe("https://anchor.example/info");
  });

  it("falls back to fiat_payout_reference when external_transaction_id is absent", () => {
    const tx = parseSep24Transaction({
      id: "txn_fallback",
      kind: "deposit",
      status: "pending_anchor",
      fiat_payout_reference: "FIAT-99",
    });

    expect(tx.externalTransactionId).toBe("FIAT-99");
    expect(tx.kind).toBe("deposit");
  });

  it("sets kind to 'withdrawal' for any non-deposit kind value", () => {
    const tx = parseSep24Transaction({ id: "t1", kind: "unknown", status: "incomplete" });
    expect(tx.kind).toBe("withdrawal");
  });

  it("defaults kind to 'withdrawal' when kind is absent", () => {
    const tx = parseSep24Transaction({ id: "t1", status: "incomplete" });
    expect(tx.kind).toBe("withdrawal");
  });

  it("falls back to asset_code when amount_in_asset is absent", () => {
    const tx = parseSep24Transaction({
      id: "t2",
      kind: "withdrawal",
      status: "pending_stellar",
      asset_code: "XLM",
    });
    expect(tx.assetCode).toBe("XLM");
  });

  it("uses more_info_url as message fallback when message is absent", () => {
    const tx = parseSep24Transaction({
      id: "t3",
      kind: "withdrawal",
      status: "pending_external",
      more_info_url: "https://anchor.example/moreinfo",
    });
    expect(tx.message).toBe("https://anchor.example/moreinfo");
  });

  it("throws when raw is null", () => {
    expect(() => parseSep24Transaction(null)).toThrow(/non-object/i);
  });

  it("throws when raw is not an object", () => {
    expect(() => parseSep24Transaction("string")).toThrow(/non-object/i);
  });

  it("throws when id is missing", () => {
    expect(() =>
      parseSep24Transaction({ kind: "withdrawal", status: "incomplete" }),
    ).toThrow(/missing required field: id/i);
  });

  it("throws when id is an empty string", () => {
    expect(() =>
      parseSep24Transaction({ id: "", kind: "withdrawal", status: "incomplete" }),
    ).toThrow(/missing required field: id/i);
  });

  it("throws when status is not a recognised SEP-0024 status value", () => {
    expect(() =>
      parseSep24Transaction({ id: "t1", kind: "withdrawal", status: "bogus_status" }),
    ).toThrow(/unrecognised status/i);
  });

  it("defaults status to 'incomplete' when status field is absent", () => {
    const tx = parseSep24Transaction({ id: "t1", kind: "withdrawal" });
    expect(tx.status).toBe("incomplete");
  });

  it("preserves amountOutAsset separately from assetCode", () => {
    const tx = parseSep24Transaction({
      id: "t1",
      kind: "withdrawal",
      status: "completed",
      amount_in_asset: "USDC",
      amount_out_asset: "EUR",
    });
    expect(tx.assetCode).toBe("USDC");
    expect(tx.amountOutAsset).toBe("EUR");
  });

  it("returns undefined for optional fields when absent", () => {
    const tx = parseSep24Transaction({ id: "t1", status: "incomplete" });
    expect(tx.message).toBeUndefined();
    expect(tx.externalTransactionId).toBeUndefined();
    expect(tx.amountIn).toBeUndefined();
    expect(tx.amountOut).toBeUndefined();
    expect(tx.assetCode).toBeUndefined();
    expect(tx.amountOutAsset).toBeUndefined();
    expect(tx.startedAt).toBeUndefined();
    expect(tx.completedAt).toBeUndefined();
    expect(tx.moreInfoUrl).toBeUndefined();
  });
});

/* ========================================================================== */
/* fetchSep24Transaction                                                         */
/* ========================================================================== */

describe("fetchSep24Transaction() – real implementation", () => {
  it("returns a parsed transaction on success", async () => {
    mockFetchOnce(200, {
      transaction: {
        id: "txn_abc",
        kind: "withdrawal",
        status: "completed",
        external_transaction_id: "BANK-99",
        amount_in: "50.00",
        amount_out: "49.50",
      },
    });

    const tx = await fetchSep24Transaction("https://anchor.example/sep24", "txn_abc");
    expect(tx.id).toBe("txn_abc");
    expect(tx.status).toBe("completed");
  });

  it("throws on non-2xx response", async () => {
    mockFetchOnce(404, { error: "Not found" });

    await expect(
      fetchSep24Transaction("https://anchor.example/sep24", "txn_missing"),
    ).rejects.toThrow(/HTTP 404/i);
  });

  it("throws when anchor returns 2xx but no transaction object in body", async () => {
    mockFetchOnce(200, { error: "nothing here" });

    await expect(
      fetchSep24Transaction("https://anchor.example/sep24", "txn_empty"),
    ).rejects.toThrow(/did not return a transaction object/i);
  });
});

/* ========================================================================== */
/* pollSep24Transaction                                                          */
/* ========================================================================== */

describe("pollSep24Transaction() – real implementation", () => {
  it("resolves immediately when first poll returns a terminal status", async () => {
    mockFetchOnce(200, {
      transaction: { id: "txn_1", kind: "withdrawal", status: "completed" },
    });

    const result = await pollSep24Transaction({
      transferServerUrl: "https://anchor.example/sep24",
      transactionId: "txn_1",
      intervalMs: 10,
      maxAttempts: 5,
    });

    expect(result.completed).toBe(true);
    expect(result.transaction.status).toBe("completed");
  });

  it("resolves with completed=false for 'refunded' terminal status", async () => {
    mockFetchOnce(200, {
      transaction: { id: "txn_2", kind: "withdrawal", status: "refunded" },
    });

    const result = await pollSep24Transaction({
      transferServerUrl: "https://anchor.example/sep24",
      transactionId: "txn_2",
      intervalMs: 10,
      maxAttempts: 5,
    });

    expect(result.completed).toBe(false);
    expect(result.transaction.status).toBe("refunded");
  });

  it("resolves with completed=false for 'expired' terminal status", async () => {
    mockFetchOnce(200, {
      transaction: { id: "txn_3", kind: "withdrawal", status: "expired" },
    });

    const result = await pollSep24Transaction({
      transferServerUrl: "https://anchor.example/sep24",
      transactionId: "txn_3",
      intervalMs: 10,
      maxAttempts: 5,
    });

    expect(result.completed).toBe(false);
    expect(result.transaction.status).toBe("expired");
  });

  it("resolves with completed=false for 'error' terminal status", async () => {
    mockFetchOnce(200, {
      transaction: { id: "txn_4", kind: "withdrawal", status: "error" },
    });

    const result = await pollSep24Transaction({
      transferServerUrl: "https://anchor.example/sep24",
      transactionId: "txn_4",
      intervalMs: 10,
      maxAttempts: 5,
    });

    expect(result.completed).toBe(false);
    expect(result.transaction.status).toBe("error");
  });

  it("calls onStatusChange only when status changes between polls", async () => {
    const onStatusChange = vi.fn();

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ transaction: { id: "t", kind: "withdrawal", status: "pending_anchor" } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ transaction: { id: "t", kind: "withdrawal", status: "pending_anchor" } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ transaction: { id: "t", kind: "withdrawal", status: "completed" } }),
      } as unknown as Response);

    vi.useFakeTimers({ shouldAdvanceTime: true });

    const promise = pollSep24Transaction({
      transferServerUrl: "https://anchor.example/sep24",
      transactionId: "t",
      intervalMs: 1,
      maxAttempts: 5,
      onStatusChange,
    });

    await promise;

    expect(onStatusChange).toHaveBeenCalledTimes(2);
    expect(onStatusChange.mock.calls[0][0].status).toBe("pending_anchor");
    expect(onStatusChange.mock.calls[1][0].status).toBe("completed");
  });

  it("throws after maxAttempts without reaching a terminal status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ transaction: { id: "t", kind: "withdrawal", status: "pending_anchor" } }),
    } as unknown as Response);

    vi.useFakeTimers({ shouldAdvanceTime: true });

    const promise = pollSep24Transaction({
      transferServerUrl: "https://anchor.example/sep24",
      transactionId: "t",
      intervalMs: 1,
      maxAttempts: 3,
    });

    await expect(promise).rejects.toThrow(/status check timed out after 3 attempts/i);
  });
});
