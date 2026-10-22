import { describe, it, expect } from "vitest";
import {
  generateShopifySharedSecret,
  validateShopifyHmacAsync,
  extractAffiliateReferral,
  constructSorobanConversionPayload,
  generateWebhookUrl,
} from "./shopify";

describe("Shopify Shared Secret Generator", () => {
  it("generates a 64-character hex string", () => {
    const secret = generateShopifySharedSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique secrets on each call", () => {
    const secret1 = generateShopifySharedSecret();
    const secret2 = generateShopifySharedSecret();
    expect(secret1).not.toBe(secret2);
  });
});

describe("Shopify HMAC Validation", () => {
  const testSecret = "test_secret_key_12345";
  const testBody = JSON.stringify({ id: 1, total_price: "100.00" });

  it("validates a correct HMAC signature", async () => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(testSecret);
    const messageData = encoder.encode(testBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const signature = btoa(
      String.fromCharCode(...Array.from(new Uint8Array(signatureBuffer))),
    );

    const result = await validateShopifyHmacAsync(testBody, testSecret, signature);
    expect(result.valid).toBe(true);
  });

  it("rejects an incorrect HMAC signature", async () => {
    const result = await validateShopifyHmacAsync(testBody, testSecret, "invalid_signature");
    expect(result.valid).toBe(false);
  });

  it("rejects when secret does not match", async () => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(testSecret);
    const messageData = encoder.encode(testBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const signature = btoa(
      String.fromCharCode(...Array.from(new Uint8Array(signatureBuffer))),
    );

    const result = await validateShopifyHmacAsync(testBody, "wrong_secret", signature);
    expect(result.valid).toBe(false);
  });
});

describe("Affiliate Referral Extraction", () => {
  it("extracts affiliate ID from landing_site query parameter", () => {
    const order = {
      id: 1,
      order_number: 1001,
      total_price: "149.99",
      currency: "USD",
      landing_site: "https://example.com/products/gadget?affiliate=aff_abc123&campaign=42",
    } as any;

    const referral = extractAffiliateReferral(order);
    expect(referral).not.toBeNull();
    expect(referral!.affiliateId).toBe("aff_abc123");
    expect(referral!.campaignId).toBe(42);
    expect(referral!.saleAmount).toBe(149.99);
  });

  it("returns null when no affiliate reference found", () => {
    const order = {
      id: 2,
      order_number: 1002,
      total_price: "50.00",
      currency: "USD",
      landing_site: "https://example.com/products/gadget",
    } as any;

    const referral = extractAffiliateReferral(order);
    expect(referral).toBeNull();
  });

  it("extracts affiliate from note_attributes", () => {
    const order = {
      id: 3,
      order_number: 1003,
      total_price: "200.00",
      currency: "USD",
      landing_site: "https://example.com/",
      note_attributes: [{ name: "affiliate_id", value: "partner=partner_xyz" }],
    } as any;

    const referral = extractAffiliateReferral(order);
    expect(referral).not.toBeNull();
    expect(referral!.affiliateId).toBe("partner_xyz");
  });

  it("extracts campaign ID from landing_site", () => {
    const order = {
      id: 4,
      order_number: 1004,
      total_price: "75.50",
      currency: "USD",
      landing_site: "https://example.com?affiliate=aff_abc123&camp=7",
    } as any;

    const referral = extractAffiliateReferral(order);
    expect(referral).not.toBeNull();
    expect(referral!.campaignId).toBe(7);
  });
});

describe("Soroban Conversion Payload Construction", () => {
  const order = {
    id: 5088429141,
    order_number: 1042,
    total_price: "149.99",
    currency: "USD",
  } as any;

  const referral = {
    affiliateId: "aff_abc123",
    campaignId: 42,
    saleAmount: 149.99,
  };

  const advertiserAddress = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

  it("constructs payload with correct structure", () => {
    const payload = constructSorobanConversionPayload(order, referral, advertiserAddress);

    expect(payload.contractId).toBeDefined();
    expect(payload.method).toBe("log_sale");
    expect(payload.args.advertiserAddress).toBe(advertiserAddress);
    expect(payload.args.campaignId).toBe(42);
    expect(payload.args.affiliateAddress).toBe("aff_abc123");
    expect(payload.args.saleAmountXlm).toBe(149.99);
    expect(payload.shopifyOrderId).toBe(5088429141);
    expect(payload.timestamp).toBeDefined();
  });
});

describe("Shopify Webhook URL Generator", () => {
  it("generates webhook URL for orders/paid topic", () => {
    const url = generateWebhookUrl("my-store.myshopify.com");
    expect(url).toBe("https://my-store.myshopify.com/api/webhooks/shopify/orders-paid");
  });

  it("handles domain with https prefix", () => {
    const url = generateWebhookUrl("https://my-store.myshopify.com");
    expect(url).toBe("https://my-store.myshopify.com/api/webhooks/shopify/orders-paid");
  });
});
