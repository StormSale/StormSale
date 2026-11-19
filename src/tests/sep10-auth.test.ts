// @vitest-environment jsdom
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

// Fix jsdom Uint8Array cross-realm mismatch with node modules (@stellar/js-xdr)
if (typeof TextEncoder !== "undefined") {
  const origEncode = TextEncoder.prototype.encode;
  TextEncoder.prototype.encode = function (input?: string) {
    const arr = origEncode.call(this, input);
    return Buffer.from(arr);
  };
}

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  buildSep10ChallengeTransaction,
  verifySep10SignedChallenge,
  issueRoleScopedJwt,
  verifyJwtToken,
  authenticateWithSep10,
  saveSep10Session,
  getActiveSep10Session,
  clearSep10Session,
  SEP10_DEFAULT_HOME_DOMAIN,
} from "../lib/sep10Auth";
import { Web3Provider, useWeb3 } from "../context/Web3Context";

const mockSignFreighter = vi.fn();
vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/stellar")>();
  return {
    ...actual,
    checkFreighterInstalled: vi.fn().mockResolvedValue(true),
    connectFreighterWallet: vi
      .fn()
      .mockResolvedValue("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    signFreighterTransaction: (xdr: string, opts: any) => mockSignFreighter(xdr, opts),
  };
});

vi.mock("../utils/api", () => ({
  registerUser: vi
    .fn()
    .mockImplementation((addr, role) =>
      Promise.resolve({ success: true, address: addr, role: role || "affiliate" }),
    ),
}));

