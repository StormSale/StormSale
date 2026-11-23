import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  createPoWChallenge,
  verifyPoWProof,
  solvePoWChallenge,
  solvePoWChallengeInWorker,
  consumePoWNonce,
  resetPoWNonceTracker,
  sha256Sync,
} from "../lib/powChallenge";
import { PowChallengeModal } from "../components/shared/PowChallengeModal";

describe("Issue #477: Proof-of-work client challenge modal for abnormal traffic", () => {
  beforeEach(() => {
    resetPoWNonceTracker();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPoWNonceTracker();
  });

  describe("PoW Challenge Generation & SHA-256 Leading Zeroes", () => {
    it("creates challenge with required difficulty, timeout window and unique id", () => {
      const challenge = createPoWChallenge({ difficulty: 3, timeoutMs: 15000 });
      expect(challenge.id).toMatch(/^pow_\d+_/);
      expect(challenge.difficulty).toBe(3);
      expect(challenge.timeoutMs).toBe(15000);
      expect(challenge.expiresAt - challenge.createdAt).toBe(15000);
      expect(challenge.solved).toBe(false);
    });

    it("finds a SHA-256 hash meeting the difficulty requirement (N leading zeroes)", async () => {
      const challenge = createPoWChallenge({ difficulty: 2, timeoutMs: 10000 });
      const proof = await solvePoWChallenge(challenge);

      expect(proof.challengeId).toBe(challenge.id);
      expect(proof.nonce).toBeGreaterThanOrEqual(0);
      expect(proof.hash.startsWith("00")).toBe(true);

      const verification = verifyPoWProof(challenge, proof);
      expect(verification.valid).toBe(true);
    });

    it("verifies hash validity and rejects forged proofs", () => {
      const challenge = createPoWChallenge({ difficulty: 2, timeoutMs: 15000 });
      const forgedProof = {
        challengeId: challenge.id,
        nonce: 12345,
        hash: "00deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      };

      const verification = verifyPoWProof(challenge, forgedProof);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain("does not match expected SHA-256 digest");
    });
  });

  describe("Web Worker Execution & Responsive UI Offloading", () => {
    it("solves challenge via worker solver without blocking thread execution", async () => {
      const challenge = createPoWChallenge({ difficulty: 2, timeoutMs: 15000 });
      const proof = await solvePoWChallengeInWorker(challenge);

      expect(proof.challengeId).toBe(challenge.id);
      expect(proof.hash.startsWith("00")).toBe(true);
      expect(verifyPoWProof(challenge, proof).valid).toBe(true);
    });

    it("falls back gracefully to async calculation when Web Worker is unavailable", async () => {
      const originalWorker = globalThis.Worker;
      // @ts-expect-error simulate environment without Worker
      delete globalThis.Worker;

      try {
        const challenge = createPoWChallenge({ difficulty: 2, timeoutMs: 15000 });
        const proof = await solvePoWChallengeInWorker(challenge);
        expect(proof.hash.startsWith("00")).toBe(true);
      } finally {
        globalThis.Worker = originalWorker;
      }
    });
  });

  describe("Single-Use Nonce & Replay Attack Defense", () => {
    it("unlocks transaction submission with single-use nonce and prevents replay", () => {
      const challengeId = "test_challenge_replay";
      const nonce = 42;

      // First use succeeds
      const firstUse = consumePoWNonce(challengeId, nonce);
      expect(firstUse).toBe(true);

      // Replaying identical nonce for same challenge fails
      const replayAttempt = consumePoWNonce(challengeId, nonce);
      expect(replayAttempt).toBe(false);
    });
  });

  describe("Challenge Timeout & Fresh Challenge Request", () => {
    it("rejects proof verification if submitted after 15-second expiration window", () => {
      const challenge = createPoWChallenge({ difficulty: 2, timeoutMs: 15000 });
      // Simulate expired challenge
      challenge.expiresAt = Date.now() - 1000;

      const validHash = sha256Sync(`${challenge.prefix}:0`);
      const verification = verifyPoWProof(challenge, {
        challengeId: challenge.id,
        nonce: 0,
        hash: validHash,
      });

      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe("Challenge expired");
    });

    it("solvePoWChallenge rejects when 15s challenge timeout expires", async () => {
      const challenge = createPoWChallenge({ difficulty: 5, timeoutMs: 10 }); // difficult & short timeout
      challenge.expiresAt = Date.now() - 50;

      await expect(solvePoWChallenge(challenge)).rejects.toThrow(/timed out/i);
    });
  });

  describe("PowChallengeModal Component Interaction", () => {
    it("renders modal dialog and initiates solving on open", async () => {
      const handleSuccess = vi.fn();
      const handleClose = vi.fn();

      render(
        React.createElement(PowChallengeModal, {
          isOpen: true,
          difficulty: 1,
          timeoutMs: 10000,
          onSuccess: handleSuccess,
          onClose: handleClose,
        })
      );

      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByText("Security Verification")).toBeTruthy();
      expect(screen.getByText(/Verifying browser authenticity/i)).toBeTruthy();
    });

    it("triggers onSuccess callback with proof and single-use nonce upon solve", async () => {
      const handleSuccess = vi.fn();
      const handleClose = vi.fn();

      render(
        React.createElement(PowChallengeModal, {
          isOpen: true,
          difficulty: 1, // low difficulty for fast deterministic test
          timeoutMs: 10000,
          onSuccess: handleSuccess,
          onClose: handleClose,
        })
      );

      // Wait for async solve to trigger onSuccess
      await vi.waitFor(() => {
        expect(handleSuccess).toHaveBeenCalledTimes(1);
      }, { timeout: 4000 });

      const [proof, nonce] = handleSuccess.mock.calls[0];
      expect(proof.nonce).toBeGreaterThanOrEqual(0);
      expect(nonce).toMatch(/^nonce_\d+_/);
    });

    it("displays timeout alert and allows requesting fresh challenge after expiration", async () => {
      vi.useFakeTimers();
      const handleSuccess = vi.fn();
      const handleClose = vi.fn();

      render(
        React.createElement(PowChallengeModal, {
          isOpen: true,
          difficulty: 4, // high difficulty to ensure it doesn't solve instantly in fake timer
          timeoutMs: 5000,
          onSuccess: handleSuccess,
          onClose: handleClose,
        })
      );

      // Fast forward past timeout
      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(screen.getByRole("heading", { name: /Challenge Timed Out/i })).toBeTruthy();
      const refreshButton = screen.getByRole("button", { name: /Request Fresh Challenge/i });
      expect(refreshButton).toBeTruthy();

      // Click Request Fresh Challenge
      act(() => {
        fireEvent.click(refreshButton);
      });

      expect(screen.getByText(/Verifying browser authenticity/i)).toBeTruthy();
    });
  });
});
