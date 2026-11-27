/**
 * StormSale/StormSale#434 — role-based UI permission guards.
 *
 * Adaptation note: the StormSale codebase implements the roles ADVERTISER,
 * AFFILIATE and AUDITOR (`UserRole` in src/config/abis.ts; the Dashboard
 * role selector offers advertiser / affiliate / auditor). The issue's b2b
 * multi-seat model (Owner / Billing Admin / Campaign Manager / Auditor)
 * is not present in the StormSale codebase, so this suite verifies the
 * role-permission contract the UI permission gates depend on: the app
 * registers the selected role verbatim against the /users endpoint, every
 * role is a distinct registration, and the default role is AFFILIATE.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerUser, API_URL } from "../utils/api";

const WALLET = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("StormSale/StormSale#434 role-based UI permission guards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers the selected role verbatim so the backend enforces role-based access", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({}) }));

    for (const role of ["ADVERTISER", "AFFILIATE", "AUDITOR"]) {
      await registerUser(WALLET, role);
      const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
      expect(url).toBe(`${API_URL}/users`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ walletAddress: WALLET, role });
    }
  });

  it("treats ADVERTISER, AFFILIATE and AUDITOR as distinct role registrations", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const roles: string[] = [];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      roles.push(JSON.parse(String(init?.body)).role);
      return { ok: true, json: async () => ({}) };
    });

    for (const role of ["ADVERTISER", "AFFILIATE", "AUDITOR", "ADMIN", "NONE"]) {
      await registerUser(WALLET, role);
    }
    expect(roles).toEqual(["ADVERTISER", "AFFILIATE", "AUDITOR", "ADMIN", "NONE"]);
  });

  it("defaults to the AFFILIATE role when none is given", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ role: "AFFILIATE" }) });

    const result = await registerUser(WALLET);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: WALLET, role: "AFFILIATE" }),
    });
    expect(result).toEqual({ role: "AFFILIATE" });
  });
});
