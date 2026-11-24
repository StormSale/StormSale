import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MonotonicNonceGenerator,
  createAnalyticsPayload,
  signAnalyticsPayload,
  verifyAnalyticsPayload,
  canonicalizeJson,
  createAnalyticsSignatureHeaders,
  calculateHmacSha256,
  type AnalyticsEventData,
} from "../lib/analyticsPayloadHmac";

describe("Anti-Tamper Client Analytics Payload HMAC Signature Suite (#475)", () => {
  const TEST_SECRET = "whsec_ephemeral_telemetry_test_key_987654321";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Criterion 1: Verify analytics payloads include monotonically increasing nonce and timestamp
  // =========================================================================
  describe("1. Monotonically Increasing Nonce and Timestamp Injection", () => {
    it("generates analytics payload with valid numeric timestamp and nonce", () => {
      const beforeTime = Date.now();
      const payload = createAnalyticsPayload({
        eventType: "click",
        campaignId: "camp-stellar-01",
      });
      const afterTime = Date.now();

      expect(typeof payload.nonce).toBe("number");
      expect(payload.nonce).toBeGreaterThan(0);
      expect(typeof payload.timestamp).toBe("number");
      expect(payload.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(payload.timestamp).toBeLessThanOrEqual(afterTime);
      expect(payload.body.eventType).toBe("click");
      expect(payload.body.campaignId).toBe("camp-stellar-01");
    });

    it("guarantees strictly monotonically increasing nonces across sequential invocations", () => {
      const generator = new MonotonicNonceGenerator();
      const nonces: number[] = [];

      for (let i = 0; i < 50; i++) {
        nonces.push(generator.getNextNonce());
      }

      for (let i = 1; i < nonces.length; i++) {
        expect(nonces[i]).toBeGreaterThan(nonces[i - 1]);
      }
    });

    it("maintains strict monotonicity even when called rapidly within the same millisecond", () => {
      const generator = new MonotonicNonceGenerator(1000);
      vi.spyOn(Date, "now").mockReturnValue(500); // simulate frozen clock

      const n1 = generator.getNextNonce();
      const n2 = generator.getNextNonce();
      const n3 = generator.getNextNonce();

      expect(n2).toBeGreaterThan(n1);
      expect(n3).toBeGreaterThan(n2);
      expect(n3 - n1).toBe(2);
    });

    it("preserves canonical JSON key ordering for nested objects", () => {
      const objA = { z: 1, a: 2, m: { y: "test", b: 42 } };
      const objB = { a: 2, m: { b: 42, y: "test" }, z: 1 };

      const canonA = canonicalizeJson(objA);
      const canonB = canonicalizeJson(objB);

      expect(canonA).toBe(canonB);
      expect(canonA).toBe('{"a":2,"m":{"b":42,"y":"test"},"z":1}');
    });
  });

  // =========================================================================
  // Criterion 2: Test ephemeral HMAC signing of payload body before transmission
  // =========================================================================
  describe("2. Ephemeral HMAC Signing of Payload Body", () => {
    it("ephemerally signs payload body producing valid HMAC-SHA256 hex signature", async () => {
      const event: AnalyticsEventData = {
        eventType: "impression",
        campaignId: "promo-summer-2026",
        referralId: "ref-marketer-99",
        countryIso: "US",
      };

      const payload = createAnalyticsPayload(event, { timestamp: 1700000000000, nonce: 42 });
      const signed = await signAnalyticsPayload(payload, TEST_SECRET);

      expect(signed.signature).toBeDefined();
      expect(typeof signed.signature).toBe("string");
      // HMAC-SHA256 output is 64 hex characters (256 bits)
      expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it("formats standard X-Analytics headers for HTTP transmission", async () => {
      const payload = createAnalyticsPayload(
        { eventType: "click", targetUrl: "https://stormsale.xyz/offer" },
        { timestamp: 1700000000000, nonce: 101 },
      );
      const signed = await signAnalyticsPayload(payload, TEST_SECRET);
      const headers = createAnalyticsSignatureHeaders(signed);

      expect(headers["X-Analytics-Signature"]).toBe(signed.signature);
      expect(headers["X-Analytics-Timestamp"]).toBe("1700000000000");
      expect(headers["X-Analytics-Nonce"]).toBe("101");
    });

    it("detects and rejects tamper modifications in transit (anti-tamper verification)", async () => {
      const event: AnalyticsEventData = {
        eventType: "conversion",
        campaignId: "bounty-404",
        amount: 500,
      };

      const payload = createAnalyticsPayload(event, { timestamp: 1700000000000, nonce: 1 });
      const signed = await signAnalyticsPayload(payload, TEST_SECRET);

      // Verify legitimate signature succeeds
      const initialVerification = await verifyAnalyticsPayload(signed, TEST_SECRET, {
        now: 1700000000000,
      });
      expect(initialVerification.valid).toBe(true);

      // 1. Attacker tampers with body payload (e.g. inflating amount)
      const tamperedBody = {
        ...signed,
        body: { ...signed.body, amount: 50000 },
      };
      const tamperBodyResult = await verifyAnalyticsPayload(tamperedBody, TEST_SECRET, {
        now: 1700000000000,
      });
      expect(tamperBodyResult.valid).toBe(false);
      expect(tamperBodyResult.reason).toContain("HMAC signature mismatch");

      // 2. Attacker tampers with timestamp
      const tamperedTime = {
        ...signed,
        timestamp: signed.timestamp + 1000,
      };
      const tamperTimeResult = await verifyAnalyticsPayload(tamperedTime, TEST_SECRET, {
        now: 1700000001000,
      });
      expect(tamperTimeResult.valid).toBe(false);
      expect(tamperTimeResult.reason).toContain("HMAC signature mismatch");

      // 3. Attacker tampers with nonce
      const tamperedNonce = {
        ...signed,
        nonce: signed.nonce + 999,
      };
      const tamperNonceResult = await verifyAnalyticsPayload(tamperedNonce, TEST_SECRET, {
        now: 1700000000000,
      });
      expect(tamperNonceResult.valid).toBe(false);
      expect(tamperNonceResult.reason).toContain("HMAC signature mismatch");

      // 4. Incorrect secret key
      const wrongKeyResult = await verifyAnalyticsPayload(signed, "wrong_secret_key_12345", {
        now: 1700000000000,
      });
      expect(wrongKeyResult.valid).toBe(false);
      expect(wrongKeyResult.reason).toContain("HMAC signature mismatch");
    });

    it("verifies known HMAC-SHA256 test vectors match expected cryptographic digest", async () => {
      // RFC 4231 Test Vector 2: key = "Jefe", message = "what do ya want for nothing?"
      const key = "Jefe";
      const message = "what do ya want for nothing?";
      const expectedDigest = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

      const digest = await calculateHmacSha256(key, message);
      expect(digest).toBe(expectedDigest);
    });
  });

  // =========================================================================
  // Criterion 3: Test backend rejection simulation when payload timestamp skewed by >30s
  // =========================================================================
  describe("3. Backend Rejection Simulation for Timestamp Skew > 30 Seconds", () => {
    const fixedNow = 1_700_000_000_000;

    it("accepts payloads when timestamp skew is within the 30-second tolerance window", async () => {
      // 5 seconds in the past
      const pastPayload = createAnalyticsPayload(
        { eventType: "click" },
        { timestamp: fixedNow - 5_000, nonce: 1 },
      );
      const signedPast = await signAnalyticsPayload(pastPayload, TEST_SECRET);
      const pastResult = await verifyAnalyticsPayload(signedPast, TEST_SECRET, { now: fixedNow });
      expect(pastResult.valid).toBe(true);

      // 29 seconds in the past (just within threshold)
      const borderPayload = createAnalyticsPayload(
        { eventType: "click" },
        { timestamp: fixedNow - 29_000, nonce: 2 },
      );
      const signedBorder = await signAnalyticsPayload(borderPayload, TEST_SECRET);
      const borderResult = await verifyAnalyticsPayload(signedBorder, TEST_SECRET, { now: fixedNow });
      expect(borderResult.valid).toBe(true);

      // 10 seconds in the future (acceptable small clock drift)
      const futurePayload = createAnalyticsPayload(
        { eventType: "click" },
        { timestamp: fixedNow + 10_000, nonce: 3 },
      );
      const signedFuture = await signAnalyticsPayload(futurePayload, TEST_SECRET);
      const futureResult = await verifyAnalyticsPayload(signedFuture, TEST_SECRET, { now: fixedNow });
      expect(futureResult.valid).toBe(true);
    });

    it("rejects payloads when timestamp is skewed by > 30 seconds into the past (stale replay)", async () => {
      // 31 seconds in the past (exceeds 30s threshold)
      const stalePayload = createAnalyticsPayload(
        { eventType: "click" },
        { timestamp: fixedNow - 31_000, nonce: 10 },
      );
      const signedStale = await signAnalyticsPayload(stalePayload, TEST_SECRET);

      const result = await verifyAnalyticsPayload(signedStale, TEST_SECRET, {
        now: fixedNow,
        maxSkewSeconds: 30,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Payload timestamp skewed by >30 seconds");
      expect(result.reason).toContain("past (stale)");
    });

    it("rejects payloads when timestamp is skewed by > 30 seconds into the future (future timestamp exploit)", async () => {
      // 45 seconds in the future
      const futurePayload = createAnalyticsPayload(
        { eventType: "impression" },
        { timestamp: fixedNow + 45_000, nonce: 11 },
      );
      const signedFuture = await signAnalyticsPayload(futurePayload, TEST_SECRET);

      const result = await verifyAnalyticsPayload(signedFuture, TEST_SECRET, {
        now: fixedNow,
        maxSkewSeconds: 30,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Payload timestamp skewed by >30 seconds");
      expect(result.reason).toContain("future (clock drift)");
    });

    it("rejects replayed nonces and enforces monotonic order during backend verification", async () => {
      const seenNonces = new Set<number>([100, 101]);

      const replayedPayload = createAnalyticsPayload(
        { eventType: "click" },
        { timestamp: fixedNow, nonce: 101 },
      );
      const signedReplayed = await signAnalyticsPayload(replayedPayload, TEST_SECRET);

      const replayResult = await verifyAnalyticsPayload(signedReplayed, TEST_SECRET, {
        now: fixedNow,
        seenNonces,
      });
      expect(replayResult.valid).toBe(false);
      expect(replayResult.reason).toContain("Replay detected: Nonce 101 has already been processed");

      // Non-monotonic nonce (lower than minNonce)
      const nonMonotonicPayload = createAnalyticsPayload(
        { eventType: "click" },
        { timestamp: fixedNow, nonce: 50 },
      );
      const signedNonMonotonic = await signAnalyticsPayload(nonMonotonicPayload, TEST_SECRET);

      const nonMonoResult = await verifyAnalyticsPayload(signedNonMonotonic, TEST_SECRET, {
        now: fixedNow,
        minNonce: 101,
      });
      expect(nonMonoResult.valid).toBe(false);
      expect(nonMonoResult.reason).toContain("Nonce 50 is not monotonically increasing");
    });
  });
});
