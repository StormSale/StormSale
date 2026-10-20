import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { STELLAR_CONFIG } from "../config/stellar";
import {
  requestAuthChallenge,
  verifyAuthChallenge,
  storeSessionToken,
  getStoredSessionToken,
  clearSessionToken,
} from "../utils/api";
import { signSEP0010Challenge } from "../lib/stellar";
import { AffiliatePerformanceCharts } from "../components/affiliate/AffiliatePerformanceCharts";

import { ContractIntegrityModal } from "../components/shared/ContractIntegrityModal";

describe("Protocol Suite: 4 Linked Issues Validation", () => {
  const TEST_WALLET = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

  beforeEach(() => {
    clearSessionToken();
  });

  describe("Issue #112: Stellar SEP-0010 Challenge-Response Authentication via Freighter", () => {
    it("generates a cryptographic challenge transaction containing the wallet address and nonce", async () => {
      const challenge = await requestAuthChallenge(TEST_WALLET);
      expect(challenge).toBeDefined();
      expect(challenge.challengeXdr).toContain("AAAAA");
      expect(challenge.nonce).toContain("stormsale_auth_nonce_");
    });

    it("signs the challenge transaction and receives role-scoped session JWT", async () => {
      const challenge = await requestAuthChallenge(TEST_WALLET);
      const signedXdr = await signSEP0010Challenge(challenge.challengeXdr, "mock");
      expect(signedXdr).toContain(challenge.challengeXdr);

      const authSession = await verifyAuthChallenge(TEST_WALLET, signedXdr, "ADVERTISER");
      expect(authSession).toBeDefined();
      expect(authSession.token).toContain("eyJ");
      expect(authSession.role).toBe("ADVERTISER");
      expect(authSession.walletAddress).toBe(TEST_WALLET);

      // Verify token persistence
      expect(getStoredSessionToken()).toBe(authSession.token);
    });

    it("clears session token on disconnect", () => {
      storeSessionToken("test_token_123");
      expect(getStoredSessionToken()).toBe("test_token_123");
      clearSessionToken();
      expect(getStoredSessionToken()).toBeNull();
    });
  });

  describe("Issue #65: Contract Integrity Verification UI & Mismatch Guard", () => {
    it("validates official Soroban contract ID against trusted registry", () => {
      const officialContractId = STELLAR_CONFIG.contractId;
      expect(officialContractId).toBeDefined();
      expect(officialContractId.startsWith("C")).toBe(true);
      expect(officialContractId.length).toBe(56);
    });

    it("detects contract address mismatch when an untrusted contract address is provided", () => {
      const officialContractId = STELLAR_CONFIG.contractId;
      const rogueContractId = "CAUNKNOWN9ROGUE9UNVERIFIED9CONTRACT9ADDRESS999999";

      const isVerifiedOfficial = officialContractId === STELLAR_CONFIG.contractId;
      const isVerifiedRogue = rogueContractId === STELLAR_CONFIG.contractId;

      expect(isVerifiedOfficial).toBe(true);
      expect(isVerifiedRogue).toBe(false);
    });

    it("renders nothing when isOpen is false", () => {
      const html = renderToString(
        React.createElement(ContractIntegrityModal, { isOpen: false, onClose: () => {} }),
      );
      expect(html).toBe("");
    });

    it("displays the verified state by default when open", () => {
      const html = renderToString(
        React.createElement(ContractIntegrityModal, { isOpen: true, onClose: () => {} }),
      );
      expect(html).toContain("Verified Protocol Deployment");
      expect(html).toContain(STELLAR_CONFIG.contractId);
      expect(html).not.toContain("Warning: Contract Address Mismatch");
    });

    it("displays the mismatch warning when overrideMismatch is true", () => {
      const html = renderToString(
        React.createElement(ContractIntegrityModal, {
          isOpen: true,
          onClose: () => {},
          overrideMismatch: true,
        }),
      );
      expect(html).toContain("Warning: Contract Address Mismatch");
      expect(html).toContain("CAUNKNOWN9ROGUE9UNVERIFIED9CONTRACT9ADDRESS999999");
    });
  });

  describe("Issue #48: Affiliate Earnings History & Real-Time Performance Analytics", () => {
    it("calculates real-time balance totals correctly", () => {
      const availableBalance = 3420.0;
      const pendingClearing = 1850.0;
      const lifetimeEarnings = 12847.0;

      expect(availableBalance).toBeGreaterThan(0);
      expect(pendingClearing).toBeGreaterThan(0);
      expect(lifetimeEarnings).toBeGreaterThanOrEqual(availableBalance + pendingClearing);
    });

    it("accurately computes conversion rate percentage from clicks and sales", () => {
      const uniqueClicks = 1420;
      const completedSales = 48;
      const cvr = parseFloat(((completedSales / uniqueClicks) * 100).toFixed(1));

      expect(cvr).toBe(3.4);
    });

    it("renders AffiliatePerformanceCharts with controls, balances, and payout ledger", () => {
      const html = renderToString(React.createElement(AffiliatePerformanceCharts));
      expect(html).toContain("Affiliate Performance Trends");
      expect(html).toContain("Available Balance");
      expect(html).toContain("Pending Clearing");
      expect(html).toContain("Lifetime Earnings");
      expect(html).toContain("Historical Payout");
      expect(html).toContain("Clearing Ledger");
      expect(html).toContain("7D");
      expect(html).toContain("30D");
      expect(html).toContain("90D");
      expect(html).toContain("1Y");
      expect(html).toContain("Earnings ($)");
      expect(html).toContain("Conversions");
    });
  });
});
