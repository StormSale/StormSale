import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import {
  enforceRoleMiddleware,
  createCampaignApi,
  generateSep10Challenge,
  verifySep10ChallengeResponse,
} from "../utils/api";
import * as Web3ContextModule from "../hooks/useWeb3";

describe("Role-Based Access Control (RBAC) & Route Guards Suite (#110)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Frontend Route Guards (ProtectedRoute)", () => {
    it("renders authentication required notice when wallet is not connected", () => {
      vi.spyOn(Web3ContextModule, "useWeb3").mockReturnValue({
        isConnected: false,
        userAddress: null,
        userRole: null,
        openWalletModal: vi.fn(),
        updateUserRole: vi.fn(),
      } as any);

      const html = renderToString(
        <ProtectedRoute requiredRole="ADVERTISER">
          <div data-testid="private-dashboard">Private Content</div>
        </ProtectedRoute>,
      );

      expect(html).toContain("Authentication Required");
      expect(html).toContain("Connect Stellar Wallet");
      expect(html).not.toContain("private-dashboard");
    });

    it("guides unregistered/new wallets to select and register their primary role first", () => {
      vi.spyOn(Web3ContextModule, "useWeb3").mockReturnValue({
        isConnected: true,
        userAddress: "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5",
        userRole: null, // New/unregistered wallet
        openWalletModal: vi.fn(),
        updateUserRole: vi.fn(),
      } as any);

      const html = renderToString(
        <ProtectedRoute requiredRole="ADVERTISER">
          <div data-testid="private-dashboard">Private Content</div>
        </ProtectedRoute>,
      );

      expect(html).toContain('data-testid="role-onboarding-card"');
      expect(html).toContain("Select Your Primary Role");
      expect(html).toContain("Register as Advertiser");
      expect(html).not.toContain("private-dashboard");
    });

    it("prevents user with role ADVERTISER from viewing Affiliate private dashboard (displays unauthorized banner)", () => {
      vi.spyOn(Web3ContextModule, "useWeb3").mockReturnValue({
        isConnected: true,
        userAddress: "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5",
        userRole: "ADVERTISER", // Active role is Advertiser
        openWalletModal: vi.fn(),
        updateUserRole: vi.fn(),
      } as any);

      const html = renderToString(
        <ProtectedRoute requiredRole="AFFILIATE">
          <div data-testid="affiliate-private-view">Affiliate Private Metrics</div>
        </ProtectedRoute>,
      );

      expect(html).toContain('data-testid="unauthorized-banner"');
      expect(html).toContain('role="alert"');
      expect(html).toContain("Access Restricted: Direct Page Bypass Detected");
      expect(html).toContain("ADVERTISER");
      expect(html).toContain("AFFILIATE");
      expect(html).toContain("Go to My ADVERTISER Dashboard");
      expect(html).toContain("Switch Role to AFFILIATE");
      expect(html).not.toContain("affiliate-private-view");
    });

    it("prevents user with role ADVERTISER from viewing Auditor private dashboard", () => {
      vi.spyOn(Web3ContextModule, "useWeb3").mockReturnValue({
        isConnected: true,
        userAddress: "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5",
        userRole: "ADVERTISER",
        openWalletModal: vi.fn(),
        updateUserRole: vi.fn(),
      } as any);

      const html = renderToString(
        <ProtectedRoute requiredRole="AUDITOR">
          <div data-testid="auditor-private-view">Compliance Vault</div>
        </ProtectedRoute>,
      );

      expect(html).toContain('data-testid="unauthorized-banner"');
      expect(html).toContain("AUDITOR");
      expect(html).not.toContain("auditor-private-view");
    });

    it("allows authorized users with matching role to access their private dashboard", () => {
      vi.spyOn(Web3ContextModule, "useWeb3").mockReturnValue({
        isConnected: true,
        userAddress: "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5",
        userRole: "ADVERTISER",
        openWalletModal: vi.fn(),
        updateUserRole: vi.fn(),
      } as any);

      const html = renderToString(
        <ProtectedRoute requiredRole="ADVERTISER">
          <div data-testid="private-dashboard">Welcome Advertiser</div>
        </ProtectedRoute>,
      );

      expect(html).toContain("private-dashboard");
      expect(html).toContain("Welcome Advertiser");
      expect(html).not.toContain("unauthorized-banner");
    });
  });

  describe("Backend Role Validation Middleware & API Guards (#110)", () => {
    it("enforceRoleMiddleware returns 403 Forbidden for unauthorized roles", () => {
      const affiliateResult = enforceRoleMiddleware("AFFILIATE", "ADVERTISER");
      expect(affiliateResult.authorized).toBe(false);
      expect(affiliateResult.status).toBe(403);
      expect(affiliateResult.error).toContain("403 Forbidden");

      const unregisteredResult = enforceRoleMiddleware(null, "ADVERTISER");
      expect(unregisteredResult.authorized).toBe(false);
      expect(unregisteredResult.status).toBe(403);
    });

    it("enforceRoleMiddleware returns authorized status for matching role", () => {
      const result = enforceRoleMiddleware("ADVERTISER", "ADVERTISER");
      expect(result.authorized).toBe(true);
      expect(result.status).toBe(200);
    });

    it("backend returns 403 Forbidden when a non-advertiser wallet attempts to dispatch advertiser actions", async () => {
      await expect(
        createCampaignApi("GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5", "AFFILIATE", {
          name: "Test Campaign",
          budgetAmount: 1000,
          commissionRatePercent: 10,
          clearingPeriodSecs: 604800,
        }),
      ).rejects.toThrow(/403 Forbidden/);
    });

    it("backend returns 403 Forbidden when an unregistered wallet attempts to dispatch advertiser actions", async () => {
      await expect(
        createCampaignApi("GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5", null, {
          name: "Test Campaign",
          budgetAmount: 1000,
          commissionRatePercent: 10,
          clearingPeriodSecs: 604800,
        }),
      ).rejects.toThrow(/403 Forbidden/);
    });
  });

  describe("SEP-0010 Challenge Verification Architecture", () => {
    it("generates cryptographic SEP-0010 challenge token with client address", () => {
      const server = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBSERVER";
      const client = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBCLIENT";

      const challenge = generateSep10Challenge(server, client);
      expect(challenge.transaction).toContain(server);
      expect(challenge.transaction).toContain(client);
      expect(challenge.networkPassphrase).toContain("Test SDF Network");
    });

    it("verifies SEP-0010 challenge response containing expected client signature", () => {
      const client = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBCLIENT";
      const validToken = `SIGNED_TRANSACTION_PAYLOAD_${client}_SIGNATURE`;

      expect(verifySep10ChallengeResponse(validToken, client)).toBe(true);
      expect(verifySep10ChallengeResponse(validToken, "OTHER_CLIENT_KEY")).toBe(false);
    });
  });
});
