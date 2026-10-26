// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStoredSessionToken,
  storeSessionToken,
  clearSessionToken,
  requestAuthChallenge,
  verifyAuthChallenge,
  registerUser,
  fetchCampaign,
  fetchConversions,
  enforceRoleMiddleware,
  createCampaignApi,
  generateSep10Challenge,
  verifySep10ChallengeResponse,
} from "../utils/api";

describe("API Utilities and Role Enforcement Suite", () => {
  const TEST_WALLET = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const OTHER_WALLET = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

  beforeEach(() => {
    clearSessionToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearSessionToken();
    vi.restoreAllMocks();
  });

  describe("Session Token Management", () => {
    it("stores, retrieves, and clears tokens in localStorage and memory fallback", () => {
      expect(getStoredSessionToken()).toBeNull();

      storeSessionToken("token_abc_123");
      expect(getStoredSessionToken()).toBe("token_abc_123");

      clearSessionToken();
      expect(getStoredSessionToken()).toBeNull();
    });

    it("verifies wallet address binding to stored session token", () => {
      storeSessionToken("token_wallet_scoped", TEST_WALLET);

      // Matches exact wallet
      expect(getStoredSessionToken(TEST_WALLET)).toBe("token_wallet_scoped");
      // Matches case-insensitively
      expect(getStoredSessionToken(TEST_WALLET.toLowerCase())).toBe("token_wallet_scoped");
      // Rejects mismatched wallet address
      expect(getStoredSessionToken(OTHER_WALLET)).toBeNull();
    });

    it("handles storage exceptions gracefully", () => {
      const originalGetItem = localStorage.getItem;
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;

      localStorage.getItem = vi.fn().mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
      localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
      localStorage.removeItem = vi.fn().mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });

      // Should not throw and fallback to inMemory
      storeSessionToken("fallback_token", TEST_WALLET);
      expect(getStoredSessionToken(TEST_WALLET)).toBe("fallback_token");

      clearSessionToken();
      expect(getStoredSessionToken()).toBeNull();

      localStorage.getItem = originalGetItem;
      localStorage.setItem = originalSetItem;
      localStorage.removeItem = originalRemoveItem;
    });
  });

  describe("Authentication Challenge and Verification", () => {
    it("requests challenge from backend API when available", async () => {
      const mockChallenge = {
        challengeXdr: "AAAAAGNoYWxsZW5nZQA=",
        nonce: "test_nonce_123",
      };
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockChallenge,
      } as any);

      const challenge = await requestAuthChallenge(TEST_WALLET);
      expect(challenge.challengeXdr).toBe("AAAAAGNoYWxsZW5nZQA=");
      expect(challenge.nonce).toBe("test_nonce_123");
    });

    it("falls back to simulated challenge if backend is unreachable", async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

      const challenge = await requestAuthChallenge(TEST_WALLET);
      expect(challenge.challengeXdr).toContain("AAAAA");
      expect(challenge.nonce).toContain("stormsale_auth_nonce_");
    });

    it("submits challenge verification to backend when available", async () => {
      const mockAuthSession = {
        token: "jwt_token_backend",
        walletAddress: TEST_WALLET,
        role: "AFFILIATE",
        expiresAt: Date.now() + 86400000,
      };
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuthSession,
      } as any);

      const res = await verifyAuthChallenge(TEST_WALLET, "signed_xdr_payload", "AFFILIATE");
      expect(res.token).toBe("jwt_token_backend");
      expect(getStoredSessionToken(TEST_WALLET)).toBe("jwt_token_backend");
    });

    it("falls back to client-generated signed session token when backend verify fails", async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Offline"));

      const res = await verifyAuthChallenge(TEST_WALLET, "mock_signature_xdr12345", "ADVERTISER");
      expect(res.token).toContain("eyJ");
      expect(res.role).toBe("ADVERTISER");
      expect(res.walletAddress).toBe(TEST_WALLET);
      expect(getStoredSessionToken(TEST_WALLET)).toBe(res.token);
    });
  });

  describe("User Registration & API Endpoints", () => {
    it("registers user successfully with session token header", async () => {
      storeSessionToken("session_header_token");
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          walletAddress: TEST_WALLET,
          role: "AFFILIATE",
        }),
      } as any);

      const result = await registerUser(TEST_WALLET, "AFFILIATE");
      expect(result.success).toBe(true);
      expect(result.role).toBe("AFFILIATE");
    });

    it("throws on registration failure with backend error response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Registration rejected by compliance" }),
      } as any);

      await expect(registerUser(TEST_WALLET, "AFFILIATE")).rejects.toThrow(
        "Registration rejected by compliance",
      );
    });

    it("fetches campaign metadata by ID and handles invalid IDs or network errors", async () => {
      await expect(fetchCampaign("")).rejects.toThrow("Invalid campaign ID");
      await expect(fetchCampaign("   ")).rejects.toThrow("Invalid campaign ID");

      // Successful fetch
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "camp_1",
          name: "Test Campaign",
          description: "Description",
          rewardRate: 10,
          token: "USDC",
        }),
      } as any);

      const camp = await fetchCampaign("camp_1");
      expect(camp).not.toBeNull();
      expect(camp?.name).toBe("Test Campaign");

      // 404 response
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as any);
      expect(await fetchCampaign("camp_missing")).toBeNull();

      // Exception response
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network fail"));
      expect(await fetchCampaign("camp_error")).toBeNull();
    });

    it("fetches conversions list with optional campaign filter", async () => {
      await expect(fetchConversions("")).rejects.toThrow("Invalid campaign ID");

      // Successful fetch
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "conv_1",
            customerRef: "cust_123",
            affiliateAddress: TEST_WALLET,
            affiliateName: "Top Affiliate",
            campaignId: "camp_1",
            campaignName: "Summer Campaign",
            amount: 100,
            timestamp: "2026-10-26T12:00:00Z",
          },
        ],
      } as any);

      const conversions = await fetchConversions("camp_1");
      expect(conversions.length).toBe(1);
      expect(conversions[0].id).toBe("conv_1");

      // Without campaign ID
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any);
      const allConversions = await fetchConversions();
      expect(allConversions).toEqual([]);

      // Error responses
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false } as any);
      expect(await fetchConversions("camp_1")).toEqual([]);

      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Net error"));
      expect(await fetchConversions("camp_1")).toEqual([]);
    });
  });

  describe("Role Enforcement Middleware & Campaign Creation API (#110)", () => {
    it("validates role permissions correctly", () => {
      expect(enforceRoleMiddleware(null, "ADVERTISER").authorized).toBe(false);
      expect(enforceRoleMiddleware("AFFILIATE", "ADVERTISER").authorized).toBe(false);
      expect(enforceRoleMiddleware("AFFILIATE", "ADVERTISER").status).toBe(403);

      expect(enforceRoleMiddleware("ADVERTISER", "ADVERTISER").authorized).toBe(true);
      expect(enforceRoleMiddleware("advertiser", "ADVERTISER").authorized).toBe(true);
      expect(enforceRoleMiddleware("ADMIN", ["ADVERTISER", "ADMIN"]).authorized).toBe(true);
    });

    it("blocks campaign creation if caller does not possess ADVERTISER role", async () => {
      const payload = {
        name: "Restricted Campaign",
        budgetAmount: 1000,
        commissionRatePercent: 10,
        clearingPeriodSecs: 86400,
      };

      await expect(createCampaignApi(TEST_WALLET, "AFFILIATE", payload)).rejects.toThrow(
        /403 Forbidden/,
      );
    });

    it("dispatches campaign creation successfully for ADVERTISER", async () => {
      const payload = {
        name: "Allowed Campaign",
        budgetAmount: 500,
        commissionRatePercent: 12,
        clearingPeriodSecs: 86400,
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, campaignId: 42 }),
      } as any);

      const res = await createCampaignApi(TEST_WALLET, "ADVERTISER", payload);
      expect(res.success).toBe(true);
      expect(res.campaignId).toBe(42);
    });

    it("handles backend 403 Forbidden and general errors on campaign creation", async () => {
      const payload = {
        name: "Forbidden Campaign",
        budgetAmount: 500,
        commissionRatePercent: 12,
        clearingPeriodSecs: 86400,
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Backend rejected advertiser authorization" }),
      } as any);

      await expect(createCampaignApi(TEST_WALLET, "ADVERTISER", payload)).rejects.toThrow(
        "Backend rejected advertiser authorization",
      );

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      } as any);

      await expect(createCampaignApi(TEST_WALLET, "ADVERTISER", payload)).rejects.toThrow(
        "Internal server error",
      );
    });
  });

  describe("SEP-0010 Challenge Generators & Verifiers", () => {
    it("generates SEP-0010 challenge tokens and throws on missing addresses", () => {
      expect(() => generateSep10Challenge("", TEST_WALLET)).toThrow(
        "Both server and client addresses are required",
      );
      expect(() => generateSep10Challenge(TEST_WALLET, "")).toThrow(
        "Both server and client addresses are required",
      );

      const challenge = generateSep10Challenge("GBSERVER123", TEST_WALLET);
      expect(challenge.transaction).toContain("SEP10_CHALLENGE_GBSERVER123_");
      expect(challenge.transaction).toContain(TEST_WALLET);
      expect(challenge.networkPassphrase).toContain("Test SDF Network");
    });

    it("verifies SEP-0010 challenge responses", () => {
      expect(verifySep10ChallengeResponse("", TEST_WALLET)).toBe(false);
      expect(verifySep10ChallengeResponse("SOME_TX", "")).toBe(false);
      expect(verifySep10ChallengeResponse("TX_CONTAINING_" + TEST_WALLET, TEST_WALLET)).toBe(true);
      expect(verifySep10ChallengeResponse("TX_CONTAINING_ANOTHER", TEST_WALLET)).toBe(false);
    });
  });
});
