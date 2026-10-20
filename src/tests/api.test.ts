import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerUser, fetchCampaign, fetchConversions } from "../utils/api";

describe("API Boundary Validation Suite (#74)", () => {
  const validPublicKey = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("registerUser", () => {
    it("successfully registers user with valid Stellar address", async () => {
      const mockResponse = { id: 1, walletAddress: validPublicKey, role: "AFFILIATE" };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const res = await registerUser(validPublicKey, "AFFILIATE");
      expect(res).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid wallet address before network call", async () => {
      globalThis.fetch = vi.fn();

      await expect(registerUser("SHORT_INVALID", "AFFILIATE")).rejects.toThrow();
      await expect(
        registerUser("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", "AFFILIATE"),
      ).rejects.toThrow();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("throws error when backend responds with non-ok status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Address already registered" }),
      });

      await expect(registerUser(validPublicKey, "AFFILIATE")).rejects.toThrow(
        "Address already registered",
      );
    });
  });

  describe("fetchCampaign", () => {
    it("returns parsed campaign metadata when successful", async () => {
      const campaignData = { id: "1", name: "Summer Campaign" };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => campaignData,
      });

      const res = await fetchCampaign("1");
      expect(res).toEqual(campaignData);
    });

    it("returns null when API returns 404/non-ok", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const res = await fetchCampaign("9999");
      expect(res).toBeNull();
    });

    it("rejects empty campaignId", async () => {
      await expect(fetchCampaign("")).rejects.toThrow("Invalid campaign ID");
    });
  });

  describe("fetchConversions", () => {
    it("returns validated conversions array", async () => {
      const conversionsData = [
        {
          id: "tx-1",
          customerRef: "CUST_1",
          affiliateAddress: validPublicKey,
          affiliateName: "Alice",
          campaignId: "CAMP_1",
          campaignName: "Test Campaign",
          amount: 250,
          timestamp: "2026-01-01T00:00:00Z",
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => conversionsData,
      });

      const res = await fetchConversions("CAMP_1");
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("tx-1");
    });

    it("returns empty array on error or non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const res = await fetchConversions("CAMP_1");
      expect(res).toEqual([]);
    });

    it("returns empty array if response data fails schema validation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ invalid: "data" }], // Missing required conversion fields
      });

      const res = await fetchConversions();
      expect(res).toEqual([]);
    });
  });
});
