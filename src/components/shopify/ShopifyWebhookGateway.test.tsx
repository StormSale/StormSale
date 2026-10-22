// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShopifyWebhookGateway } from "../components/shopify/ShopifyWebhookGateway";

const mocks = vi.hoisted(() => ({
  logSaleContractCall: vi.fn(),
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

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(1),
      subtle: {
        importKey: vi.fn().mockResolvedValue({}),
        sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
    expect(secretInput.value).toBe("1111111111111111111111111111111111111111111111111111111111111111");
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
    expect(screen.getByText("https://my-store.myshopify.com/api/webhooks/shopify/orders-paid")).toBeTruthy();
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

    fireEvent.click(screen.getByText(/Run Test Webhook/));

    await waitFor(() => {
      expect(screen.getByText(/Invalid HMAC signature/)).toBeTruthy();
    });
  });

  it("successfully processes valid test webhook and logs conversion", async () => {
    render(<ShopifyWebhookGateway />);

    const secretInput = screen.getByPlaceholderText("Paste shared secret");
    const signatureInput = screen.getByPlaceholderText("Paste signature header");

    const encoder = new TextEncoder();
    const keyData = encoder.encode("test_secret");
    const body = JSON.stringify({
      id: 5088429141,
      order_number: 1042,
      total_price: "149.99",
      currency: "USD",
      landing_site: "https://example.com/products/gadget?affiliate=aff_abc123&campaign=42",
    });

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(body));
    const signature = btoa(
      String.fromCharCode(...Array.from(new Uint8Array(signatureBuffer))),
    );

    fireEvent.change(secretInput, { target: { value: "test_secret" } });
    fireEvent.change(signatureInput, { target: { value: signature } });

    fireEvent.click(screen.getByText(/Run Test Webhook/));

    await waitFor(() => {
      expect(screen.getByText(/conversion logged on-chain/i)).toBeTruthy();
    });

    expect(mocks.logSaleContractCall).toHaveBeenCalled();
  });
});
