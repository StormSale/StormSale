// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  logSaleContractCall: vi.fn(),
  generateShopifySharedSecret: vi.fn(() => "test_secret_12345678901234567890123456789012"),
  validateShopifyHmacAsync: vi.fn(),
  extractAffiliateReferral: vi.fn(),
  constructSorobanConversionPayload: vi.fn(),
  generateWebhookUrl: vi.fn((domain: string) => `https://${domain}/api/webhooks/shopify/orders-paid`),
}));

vi.mock("../../lib/shopify", () => ({
  generateShopifySharedSecret: mocks.generateShopifySharedSecret,
  validateShopifyHmacAsync: mocks.validateShopifyHmacAsync,
  extractAffiliateReferral: mocks.extractAffiliateReferral,
  constructSorobanConversionPayload: mocks.constructSorobanConversionPayload,
  generateWebhookUrl: mocks.generateWebhookUrl,
}));
vi.mock("../../lib/stellar", () => ({
  logSaleContractCall: mocks.logSaleContractCall,
}));

describe("ShopifyWebhookGateway", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logSaleContractCall.mockResolvedValue({
      success: true,
      txHash: "0xabc123def456",
    });
    mocks.validateShopifyHmacAsync.mockResolvedValue({ valid: true });
    mocks.extractAffiliateReferral.mockReturnValue({
      affiliateId: "aff_abc123",
      campaignId: 42,
      saleAmount: 149.99,
    });
    mocks.constructSorobanConversionPayload.mockReturnValue({
      contractId: "test_contract",
      method: "log_sale",
      args: {
        advertiserAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        campaignId: 42,
        affiliateAddress: "aff_abc123",
        saleAmountXlm: 149.99,
      },
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders shopify webhook setup form", () => {
    render(<ShopifyWebhookGateway />);

    expect(screen.getByText("Shopify Webhook Integration")).toBeTruthy();
    expect(screen.getByPlaceholderText("your-store.myshopify.com")).toBeTruthy();
    expect(screen.getByText("Generate")).toBeTruthy();
    expect(screen.getByText("Setup Webhook")).toBeTruthy();
  });

  it("generates a shared secret when generate button is clicked", () => {
    render(<ShopifyWebhookGateway />);

    fireEvent.click(screen.getByText("Generate"));

    const secretInput = screen.getByPlaceholderText("Auto-generated secret");
    expect(secretInput.value).toBe("test_secret_12345678901234567890123456789012");
    expect(mocks.generateShopifySharedSecret).toHaveBeenCalled();
  });

  it("shows error when setup webhook without domain", () => {
    render(<ShopifyWebhookGateway />);

    fireEvent.click(screen.getByText("Setup Webhook"));

    expect(screen.getByText(/Please enter your Shopify store domain/)).toBeTruthy();
  });

  it("configures webhook URL when domain is entered", () => {
    render(<ShopifyWebhookGateway />);

    const domainInput = screen.getByPlaceholderText("your-store.myshopify.com");
    fireEvent.change(domainInput, { target: { value: "my-store.myshopify.com" } });
    fireEvent.click(screen.getByText("Setup Webhook"));

    expect(screen.getByText(/Webhook configured for my-store.myshopify.com/)).toBeTruthy();
    expect(mocks.generateWebhookUrl).toHaveBeenCalledWith("my-store.myshopify.com");
  });

  it("copies webhook URL to clipboard", async () => {
    render(<ShopifyWebhookGateway />);

    const domainInput = screen.getByPlaceholderText("your-store.myshopify.com");
    fireEvent.change(domainInput, { target: { value: "my-store.myshopify.com" } });
    fireEvent.click(screen.getByText("Setup Webhook"));

    await waitFor(() => {
      expect(screen.getByText("https://my-store.myshopify.com/api/webhooks/shopify/orders-paid")).toBeTruthy();
    });

    const copyButton = screen.getByRole("button", { name: /copy/i });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("https://my-store.myshopify.com/api/webhooks/shopify/orders-paid");
  });

  it("shows error for invalid HMAC signature in test webhook", async () => {
    render(<ShopifyWebhookGateway />);

    const secretInput = screen.getByPlaceholderText("Paste shared secret");
    const signatureInput = screen.getByPlaceholderText("Paste signature header");

    fireEvent.change(secretInput, { target: { value: "test_secret" } });
    fireEvent.change(signatureInput, { target: { value: "bad_signature" } });

    mocks.validateShopifyHmacAsync.mockResolvedValue({ valid: false });

    fireEvent.click(screen.getByText(/Run Test Webhook/));

    await waitFor(() => {
      expect(screen.getByText(/Invalid HMAC signature/)).toBeTruthy();
    });
  });

  it("successfully processes valid test webhook and logs conversion", async () => {
    render(<ShopifyWebhookGateway />);

    const secretInput = screen.getByPlaceholderText("Paste shared secret");
    const signatureInput = screen.getByPlaceholderText("Paste signature header");

    fireEvent.change(secretInput, { target: { value: "test_secret" } });
    fireEvent.change(signatureInput, { target: { value: "valid_signature" } });

    fireEvent.click(screen.getByText(/Run Test Webhook/));

    await waitFor(() => {
      expect(screen.getByText(/conversion logged on-chain/i)).toBeTruthy();
    });

    expect(mocks.validateShopifyHmacAsync).toHaveBeenCalled();
    expect(mocks.extractAffiliateReferral).toHaveBeenCalled();
    expect(mocks.logSaleContractCall).toHaveBeenCalled();
  });
});
