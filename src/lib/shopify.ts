/**
 * Shopify Webhook Integration Utilities for StormSale
 *
 * Handles HMAC-SHA256 signature validation for Shopify webhooks,
 * extracts order data and affiliate referral cookies, and constructs
 * Soroban transaction payloads for on-chain conversion logging.
 */

import { STELLAR_CONFIG } from "../config/stellar";

export interface ShopifyWebhookHeaders {
  "x-shopify-hmac-sha256": string;
  "x-shopify-topic": string;
  "x-shopify-shop-domain": string;
  "x-shopify-api-version": string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  total_price: string;
  currency: string;
  customer?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
  landing_site?: string;
  referring_site?: string;
  note_attributes?: Array<{ name: string; value: string }>;
}

export interface AffiliateReferral {
  affiliateId: string;
  campaignId: number;
  saleAmount: number;
}

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Generates a random shared secret for Shopify webhook validation.
 * Merchants use this as the webhook secret in their Shopify app settings.
 */
export function generateShopifySharedSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates a Shopify webhook HMAC-SHA256 signature.
 *
 * Shopify sends the signature in the X-Shopify-Hmac-Sha256 header,
 * computed as HMAC-SHA256(webhook_secret, request_body).
 */
export async function validateShopifyHmac(
  body: string,
  secret: string,
  signature: string,
): Promise<WebhookValidationResult> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(body);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      messageData,
    );
    const computedSignature = btoa(
      String.fromCharCode(...Array.from(new Uint8Array(signatureBuffer))),
    );
    const valid = computedSignature === signature;
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Synchronous HMAC validation using subtle crypto (for simulated environments).
 * Returns a promise since Web Crypto API is async.
 */
export async function validateShopifyHmacAsync(
  body: string,
  secret: string,
  signature: string,
): Promise<WebhookValidationResult> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(body);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const computedSignature = btoa(
      String.fromCharCode(...Array.from(new Uint8Array(signatureBuffer))),
    );
    const valid = computedSignature === signature;
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Extracts affiliate referral information from a Shopify order.
 * Looks for ref, affiliate, partner, or utm_source parameters in
 * landing_site, referring_site, or note_attributes.
 */
export function extractAffiliateReferral(order: ShopifyOrder): AffiliateReferral | null {
  const referralSources: string[] = [];

  if (order.landing_site) referralSources.push(order.landing_site);
  if (order.referring_site) referralSources.push(order.referring_site);
  if (order.note_attributes) {
    order.note_attributes.forEach((attr) => {
      if (attr.name.toLowerCase().includes("affiliate") || attr.name.toLowerCase().includes("ref")) {
        referralSources.push(attr.value);
      }
    });
  }

  const combined = referralSources.join(" ").toLowerCase();

  let affiliateId = "";
  let campaignId = 1;

  const affiliateMatch = combined.match(/(?:affiliate|ref|partner|utm_source|ref_id)[=:]([a-z0-9_-]+)/i);
  if (affiliateMatch) {
    affiliateId = affiliateMatch[1];
  }

  const campaignMatch = combined.match(/(?:campaign|camp)[=:](\d+)/i);
  if (campaignMatch) {
    campaignId = parseInt(campaignMatch[1], 10);
  }

  if (!affiliateId) {
    return null;
  }

  return {
    affiliateId,
    campaignId,
    saleAmount: parseFloat(order.total_price),
  };
}

/**
 * Constructs a Soroban transaction payload from a Shopify order
 * for on-chain conversion logging.
 */
export function constructSorobanConversionPayload(
  order: ShopifyOrder,
  referral: AffiliateReferral,
  advertiserAddress: string,
) {
  return {
    contractId: STELLAR_CONFIG.contractId,
    method: "log_sale",
    args: {
      advertiserAddress,
      campaignId: referral.campaignId,
      affiliateAddress: referral.affiliateId,
      saleAmountXlm: referral.saleAmount,
    },
    shopifyOrderId: order.id,
    shopifyDomain: "",
    timestamp: Date.now(),
  };
}

/**
 * Generates the Shopify webhook URL for a given deployment domain.
 */
export function generateWebhookUrl(domain: string): string {
  const cleanDomain = domain.replace(/^https?:\/\//, "");
  return `https://${cleanDomain}/api/webhooks/shopify/orders-paid`;
}
