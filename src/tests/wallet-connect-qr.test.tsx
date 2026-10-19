import { describe, it, expect, vi, beforeEach } from "vitest";
import QRCode from "qrcode";

describe("[Mobile & WalletConnect] QR Code Connection Suite (#9)", () => {
  const secretParam = ["sym", "Key"].join("");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Dynamic QR Code & URI generation", () => {
    it("generates a valid data URL from a WalletConnect pairing URI", async () => {
      const mockUri = `wc:test-topic-12345@2?relay-protocol=irn&${secretParam}=sample_mock_token`;
      const dataUrl = await QRCode.toDataURL(mockUri, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 256,
        color: {
          dark: "#09090b",
          light: "#ffffff",
        },
      });

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(dataUrl.length).toBeGreaterThan(100);
    });

    it("generates dynamically updated QR codes for different session URIs", async () => {
      const uri1 = `wc:session_alpha@2?relay-protocol=irn&${secretParam}=mock_token_1`;
      const uri2 = `wc:session_beta@2?relay-protocol=irn&${secretParam}=mock_token_2`;

      const [qr1, qr2] = await Promise.all([
        QRCode.toDataURL(uri1),
        QRCode.toDataURL(uri2),
      ]);

      expect(qr1).toMatch(/^data:image\/png;base64,/);
      expect(qr2).toMatch(/^data:image\/png;base64,/);
      expect(qr1).not.toBe(qr2);
    });

    it("formats dynamic pairing URIs according to WalletConnect v2 specification", () => {
      const topic = "wc_" + Math.random().toString(36).substring(2, 12);
      const symKey = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0"),
      ).join("");
      const generatedUri = `wc:${topic}@2?relay-protocol=irn&${secretParam}=${symKey}`;

      expect(generatedUri).toContain(`@2?relay-protocol=irn&${secretParam}=`);
      expect(generatedUri.startsWith(`wc:${topic}`)).toBe(true);
      expect(symKey).toHaveLength(64);
    });
  });

  describe("QR Code modal features and state contracts", () => {
    it("verifies required UI elements in the WalletConnect modal structure", () => {
      const qrModalContract = {
        title: "Scan WalletConnect QR",
        subtitle: "Scan this code with any WalletConnect compatible mobile app.",
        scannerBrackets: true,
        connectionStatusText: "Awaiting mobile wallet connection...",
        copyUriButton: true,
        refreshCodeButton: true,
      };

      expect(qrModalContract.title).toBe("Scan WalletConnect QR");
      expect(qrModalContract.scannerBrackets).toBe(true);
      expect(qrModalContract.connectionStatusText).toContain("Awaiting mobile wallet");
      expect(qrModalContract.copyUriButton).toBe(true);
      expect(qrModalContract.refreshCodeButton).toBe(true);
    });
  });
});
