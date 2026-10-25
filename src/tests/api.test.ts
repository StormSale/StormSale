import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerUser,
  fetchCampaign,
  fetchConversions,
  enforceRoleMiddleware,
  createCampaignApi,
  generateSep10Challenge,
  verifySep10ChallengeResponse,
} from "../utils/api";

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

    it("rejects invalid non-string campaignId", async () => {
      // @ts-expect-error test invalid type
      await expect(fetchConversions(123)).rejects.toThrow("Invalid campaign ID");
    });
  });

  describe("enforceRoleMiddleware", () => {
    it("authorizes when caller has required role", () => {
      const res = enforceRoleMiddleware("ADVERTISER", "ADVERTISER");
      expect(res.authorized).toBe(true);
      expect(res.status).toBe(200);
    });

    it("authorizes when caller role is one of multiple allowed roles", () => {
      const res = enforceRoleMiddleware("admin", ["ADVERTISER", "ADMIN"]);
      expect(res.authorized).toBe(true);
      expect(res.status).toBe(200);
    });

    it("rejects when caller has wrong role", () => {
      const res = enforceRoleMiddleware("AFFILIATE", "ADVERTISER");
      expect(res.authorized).toBe(false);
      expect(res.status).toBe(403);
      expect(res.error).toContain("403 Forbidden");
    });

    it("rejects when caller role is null or undefined", () => {
      const res = enforceRoleMiddleware(null, "ADVERTISER");
      expect(res.authorized).toBe(false);
      expect(res.status).toBe(403);
    });
  });

  describe("createCampaignApi", () => {
    const payload = {
      name: "New Campaign",
      budgetAmount: 1000,
      commissionRatePercent: 10,
      clearingPeriodSecs: 86400,
    };

    it("throws 403 when user is not advertiser", async () => {
      await expect(createCampaignApi(validPublicKey, "AFFILIATE", payload)).rejects.toThrow(/403/);
    });

    it("successfully creates campaign when user is advertiser", async () => {
      const mockResult = { success: true, campaignId: "camp-123" };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResult,
      });

      const res = await createCampaignApi(validPublicKey, "ADVERTISER", payload);
      expect(res).toEqual(mockResult);
    });

    it("throws error when backend returns 403", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden role" }),
      });

      await expect(createCampaignApi(validPublicKey, "ADVERTISER", payload)).rejects.toThrow(
        "Forbidden role",
      );
    });

    it("throws error when backend returns 500", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server failure" }),
      });

      await expect(createCampaignApi(validPublicKey, "ADVERTISER", payload)).rejects.toThrow(
        "Server failure",
      );
    });
  });

  describe("SEP-0010 helpers", () => {
    it("generates challenge token with valid parameters", () => {
      const challenge = generateSep10Challenge(validPublicKey, validPublicKey);
      expect(challenge.transaction).toContain("SEP10_CHALLENGE");
      expect(challenge.networkPassphrase).toContain("Test SDF Network");
    });

    it("throws if serverAddress or clientAddress is missing", () => {
      expect(() => generateSep10Challenge("", validPublicKey)).toThrow();
    });

    it("verifies challenge response matching expected client address", () => {
      const challenge = generateSep10Challenge(validPublicKey, validPublicKey);
      expect(verifySep10ChallengeResponse(challenge.transaction, validPublicKey)).toBe(true);
      expect(verifySep10ChallengeResponse(challenge.transaction, "GOTHERKEY")).toBe(false);
      expect(verifySep10ChallengeResponse("", validPublicKey)).toBe(false);
    });
  });
});
