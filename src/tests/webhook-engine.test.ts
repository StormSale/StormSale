import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateWebhookSecret,
  generateWebhookSignature,
  verifyWebhookSignature,
  resetNonceCache,
} from "../lib/webhookSecurity";
import {
  calculateBackoffDelayMs,
  createDeliveryRecord,
  dispatchWebhookEvent,
  dispatchDelivery,
  dispatchTestDummyPayload,
  executeHttpDispatch,
  getWebhookSamplePayload,
  getRegisteredEndpoints,
  isSafeWebhookUrl,
  triggerConversionPostback,
  saveWebhookEndpoint,
  deleteWebhookEndpoint,
  toggleWebhookEndpoint,
  clearWebhookDeliveries,
  getWebhookDeliveries,
  resetWebhookEngineStore,
} from "../lib/webhookEngine";
import type { WebhookEndpoint } from "../types/webhook";

describe("Automated Conversion Postback Webhook Engine Suite", () => {
  // Low-entropy deterministic test secret avoiding generic-api-key gitleaks detection
  const testSecret = "whsec_000000000000000000000000000000000000000000000000";
  const testPayload = {
    event: "conversion.confirmed",
    saleId: "SALE_1001",
    amount: "500.00",
    affiliate: "GAFFILIATE1234567890STORMTESTNET",
    campaign: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    timestamp: "2026-10-15T20:00:00.000Z",
  };

  beforeEach(() => {
    resetNonceCache();
    resetWebhookEngineStore();
    clearWebhookDeliveries();

    // Register deterministic test endpoints for acceptance tests
    saveWebhookEndpoint({
      id: "wh_deterministic_test",
      name: "Deterministic Ingestion CRM",
      url: "https://crm.example.com/webhook",
      secret: testSecret,
      events: [
        "conversion.confirmed",
        "payout.claimed",
        "campaign.created",
        "conversion.created",
        "payout.created",
      ],
      isActive: true,
      createdAt: new Date().toISOString(),
      simulationMode: "mock_200",
      failureCount: 0,
      totalDeliveries: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ----------------------------------------------------------------------
  // Section 1: HMAC-SHA256 Signature Generation & Authenticity
  // ----------------------------------------------------------------------
  describe("HMAC-SHA256 Signature Generation & Authenticity", () => {
    it("generates a standardized secret with whsec_ prefix", () => {
      const secret = generateWebhookSecret();
      expect(secret).toMatch(/^whsec_[a-f0-9]{48}$/);
    });

    it("signs payload using HMAC-SHA256 and generates X-StormSale-Signature header", async () => {
      const result = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });

      expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
      expect(result.signatureHeader).toContain(`t=${result.timestamp}`);
      expect(result.signatureHeader).toContain(`v1=${result.signature}`);
      expect(result.signatureHeader).toContain(`nonce=${result.nonce}`);
    });

    it("successfully verifies authentic payload and valid signature", async () => {
      const { signatureHeader } = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });

      const verification = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader,
        secret: testSecret,
      });

      expect(verification.isValid).toBe(true);
      expect(verification.reason).toBeUndefined();
    });

    it("rejects payload when data has been tampered with", async () => {
      const { signatureHeader } = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });

      const tamperedPayload = { ...testPayload, amount: "999999.00" };

      const verification = await verifyWebhookSignature({
        payload: tamperedPayload,
        signatureHeader,
        secret: testSecret,
      });

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain("HMAC-SHA256 signature mismatch");
    });

    it("rejects payload when verified with wrong secret key", async () => {
      const { signatureHeader } = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
      });

      const wrongSecret = "whsec_111111111111111111111111111111111111111111111111";

      const verification = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader,
        secret: wrongSecret,
      });

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain("HMAC-SHA256 signature mismatch");
    });
  });

  // ----------------------------------------------------------------------
  // Section 2: Replay Attack Prevention
  // ----------------------------------------------------------------------
  describe("Replay Attack Prevention", () => {
    it("rejects expired timestamps beyond the tolerance window", async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredTimestamp = now - 600; // 10 minutes ago (tolerance is 300s)

      const { signatureHeader } = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
        timestamp: expiredTimestamp,
      });

      const verification = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader,
        secret: testSecret,
        toleranceSeconds: 300,
        currentTimestamp: now,
      });

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain("Timestamp out of tolerance window");
      expect(verification.reason).toContain("Replay attack prevented");
    });

    it("rejects timestamps from the distant future", async () => {
      const now = Math.floor(Date.now() / 1000);
      const futureTimestamp = now + 500; // 500s into future

      const { signatureHeader } = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
        timestamp: futureTimestamp,
      });

      const verification = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader,
        secret: testSecret,
        toleranceSeconds: 300,
        currentTimestamp: now,
      });

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain("Timestamp out of tolerance window");
    });

    it("rejects duplicate nonces within the active tolerance window", async () => {
      const now = Math.floor(Date.now() / 1000);
      const nonce = "replay_test_nonce_12345";

      const { signatureHeader } = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
        timestamp: now,
        nonce,
      });

      // First verification: should succeed and record nonce
      const firstCheck = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader,
        secret: testSecret,
        toleranceSeconds: 300,
        currentTimestamp: now,
      });
      expect(firstCheck.isValid).toBe(true);

      // Second verification of identical packet: must be blocked as replay attack!
      const replayCheck = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader,
        secret: testSecret,
        toleranceSeconds: 300,
        currentTimestamp: now,
      });
      expect(replayCheck.isValid).toBe(false);
      expect(replayCheck.reason).toContain(`Duplicate nonce '${nonce}' detected`);
      expect(replayCheck.reason).toContain("Replay attack prevented");
    });

    it("does not consume nonces when signature check fails (anti-DoS protection)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const nonce = "dos_prevention_nonce_99999";

      // Forged packet with invalid secret
      const { signatureHeader } = await generateWebhookSignature({
        payload: testPayload,
        secret: "whsec_attacker_fake_key_000000000000000000000000",
        timestamp: now,
        nonce,
      });

      const failedVerification = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader,
        secret: testSecret, // correct secret
        currentTimestamp: now,
      });
      expect(failedVerification.isValid).toBe(false);

      // A legitimate subsequent packet with the same nonce must not be blocked by the failed attempt
      const legitimateSign = await generateWebhookSignature({
        payload: testPayload,
        secret: testSecret,
        timestamp: now,
        nonce,
      });

      const legitimateVerification = await verifyWebhookSignature({
        payload: testPayload,
        signatureHeader: legitimateSign.signatureHeader,
        secret: testSecret,
        currentTimestamp: now,
      });
      expect(legitimateVerification.isValid).toBe(true);
    });
  });

  // ----------------------------------------------------------------------
  // Section 3: Exponential Backoff & Queue Retry Engine
  // ----------------------------------------------------------------------
  describe("Exponential Backoff & Queue Retry Engine", () => {
    it("calculates exponential backoff delay correctly", () => {
      const baseDelay = 2000;
      expect(calculateBackoffDelayMs(1, baseDelay)).toBe(2000); // 2000 * 2^0
      expect(calculateBackoffDelayMs(2, baseDelay)).toBe(4000); // 2000 * 2^1
      expect(calculateBackoffDelayMs(3, baseDelay)).toBe(8000); // 2000 * 2^2
      expect(calculateBackoffDelayMs(4, baseDelay)).toBe(16000); // 2000 * 2^3
      expect(calculateBackoffDelayMs(5, baseDelay)).toBe(32000); // 2000 * 2^4
    });

    it("respects maxDelayMs upper bound", () => {
      const maxDelay = 10000;
      expect(calculateBackoffDelayMs(10, 2000, maxDelay)).toBe(10000);
    });

    it("creates a queued delivery record with UUID", async () => {
      const mockEndpoint: WebhookEndpoint = {
        id: "wh_unit_test",
        name: "Unit Test Endpoint",
        url: "https://crm.example.com/webhook",
        secret: testSecret,
        events: ["conversion.confirmed"],
        isActive: true,
        createdAt: new Date().toISOString(),
        failureCount: 0,
        totalDeliveries: 0,
      };

      const delivery = await createDeliveryRecord(
        mockEndpoint,
        "conversion.confirmed",
        testPayload,
      );

      expect(delivery.id).toMatch(/^del_/);
      expect(delivery.status).toBe("queued");
      expect(delivery.attempts).toBe(0);
    });

    it("dispatches successfully to mock_200 endpoint and records HTTP 200 in delivery logs", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_success_test",
        name: "Success Test Endpoint",
        url: "https://crm.example.com/webhook",
        secret: testSecret,
        events: ["conversion.confirmed"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_200",
        failureCount: 0,
        totalDeliveries: 0,
      };

      const delivery = await createDeliveryRecord(endpoint, "conversion.confirmed", testPayload);
      const executed = await dispatchDelivery(delivery.id, [endpoint]);

      expect(executed).not.toBeNull();
      expect(executed?.status).toBe("delivered");
      expect(executed?.attempts).toBe(1);
      expect(executed?.logs.length).toBe(1);
      expect(executed?.logs[0].httpStatusCode).toBe(200);
      expect(executed?.logs[0].statusText).toBe("OK");
      expect(executed?.signatureHeader).toContain("v1=");
    });

    it("retries on HTTP 500 failure and transitions to retrying state with nextRetryAt", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_fail_test",
        name: "500 Failure Endpoint",
        url: "https://crm.example.com/webhook",
        secret: testSecret,
        events: ["conversion.confirmed"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_500",
        failureCount: 0,
        totalDeliveries: 0,
      };

      const delivery = await createDeliveryRecord(
        endpoint,
        "conversion.confirmed",
        testPayload,
        3, // maxRetries = 3
      );

      // Attempt 1 -> Fails with HTTP 500 -> status should be "retrying"
      const afterAttempt1 = await dispatchDelivery(delivery.id, [endpoint]);
      expect(afterAttempt1?.status).toBe("retrying");
      expect(afterAttempt1?.attempts).toBe(1);
      expect(afterAttempt1?.nextRetryAt).toBeDefined();
      expect(afterAttempt1?.logs[0].httpStatusCode).toBe(500);

      // Attempt 2 -> Fails again -> status still "retrying"
      const afterAttempt2 = await dispatchDelivery(delivery.id, [endpoint]);
      expect(afterAttempt2?.status).toBe("retrying");
      expect(afterAttempt2?.attempts).toBe(2);

      // Attempt 3 -> Fails 3rd time (maxRetries reached) -> status should be "failed"
      const afterAttempt3 = await dispatchDelivery(delivery.id, [endpoint]);
      expect(afterAttempt3?.status).toBe("failed");
      expect(afterAttempt3?.attempts).toBe(3);
      expect(afterAttempt3?.nextRetryAt).toBeNull();
      expect(afterAttempt3?.logs.length).toBe(3);
      expect(afterAttempt3?.logs[2].httpStatusCode).toBe(500);
    });

    it("recovers on retry with flaky simulation (fails then succeeds)", async () => {
      const flakyEndpoint: WebhookEndpoint = {
        id: "wh_flaky_test",
        name: "Flaky Recovery Endpoint",
        url: "https://crm.example.com/webhook",
        secret: testSecret,
        events: ["conversion.confirmed"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_flaky",
        failureCount: 0,
        totalDeliveries: 0,
      };

      const delivery = await createDeliveryRecord(
        flakyEndpoint,
        "conversion.confirmed",
        testPayload,
        4,
      );

      // Attempt 1 -> Fails with 503
      const a1 = await dispatchDelivery(delivery.id, [flakyEndpoint]);
      expect(a1?.status).toBe("retrying");
      expect(a1?.logs[0].httpStatusCode).toBe(503);

      // Attempt 2 -> Fails with 503
      const a2 = await dispatchDelivery(delivery.id, [flakyEndpoint]);
      expect(a2?.status).toBe("retrying");
      expect(a2?.logs[1].httpStatusCode).toBe(503);

      // Attempt 3 -> Recovers with 200 OK!
      const a3 = await dispatchDelivery(delivery.id, [flakyEndpoint]);
      expect(a3?.status).toBe("delivered");
      expect(a3?.logs[2].httpStatusCode).toBe(200);
      expect(a3?.logs[2].responseBody).toContain("CRM Recovered!");
    });
  });

  // ----------------------------------------------------------------------
  // Section 4: Dummy Test Payloads & Automated Postback Triggers
  // ----------------------------------------------------------------------
  describe("Endpoint Management & Acceptance Criteria", () => {
    it.each([
      ["https://hooks.zapier.com/hooks/catch/123/abc", true],
      ["http://hooks.example.com/catch", false],
      ["https://localhost/hook", false],
      ["https://service.internal/hook", false],
      ["https://intranet/hook", false],
      ["https://127.0.0.1/hook", false],
      ["https://10.2.3.4/hook", false],
      ["https://192.168.1.10/hook", false],
      ["https://[::1]/hook", false],
    ])("validates webhook destination %s", (url, expected) => {
      expect(isSafeWebhookUrl(url)).toBe(expected);
    });

    it.each(["campaign.created", "conversion.created", "payout.created"] as const)(
      "creates a flat, ready-to-use %s test payload with valid schema fields",
      (event) => {
        const payload = getWebhookSamplePayload(event);

        expect(payload).toMatchObject({ event, is_test_event: true });
        expect(payload.id).toBeTruthy();
        expect(payload.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(payload).not.toHaveProperty("data");
        const numericField = event === "campaign.created" ? payload.budget : payload.amount;
        if (numericField !== undefined) expect(typeof numericField).toBe("number");
      },
    );

    it.each(["campaign.created", "conversion.created", "payout.created"] as const)(
      "dispatches live webhook delivery for %s and calls fetch within 3000 ms",
      async (event) => {
        const fetchSpy = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": "application/json" },
          }),
        );
        vi.stubGlobal("fetch", fetchSpy);

        const liveEndpoint: WebhookEndpoint = {
          id: `wh_live_${event.replace(".", "_")}`,
          name: `Live ${event} endpoint`,
          url: "https://hooks.example.com/catch",
          secret: testSecret,
          events: [event],
          isActive: true,
          createdAt: new Date().toISOString(),
          simulationMode: "live",
          failureCount: 0,
          totalDeliveries: 0,
        };
        saveWebhookEndpoint(liveEndpoint);

        const startedAt = performance.now();
        await dispatchWebhookEvent(event, getWebhookSamplePayload(event));

        expect(fetchSpy).toHaveBeenCalled();
        expect(performance.now() - startedAt).toBeLessThan(3000);

        const [requestUrl, requestOptions] = fetchSpy.mock.calls[0];
        expect(requestUrl).toBe(liveEndpoint.url);
        expect(requestOptions.method).toBe("POST");
        expect(requestOptions.headers["Content-Type"]).toBe("application/json");
        expect(requestOptions.headers["X-StormSale-Event"]).toBe(event);
        expect(requestOptions.headers["X-StormSale-Signature"]).toContain("v1=");
      },
    );

    it("dispatches each Zapier/Make event to its subscribed endpoint with flat fields", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_nocode_triggers",
        name: "No-code trigger endpoint",
        url: "https://hooks.example.com/catch",
        secret: testSecret,
        events: ["campaign.created", "conversion.created", "payout.created"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_200",
        failureCount: 0,
        totalDeliveries: 0,
      };
      saveWebhookEndpoint(endpoint);

      for (const event of endpoint.events) {
        await dispatchWebhookEvent(event, getWebhookSamplePayload(event));
      }

      const deliveries = getWebhookDeliveries().filter(
        (delivery) => delivery.webhookId === endpoint.id,
      );
      expect(deliveries.map((delivery) => delivery.event).sort()).toEqual(
        ["campaign.created", "conversion.created", "payout.created"].sort(),
      );
      for (const delivery of deliveries) {
        expect(delivery.payload.id).toBeTruthy();
        expect(delivery.payload.event).toBe(delivery.event);
        expect(delivery.payload).not.toHaveProperty("data");
        expect(delivery.status).toBe("delivered");
      }
    });

    it("does not wait for remote delivery before returning to the event producer", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_slow_nocode",
        name: "Slow no-code endpoint",
        url: "https://hooks.example.com/catch",
        secret: testSecret,
        events: ["campaign.created"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_200",
        failureCount: 0,
        totalDeliveries: 0,
      };
      saveWebhookEndpoint(endpoint);

      const startedAt = performance.now();
      const delivery = dispatchWebhookEvent(
        "campaign.created",
        getWebhookSamplePayload("campaign.created"),
      );
      expect(performance.now() - startedAt).toBeLessThan(25);
      await delivery;
    });

    it("disables a destination when it returns HTTP 410 Gone", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_gone",
        name: "Unsubscribed endpoint",
        url: "https://hooks.example.com/catch",
        secret: testSecret,
        events: ["campaign.created"],
        isActive: true,
        createdAt: new Date().toISOString(),
        failureCount: 0,
        totalDeliveries: 0,
      };
      saveWebhookEndpoint(endpoint);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 410 })));

      const delivery = await createDeliveryRecord(
        endpoint,
        "campaign.created",
        getWebhookSamplePayload("campaign.created"),
      );
      const result = await dispatchDelivery(delivery.id);

      expect(result?.status).toBe("failed");
      expect(getWebhookDeliveries().find((item) => item.id === delivery.id)?.status).toBe("failed");
      expect(getRegisteredEndpoints().find((item) => item.id === endpoint.id)?.isActive).toBe(
        false,
      );
    });

    it("does not disable an endpoint after a single delivery with exhausted retries", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_single_failure_exhausted",
        name: "Single failed delivery endpoint",
        url: "https://hooks.example.com/catch",
        secret: testSecret,
        events: ["campaign.created"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_500",
        failureCount: 0,
        totalDeliveries: 0,
      };
      saveWebhookEndpoint(endpoint);

      const delivery = await createDeliveryRecord(
        endpoint,
        "campaign.created",
        getWebhookSamplePayload("campaign.created"),
        2, // maxRetries = 2
      );

      // Attempt 1 -> status transitions to "retrying", endpoint failureCount remains 0
      await dispatchDelivery(delivery.id);
      expect(getWebhookDeliveries().find((d) => d.id === delivery.id)?.status).toBe("retrying");
      expect(getRegisteredEndpoints().find((item) => item.id === endpoint.id)?.failureCount).toBe(
        0,
      );

      // Attempt 2 -> retries exhausted, delivery marked "failed", endpoint failureCount increments to 1
      await dispatchDelivery(delivery.id);
      expect(getWebhookDeliveries().find((d) => d.id === delivery.id)?.status).toBe("failed");

      const updatedEndpoint = getRegisteredEndpoints().find((item) => item.id === endpoint.id);
      expect(updatedEndpoint?.failureCount).toBe(1);
      expect(updatedEndpoint?.isActive).toBe(true);
      expect(updatedEndpoint?.lastDeliveryStatus).toBe("failed");
    });

    it("disables a destination after five consecutive failed deliveries with exhausted retries", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_repeated_failures",
        name: "Repeatedly failing endpoint",
        url: "https://hooks.example.com/catch",
        secret: testSecret,
        events: ["campaign.created"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_500",
        failureCount: 0,
        totalDeliveries: 0,
      };
      saveWebhookEndpoint(endpoint);

      for (let deliveryIndex = 0; deliveryIndex < 5; deliveryIndex += 1) {
        const delivery = await createDeliveryRecord(
          endpoint,
          "campaign.created",
          getWebhookSamplePayload("campaign.created"),
          2, // maxRetries = 2
        );
        // Exhaust retries for each delivery
        await dispatchDelivery(delivery.id);
        await dispatchDelivery(delivery.id);
        expect(getWebhookDeliveries().find((d) => d.id === delivery.id)?.status).toBe("failed");
      }

      const updatedEndpoint = getRegisteredEndpoints().find((item) => item.id === endpoint.id);
      expect(updatedEndpoint?.failureCount).toBe(5);
      expect(updatedEndpoint?.isActive).toBe(false);
    });

    it("aborts an unresponsive webhook request when the delivery timeout expires", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_timeout",
        name: "Unresponsive endpoint",
        url: "https://hooks.example.com/catch",
        secret: testSecret,
        events: ["campaign.created"],
        isActive: true,
        createdAt: new Date().toISOString(),
        failureCount: 0,
        totalDeliveries: 0,
      };
      const delivery = await createDeliveryRecord(
        endpoint,
        "campaign.created",
        getWebhookSamplePayload("campaign.created"),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, options: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            }),
        ),
      );

      const result = await executeHttpDispatch(delivery, endpoint, 10);

      expect(result.success).toBe(false);
      expect(result.httpStatusCode).toBe(0);
      expect(result.error).toBe("aborted");
    });

    it("records remote failure without rejecting the event producer", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_failure_isolation",
        name: "Failing endpoint",
        url: "https://hooks.example.com/catch",
        secret: testSecret,
        events: ["campaign.created"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_500",
        failureCount: 0,
        totalDeliveries: 0,
      };
      saveWebhookEndpoint(endpoint);

      await expect(
        dispatchWebhookEvent("campaign.created", getWebhookSamplePayload("campaign.created")),
      ).resolves.toBeUndefined();
      expect(
        getWebhookDeliveries().find((delivery) => delivery.webhookId === endpoint.id)?.status,
      ).toBe("retrying");
    });

    it("allows registering, toggling, and deleting webhook endpoints", () => {
      const newEndpoint: WebhookEndpoint = {
        id: "wh_custom_crm_123",
        name: "Custom Salesforce Ingestion",
        url: "https://salesforce.example.com/postback",
        secret: generateWebhookSecret(),
        events: ["conversion.confirmed"],
        isActive: true,
        createdAt: new Date().toISOString(),
        failureCount: 0,
        totalDeliveries: 0,
      };

      const saved = saveWebhookEndpoint(newEndpoint);
      expect(saved.some((ep) => ep.id === "wh_custom_crm_123")).toBe(true);

      const toggled = toggleWebhookEndpoint("wh_custom_crm_123", false);
      expect(toggled.find((ep) => ep.id === "wh_custom_crm_123")?.isActive).toBe(false);

      const remaining = deleteWebhookEndpoint("wh_custom_crm_123");
      expect(remaining.some((ep) => ep.id === "wh_custom_crm_123")).toBe(false);
    });

    it("Acceptance Criteria 1: Webhook manager allows testing endpoints with dummy payloads", async () => {
      const delivery = await dispatchTestDummyPayload(
        "wh_deterministic_test",
        "conversion.confirmed",
      );

      expect(delivery).not.toBeNull();
      expect(delivery?.payload).toHaveProperty("is_test_event", true);
      expect(delivery?.logs.length).toBeGreaterThan(0);
      expect(delivery?.logs[0].httpStatusCode).toBe(200);
      expect(delivery?.signatureHeader).toContain("v1=");
    });

    it("Acceptance Criteria 2: Deliveries include retry logs with HTTP response status codes", async () => {
      const endpoint: WebhookEndpoint = {
        id: "wh_log_verification_endpoint",
        name: "Log Verification Endpoint",
        url: "https://crm.example.com/webhook",
        secret: testSecret,
        events: ["conversion.confirmed"],
        isActive: true,
        createdAt: new Date().toISOString(),
        simulationMode: "mock_500",
        failureCount: 0,
        totalDeliveries: 0,
      };

      const delivery = await createDeliveryRecord(endpoint, "conversion.confirmed", testPayload, 2);
      await dispatchDelivery(delivery.id, [endpoint]);

      const deliveries = getWebhookDeliveries();
      const targetDelivery = deliveries.find((d) => d.id === delivery.id);

      expect(targetDelivery).toBeDefined();
      expect(targetDelivery?.logs.length).toBe(1);
      expect(targetDelivery?.logs[0].httpStatusCode).toBe(500);
      expect(targetDelivery?.logs[0].statusText).toBe("Internal Server Error");
      expect(targetDelivery?.logs[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(targetDelivery?.logs[0].requestHeaders).toHaveProperty("X-StormSale-Signature");
    });

    it("triggers automated conversion postback across active subscribed endpoints", async () => {
      const deliveries = await triggerConversionPostback({
        saleId: "SALE_AUTO_999",
        campaignAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliateAddress: "GAFFILIATE_TEST_WALLET",
        advertiserAddress: "GADVERTISER_TEST_WALLET",
        saleAmount: "1250.00",
        currency: "XLM",
        stellarTxHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        ledgerTimestamp: new Date().toISOString(),
        customerRef: "CUST_REF_789",
        status: "CONFIRMED_ON_LEDGER",
      });

      expect(deliveries.length).toBeGreaterThan(0);
      for (const d of deliveries) {
        expect(d.event).toBe("conversion.confirmed");
        expect(d.payload.data).toHaveProperty("sale_id", "SALE_AUTO_999");
        expect(d.payload.data).toHaveProperty("amount", "1250.00");
        expect(d.signatureHeader).toContain("v1=");
      }
    });
  });
});
