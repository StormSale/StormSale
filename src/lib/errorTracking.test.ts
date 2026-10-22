import { describe, it, expect, vi } from "vitest";
import {
  PRODUCTION_ERROR_SAMPLE_RATE,
  REDACTION_PATTERNS,
  REDACTED_VALUE,
  SENSITIVE_KEY_PATTERN,
  addErrorBreadcrumb,
  beforeSend,
  initErrorTracking,
  isErrorTrackingEnabled,
  scrubEvent,
  scrubString,
  scrubValue,
} from "./errorTracking";

describe("Error Tracking Privacy Scrubbing (#218)", () => {
  describe("value patterns", () => {
    it("redacts a Stellar secret seed", () => {
      const secret = "S" + "A2BCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
      const output = scrubString(`key=${secret}`);

      expect(output).not.toContain(secret);
      expect(output).toContain("[REDACTED_STELLAR_SECRET]");
    });

    it("redacts a 64 character hex private key", () => {
      const key = "a1b2c3d4".repeat(8);
      const output = scrubString(`signingKey=${key}`);

      expect(output).not.toContain(key);
      expect(output).toContain("[REDACTED_PRIVATE_KEY]");
    });

    it("redacts IPv4 addresses", () => {
      const output = scrubString("request from 203.0.113.42 failed");

      expect(output).not.toContain("203.0.113.42");
      expect(output).toContain("[REDACTED_IP]");
    });

    it("redacts IPv6 link-local addresses", () => {
      const output = scrubString("connected to fe80::1ff:fe23:4567:890a");

      expect(output).not.toContain("fe80::1ff");
      expect(output).toContain("[REDACTED_IP]");
    });

    it("redacts IPv6 unique-local addresses", () => {
      const output = scrubString("host fd12:3456:789a::1 responded");

      expect(output).not.toContain("fd12:3456");
      expect(output).toContain("[REDACTED_IP]");
    });

    it("redacts e-mail addresses", () => {
      const output = scrubString("failed for alice@example.com");

      expect(output).not.toContain("alice@example.com");
      expect(output).toContain("[REDACTED_EMAIL]");
    });

    it("leaves ordinary messages untouched", () => {
      const message = "Failed to submit transaction after 3 retries";
      expect(scrubString(message)).toBe(message);
    });

    it("exposes a pattern for every redaction rule", () => {
      expect(REDACTION_PATTERNS.map((pattern) => pattern.name)).toEqual([
        "stellar-secret-seed",
        "hex-private-key",
        "ipv4-address",
        "ipv6-link-local",
        "ipv6-unique-local",
        "email-address",
      ]);
    });
  });

  describe("sensitive keys", () => {
    it("replaces the value of a seed phrase field", () => {
      const output = scrubValue({ seedPhrase: "legal winner thank year wave sausage worth" });

      expect(output).toEqual({ seedPhrase: REDACTED_VALUE });
    });

    it("replaces the value of a private key field", () => {
      const output = scrubValue({ privateKey: "0xdeadbeef" });

      expect(output).toEqual({ privateKey: REDACTED_VALUE });
    });

    it("replaces the value of a secret field", () => {
      const output = scrubValue({ secret: "hunter2" });

      expect(output).toEqual({ secret: REDACTED_VALUE });
    });

    it("replaces the value of an api key field", () => {
      const output = scrubValue({ api_key: "abcd1234" });

      expect(output).toEqual({ api_key: REDACTED_VALUE });
    });

    it("keeps ordinary fields", () => {
      const output = scrubValue({ campaignId: "42", name: "Tech Gadgets Pro" });

      expect(output).toEqual({ campaignId: "42", name: "Tech Gadgets Pro" });
    });

    it("matches the sensitive key names it claims to", () => {
      expect(SENSITIVE_KEY_PATTERN.test("mnemonic")).toBe(true);
      expect(SENSITIVE_KEY_PATTERN.test("authorization")).toBe(true);
      expect(SENSITIVE_KEY_PATTERN.test("campaignId")).toBe(false);
    });
  });

  describe("nested structures", () => {
    it("scrubs values inside arrays", () => {
      const output = scrubValue({ peers: ["10.0.0.1", "10.0.0.2"] }) as { peers: string[] };

      expect(output.peers).toEqual(["[REDACTED_IP]", "[REDACTED_IP]"]);
    });

    it("scrubs deeply nested values", () => {
      const output = scrubValue({
        request: { headers: { authorization: "Bearer abc" } },
      }) as { request: { headers: { authorization: string } } };

      expect(output.request.headers.authorization).toBe(REDACTED_VALUE);
    });

    it("stops walking at the maximum depth", () => {
      let deep: Record<string, unknown> = { value: "deep" };
      for (let i = 0; i < 15; i++) deep = { nested: deep };
      const output = JSON.stringify(scrubValue(deep));

      expect(output).toContain("[TRUNCATED]");
    });
  });

  describe("event scrubbing", () => {
    it("scrubs the exception message and the stack frames", () => {
      const secret = "S" + "A2BCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
      const event = {
        exception: {
          values: [
            {
              type: "Error",
              value: "payment to 198.51.100.9 failed",
              stacktrace: {
                frames: [{ filename: "app.js", vars: { privateKey: secret, attempt: 2 } }],
              },
            },
          ],
        },
      };
      const output = scrubEvent(event) as typeof event;

      expect(output.exception.values[0].value).not.toContain("198.51.100.9");
      expect(output.exception.values[0].stacktrace.frames[0].vars.privateKey).toBe(REDACTED_VALUE);
      expect(output.exception.values[0].stacktrace.frames[0].vars.attempt).toBe(2);
    });

    it("scrubs the request url and query string", () => {
      const event = {
        request: {
          url: "https://api.example.com/users?email=alice@example.com",
          query_string: "ip=203.0.113.7",
        },
      };
      const output = scrubEvent(event) as typeof event;

      expect(output.request.url).not.toContain("alice@example.com");
      expect(output.request.query_string).not.toContain("203.0.113.7");
    });

    it("scrubs the breadcrumbs", () => {
      const event = {
        breadcrumbs: [{ category: "auth", message: "login from 10.1.2.3", data: { ok: true } }],
      };
      const output = scrubEvent(event) as typeof event;

      expect(output.breadcrumbs[0].message).not.toContain("10.1.2.3");
      expect(output.breadcrumbs[0].data.ok).toBe(true);
    });

    it("redacts the automatically attached visitor ip", () => {
      const event = { user: { ip_address: "198.51.100.25" } };
      const output = scrubEvent(event) as typeof event;

      expect(output.user.ip_address).toBe("[REDACTED_IP]");
    });

    it("keeps the event structure intact", () => {
      const event = { message: "boom", level: "error", tags: { a: "b" } };
      const output = scrubEvent(event);

      expect(output.message).toBe("boom");
      expect(output.level).toBe("error");
      expect(output.tags).toEqual({ a: "b" });
    });
  });

  describe("beforeSend", () => {
    it("returns the scrubbed event", () => {
      const event = { message: "boom 10.0.0.9" };
      const output = beforeSend(event) as typeof event;

      expect(output.message).toBe("boom [REDACTED_IP]");
    });

    it("never drops the event - sampling is handled by the SDK", () => {
      const output = beforeSend({ message: "boom" });

      expect(output).not.toBeNull();
      expect(output).toEqual({ message: "boom" });
    });
  });

  describe("sampling", () => {
    it("uses a 10% sample rate in production", () => {
      expect(PRODUCTION_ERROR_SAMPLE_RATE).toBe(0.1);
    });
  });

  describe("disabled without a DSN", () => {
    it("does not initialise error tracking when no DSN is configured", () => {
      expect(initErrorTracking()).toBe(false);
      expect(isErrorTrackingEnabled()).toBe(false);
    });

    it("records breadcrumbs without throwing when error tracking is disabled", () => {
      expect(() => addErrorBreadcrumb("test", "message", { a: "b" })).not.toThrow();
    });
  });

  describe("enabled with a DSN", () => {
    it("initialises error tracking when a DSN is configured", async () => {
      vi.stubEnv("VITE_SENTRY_DSN", "https://public@sentry.example.com/1");
      vi.resetModules();

      const { initErrorTracking: init, isErrorTrackingEnabled: isEnabled } =
        await import("./errorTracking");

      expect(init()).toBe(true);
      expect(isEnabled()).toBe(true);

      vi.unstubAllEnvs();
      vi.resetModules();
    });
  });
});
