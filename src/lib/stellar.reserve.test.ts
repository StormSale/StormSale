import { describe, it, expect, vi, afterEach } from "vitest";
import {
  STELLAR_BASE_RESERVE_XLM,
  calculateAccountReserve,
  calculateReserveBreakdown,
  calculateSpendableBalance,
  fetchStellarAccountDetails,
} from "./stellar";

const VALID_PUBLIC_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("calculateAccountReserve", () => {
  it("uses the base reserve constant of 0.5 XLM", () => {
    expect(STELLAR_BASE_RESERVE_XLM).toBe(0.5);
  });

  it("computes (2 + subentries) * base_reserve", () => {
    expect(calculateAccountReserve(0)).toBe(1);
    expect(calculateAccountReserve(1)).toBe(1.5);
    expect(calculateAccountReserve(3)).toBe(2.5);
    expect(calculateAccountReserve(56)).toBe(29);
  });

  it("accounts for sponsored and sponsoring reserves", () => {
    expect(calculateAccountReserve(0, { numSponsoring: 2 })).toBe(2);
    expect(calculateAccountReserve(5, { numSponsored: 3 })).toBe(2);
  });

  it("clamps negative and non-finite subentry counts", () => {
    expect(calculateAccountReserve(-4)).toBe(1);
    expect(calculateAccountReserve(Number.NaN)).toBe(1);
  });

  it("honors a custom base reserve", () => {
    expect(calculateAccountReserve(2, { baseReserveXlm: 1 })).toBe(4);
  });
});

describe("calculateReserveBreakdown", () => {
  it("returns balance, reserve, and spendable balance", () => {
    const breakdown = calculateReserveBreakdown(10, 4);
    expect(breakdown.reserveXlm).toBe(3);
    expect(breakdown.spendableXlm).toBe(7);
    expect(breakdown.subentries).toBe(4);
    expect(breakdown.balanceXlm).toBe(10);
  });

  it("never reports a negative spendable balance", () => {
    expect(calculateSpendableBalance(2, 4)).toBe(0);
    expect(calculateSpendableBalance("1.0000000", 0)).toBe(0);
  });

  it("handles string balances from Horizon", () => {
    expect(calculateSpendableBalance("100.5000000", 1)).toBe(99);
  });

  it("treats malformed balances as zero", () => {
    expect(calculateSpendableBalance("not-a-number", 0)).toBe(0);
  });
});

describe("fetchStellarAccountDetails", () => {
  it("derives reserve and spendable balance from Horizon account data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse({
          subentry_count: 2,
          num_sponsoring: 0,
          num_sponsored: 0,
          balances: [
            { asset_type: "native", balance: "100.0000000" },
            { asset_type: "credit_alphanum4", balance: "25.0000000" },
          ],
        }),
      ),
    );

    const details = await fetchStellarAccountDetails(VALID_PUBLIC_KEY);
    expect(details.status).toBe("active");
    expect(details.exists).toBe(true);
    expect(details.balanceXlm).toBe(100);
    expect(details.subentries).toBe(2);
    expect(details.trustlineCount).toBe(1);
    expect(details.reserveXlm).toBe(2);
    expect(details.spendableXlm).toBe(98);
  });

  it("returns a zeroed snapshot for unfunded accounts (404)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, 404)));

    const details = await fetchStellarAccountDetails(VALID_PUBLIC_KEY);
    expect(details.status).toBe("unfunded");
    expect(details.exists).toBe(false);
    expect(details.balanceXlm).toBe(0);
    expect(details.reserveXlm).toBe(1);
    expect(details.spendableXlm).toBe(0);
  });

  it("degrades gracefully when Horizon is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const details = await fetchStellarAccountDetails(VALID_PUBLIC_KEY);
    expect(details.status).toBe("unavailable");
    expect(details.exists).toBe(false);
    expect(details.spendableXlm).toBe(0);
  });
});
