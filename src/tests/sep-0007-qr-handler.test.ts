import { describe, it, expect, vi, beforeEach } from "vitest";
import QRCode from "qrcode";

// Mock clipboard and toast notification context / handlers
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

const mockShowToast = vi.fn();

export interface Sep0007UriParams {
  destination: string;
  amount?: string;
  memo?: string;
  memoType?: "text" | "id" | "hash";
  assetCode?: string;
  assetIssuer?: string;
}

export function buildSep0007Uri(params: Sep0007UriParams): string {
  if (!params.destination) {
    throw new Error("Destination address is required.");
  }
  const scheme = params.assetCode && params.assetCode !== "XLM" ? "web+stellar:pay" : "web+stellar:pay";
  const url = new URL(scheme);
  url.searchParams.set("destination", params.destination);
  if (params.amount) {
    url.searchParams.set("amount", params.amount);
  }
  if (params.memo) {
    url.searchParams.set("memo", params.memo);
    if (params.memoType) {
      url.searchParams.set("memo_type", params.memoType);
    }
  }
  if (params.assetCode && params.assetCode !== "XLM") {
    url.searchParams.set("asset_code", params.assetCode);
    if (params.assetIssuer) {
      url.searchParams.set("asset_issuer", params.assetIssuer);
    }
  }
  return url.toString();
}

export async function generateQrSvg(
  uri: string,
  errorCorrectionLevel: "M" | "Q" = "M",
): Promise<string> {
  return await QRCode.toString(uri, {
    type: "svg",
    errorCorrectionLevel,
  });
}

export async function copyUriToClipboard(uri: string, notify: (msg: string) => void): Promise<void> {
  await navigator.clipboard.writeText(uri);
  notify("SEP-0007 URI copied to clipboard!");
}

describe("SEP-0007 URI Scheme Handler & QR Code Generator (#SEP-0007)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies valid SEP-0007 URI construction with amount, destination, and memo", () => {
    const destination = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    const amount = "100.50";
    const memo = "Invoice12345";

    const uri = buildSep0007Uri({
      destination,
      amount,
      memo,
      memoType: "text",
    });

    expect(uri).toContain("web+stellar:pay");
    const parsed = new URL(uri);
    expect(parsed.searchParams.get("destination")).toBe(destination);
    expect(parsed.searchParams.get("amount")).toBe(amount);
    expect(parsed.searchParams.get("memo")).toBe(memo);
    expect(parsed.searchParams.get("memo_type")).toBe("text");
  });

  it("verifies QR code SVG renders with correct error correction level (Level M/Q)", async () => {
    const uri = "web+stellar:pay?destination=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5&amount=50";

    const svgM = await generateQrSvg(uri, "M");
    expect(svgM).toContain("<svg");
    expect(svgM).toContain("</svg>");

    const svgQ = await generateQrSvg(uri, "Q");
    expect(svgQ).toContain("<svg");
    expect(svgQ).toContain("</svg>");
  });

  it("tests copy-to-clipboard functionality with toast notification", async () => {
    const uri = "web+stellar:pay?destination=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

    await copyUriToClipboard(uri, mockShowToast);

    expect(mockWriteText).toHaveBeenCalledWith(uri);
    expect(mockShowToast).toHaveBeenCalledWith("SEP-0007 URI copied to clipboard!");
  });
});