describe("Stellar SEP-0010 Challenge-Response Authentication Suite (#112)", () => {
  const testClient = Keypair.random();
  const clientAddress = testClient.publicKey();
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    localStorageMock = {};
    const mockStorage = {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        localStorageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
      length: 0,
      key: () => null,
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /* =========================================================================
     1. CHALLENGE TRANSACTION GENERATION
     ========================================================================= */

  describe("Challenge Transaction Generation", () => {
    it("generates a cryptographically valid SEP-0010 challenge transaction", () => {
      const challenge = buildSep10ChallengeTransaction(clientAddress, SEP10_DEFAULT_HOME_DOMAIN);

      expect(challenge.transactionXdr).toBeDefined();
      expect(typeof challenge.transactionXdr).toBe("string");
      expect(challenge.serverPublicKey).toBeDefined();
      expect(challenge.clientPublicKey).toBe(clientAddress);
      expect(challenge.nonce).toHaveLength(64);
      expect(challenge.networkPassphrase).toBe(Networks.TESTNET);
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    });

    it("throws an error if client address is missing", () => {
      expect(() => {
        buildSep10ChallengeTransaction("");
      }).toThrow("Client Stellar address is required to construct SEP-0010 challenge.");
    });
  });

  /* =========================================================================
     2. SIGNATURE VERIFICATION
     ========================================================================= */

  describe("SEP-0010 Challenge Verification", () => {
    it("verifies a validly dual-signed challenge transaction", () => {
      const challenge = buildSep10ChallengeTransaction(clientAddress, SEP10_DEFAULT_HOME_DOMAIN);

      // Client signs the challenge transaction
      const { Transaction } = require("@stellar/stellar-sdk");
      const tx = new Transaction(challenge.transactionXdr, challenge.networkPassphrase);
      tx.sign(testClient);
      const signedXdr = tx.toXDR();

      const result = verifySep10SignedChallenge(
        signedXdr,
        clientAddress,
        challenge.serverPublicKey,
        challenge.networkPassphrase,
      );

      expect(result.valid).toBe(true);
      expect(result.clientAddress).toBe(clientAddress);
    });

    it("verifies mock simulated signed challenges", () => {
      const mockXdr = `MOCK_SIGNED_${clientAddress}_nonce123`;
      const result = verifySep10SignedChallenge(mockXdr, clientAddress);

      expect(result.valid).toBe(true);
      expect(result.clientAddress).toBe(clientAddress);
    });

    it("rejects challenge when client signature is missing", () => {
      const challenge = buildSep10ChallengeTransaction(clientAddress, SEP10_DEFAULT_HOME_DOMAIN);
      // Unsigned by client (only signed by server)
      const result = verifySep10SignedChallenge(
        challenge.transactionXdr,
        clientAddress,
        challenge.serverPublicKey,
        challenge.networkPassphrase,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing or invalid client signature");
    });

    it("rejects challenge signed by a different unmatching keypair", () => {
      const rogueKey = Keypair.random();
      const challenge = buildSep10ChallengeTransaction(clientAddress, SEP10_DEFAULT_HOME_DOMAIN);

      const { Transaction } = require("@stellar/stellar-sdk");
      const tx = new Transaction(challenge.transactionXdr, challenge.networkPassphrase);
      tx.sign(rogueKey);
      const signedXdr = tx.toXDR();

      const result = verifySep10SignedChallenge(
        signedXdr,
        clientAddress,
        challenge.serverPublicKey,
        challenge.networkPassphrase,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing or invalid client signature");
    });
  });

  /* =========================================================================
     3. ROLE-SCOPED JWT ISSUANCE & VERIFICATION
     ========================================================================= */

  describe("Role-Scoped JWT Issuance and Verification", () => {
    it("issues and validates a role-scoped JWT token", () => {
      const token = issueRoleScopedJwt(clientAddress, "advertiser", SEP10_DEFAULT_HOME_DOMAIN);

      expect(typeof token).toBe("string");
      const parts = token.split(".");
      expect(parts).toHaveLength(3);

      const verified = verifyJwtToken(token);
      expect(verified.valid).toBe(true);
      expect(verified.payload?.sub).toBe(clientAddress);
      expect(verified.payload?.role).toBe("advertiser");
      expect(verified.payload?.iss).toBe(SEP10_DEFAULT_HOME_DOMAIN);
      expect(verified.payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("rejects tampered JWT tokens", () => {
      const token = issueRoleScopedJwt(clientAddress, "affiliate");
      const parts = token.split(".");

      // Tamper with payload
      const tamperedPayload = btoa(JSON.stringify({ sub: clientAddress, role: "admin_superuser" }));
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const res = verifyJwtToken(tamperedToken);
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Invalid token signature");
    });

    it("rejects expired JWT tokens", () => {
      // Issue token with 0 second expiration
      const expiredToken = issueRoleScopedJwt(
        clientAddress,
        "affiliate",
        SEP10_DEFAULT_HOME_DOMAIN,
        -10,
      );

      const res = verifyJwtToken(expiredToken);
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Token has expired");
    });
  });

  /* =========================================================================
     4. FREIGHTER CHALLENGE AUTHENTICATION WORKFLOW
     ========================================================================= */

  describe("End-to-End SEP-0010 Authentication Flow", () => {
    it("completes mock SEP-0010 authentication flow seamlessly", async () => {
      const res = await authenticateWithSep10(clientAddress, "merchant", true);

      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();
      expect(res.session?.role).toBe("merchant");
      expect(res.session?.address).toBe(clientAddress);

      const stored = getActiveSep10Session();
      expect(stored?.token).toBe(res.token);
    });

    it("completes Freighter SEP-0010 authentication flow when signed", async () => {
      mockSignFreighter.mockImplementationOnce(async (xdr: string, opts: any) => {
        const { Transaction } = require("@stellar/stellar-sdk");
        const tx = new Transaction(xdr, opts.networkPassphrase);
        tx.sign(testClient);
        return tx.toXDR();
      });

      const res = await authenticateWithSep10(clientAddress, "affiliate", false);

      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();
      expect(res.session?.address).toBe(clientAddress);
      expect(mockSignFreighter).toHaveBeenCalled();
    });

    it("handles Freighter rejection gracefully", async () => {
      mockSignFreighter.mockRejectedValueOnce(new Error("User rejected Freighter signing"));

      const res = await authenticateWithSep10(clientAddress, "affiliate", false);

      expect(res.success).toBe(false);
      expect(res.error).toContain("User rejected Freighter signing");
    });
  });

  /* =========================================================================
     5. SESSION STORAGE & WEB3 CONTEXT INTEGRATION
     ========================================================================= */

  describe("Storage and Web3Context Integration", () => {
    it("stores and clears active sessions in localStorage", () => {
      const now = Date.now();
      saveSep10Session({
        token: "jwt_token_123",
        address: clientAddress,
        role: "auditor",
        issuedAt: now,
        expiresAt: now + 3600_000,
        homeDomain: SEP10_DEFAULT_HOME_DOMAIN,
      });

      const active = getActiveSep10Session();
      expect(active?.token).toBe("jwt_token_123");
      expect(active?.role).toBe("auditor");

      clearSep10Session();
      expect(getActiveSep10Session()).toBeNull();
    });

    it("integrates authenticateSep10 and cleans up session upon disconnect in Web3Context", async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(Web3Provider, null, children);

      const { result } = renderHook(() => useWeb3(), { wrapper });

      await act(async () => {
        await result.current.connectWallet("mock");
      });

      expect(result.current.isConnected).toBe(true);

      let authRes: any;
      await act(async () => {
        authRes = await result.current.authenticateSep10("advertiser");
      });

      expect(authRes.success).toBe(true);
      expect(result.current.sep10Session).toBeDefined();
      expect(result.current.userRole).toBe("advertiser");

      act(() => {
        result.current.disconnectWallet();
      });

      expect(result.current.sep10Session).toBeNull();
      expect(getActiveSep10Session()).toBeNull();
    });
  });
});
