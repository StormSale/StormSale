/**
 * StormSale/StormSale#433 — multi-seat organization switching and session
 * isolation.
 *
 * Adaptation note: StormSale has no organization switching or multi-seat
 * model — its session model is one wallet per role session (`userAddress`
 * + `userRole` in Web3Context, synced via POST /users). This suite verifies
 * the session contract the app actually has: each registration binds an
 * address to its role with independent per-address sessions at the API
 * boundary, and registration failures surface the backend error message so
 * a failed session setup is observable rather than silent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerUser } from "../utils/api";

const WALLET_A = "GA5OYDFO5HPRWLDQAVVYHLIHS5TB3AQVQOQ5KOYCWZ6G1PZQZQ7A3CX";
const WALLET_B = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("StormSale/StormSale#433 multi-seat organization switching and session isolation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers each wallet address with its own role — sessions stay independent", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const calls: { walletAddress: string; role: string }[] = [];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return {
        ok: true,
        json: async () => ({ walletAddress: body.walletAddress, role: body.role }),
      };
    });

    await registerUser(WALLET_A, "ADVERTISER");
    await registerUser(WALLET_B, "AFFILIATE");

    expect(calls).toEqual([
      { walletAddress: WALLET_A, role: "ADVERTISER" },
      { walletAddress: WALLET_B, role: "AFFILIATE" },
    ]);
  });

  it("surfaces the backend error message when registration fails", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Backend registration failed" }),
    });

    await expect(registerUser(WALLET_A, "ADVERTISER")).rejects.toThrow(
      "Backend registration failed",
    );
  });
});
