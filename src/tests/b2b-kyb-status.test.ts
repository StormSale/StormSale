// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { KybStatusBadge } from "../components/advertiser/KybStatusBadge";
import { KybDocumentUploader } from "../components/advertiser/KybDocumentUploader";
import { KybRestrictedBanner } from "../components/advertiser/KybRestrictedBanner";
import type { KybStatus } from "../types/kyb";

function makeFile(name: string, type: string, content = "mock-kyb-document-content"): File {
  return new File([content], name, { type });
}

describe("b2b KYB compliance", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("status badge", () => {
    it("renders UNVERIFIED badge for UNVERIFIED status", () => {
      render(React.createElement(KybStatusBadge, { status: "UNVERIFIED" }));
      const badge = screen.getByTestId("kyb-status-badge");
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain("UNVERIFIED");
      expect(badge.className).toContain("kyb-status-unverified");
    });

    it("renders PENDING_REVIEW badge for PENDING_REVIEW status", () => {
      render(React.createElement(KybStatusBadge, { status: "PENDING_REVIEW" }));
      const badge = screen.getByTestId("kyb-status-badge");
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain("PENDING_REVIEW");
      expect(badge.className).toContain("kyb-status-pending-review");
    });

    it("renders VERIFIED badge for VERIFIED status", () => {
      render(React.createElement(KybStatusBadge, { status: "VERIFIED" }));
      const badge = screen.getByTestId("kyb-status-badge");
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain("VERIFIED");
      expect(badge.className).toContain("kyb-status-verified");
    });

    it("renders ACTION_REQUIRED badge for ACTION_REQUIRED status", () => {
      render(React.createElement(KybStatusBadge, { status: "ACTION_REQUIRED" }));
      const badge = screen.getByTestId("kyb-status-badge");
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain("ACTION_REQUIRED");
      expect(badge.className).toContain("kyb-status-action-required");
    });

    it("badge is visually distinct for each status", () => {
      const statuses: KybStatus[] = ["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "ACTION_REQUIRED"];
      const renderedLabels = new Set<string>();
      const renderedClasses = new Set<string>();
      const renderedAriaLabels = new Set<string>();

      for (const status of statuses) {
        const { unmount } = render(React.createElement(KybStatusBadge, { status }));
        const badge = screen.getByTestId("kyb-status-badge");
        renderedLabels.add(badge.textContent || "");
        renderedClasses.add(badge.className);
        renderedAriaLabels.add(badge.getAttribute("aria-label") || "");
        unmount();
      }

      expect(renderedLabels.size).toBe(4);
      expect(renderedClasses.size).toBe(4);
      expect(renderedAriaLabels.size).toBe(4);
    });
  });

  describe("encrypted document upload", () => {
    it("accepts a valid MIME type on drop", async () => {
      const mockUpload = vi.fn().mockResolvedValue(undefined);
      const mockEncrypt = vi.fn().mockImplementation((bytes: Uint8Array) => `encrypted_${bytes.length}`);

      render(
        React.createElement(KybDocumentUploader, {
          onUpload: mockUpload,
          encryptFn: mockEncrypt,
        }),
      );

      const dropZone = screen.getByTestId("kyb-upload-dropzone");
      const file = makeFile("incorporation-doc.pdf", "application/pdf", "pdf-raw-data");

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => expect(mockEncrypt).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
      expect(mockUpload).toHaveBeenCalledWith("encrypted_12", "incorporation-doc.pdf");
      expect(screen.queryByTestId("upload-error")).toBeNull();
    });

    it("rejects an invalid MIME type on drop", async () => {
      const mockUpload = vi.fn().mockResolvedValue(undefined);
      const mockEncrypt = vi.fn().mockImplementation((bytes: Uint8Array) => `encrypted_${bytes.length}`);

      render(
        React.createElement(KybDocumentUploader, {
          onUpload: mockUpload,
          encryptFn: mockEncrypt,
        }),
      );

      const dropZone = screen.getByTestId("kyb-upload-dropzone");
      const file = makeFile("notes.txt", "text/plain", "plain text content");

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => expect(screen.getByTestId("upload-error")).toBeTruthy());
      expect(screen.getByTestId("upload-error").textContent).toMatch(/not allowed/i);
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it("accepts a valid MIME type via drag-and-drop dragover", () => {
      render(React.createElement(KybDocumentUploader, {}));
      const dropZone = screen.getByTestId("kyb-upload-dropzone");

      fireEvent.dragOver(dropZone, {
        dataTransfer: { types: ["application/pdf"] },
      });

      expect(dropZone.getAttribute("data-accept")).toBe("true");
      expect(dropZone.className).toContain("border-indigo-500");

      fireEvent.dragLeave(dropZone);
      expect(dropZone.getAttribute("data-accept")).not.toBe("true");
    });

    it("rejects an invalid MIME type via dragover", () => {
      render(React.createElement(KybDocumentUploader, {}));
      const dropZone = screen.getByTestId("kyb-upload-dropzone");

      fireEvent.dragOver(dropZone, {
        dataTransfer: { types: ["text/plain"] },
      });

      expect(dropZone.getAttribute("data-accept")).not.toBe("true");
      expect(dropZone.className).not.toContain("border-indigo-500");
    });

    it("encryption is called with the file bytes before upload", async () => {
      const callSequence: string[] = [];
      let encryptionReceivedBytes: Uint8Array | null = null;

      const mockEncrypt = vi.fn(async (bytes: Uint8Array) => {
        callSequence.push("encrypt");
        encryptionReceivedBytes = bytes;
        return "cipher_payload";
      });

      const mockUpload = vi.fn(async () => {
        callSequence.push("upload");
      });

      render(
        React.createElement(KybDocumentUploader, {
          onUpload: mockUpload,
          encryptFn: mockEncrypt,
        }),
      );

      const file = makeFile("passport.png", "image/png", "sample-binary-payload");
      const dropZone = screen.getByTestId("kyb-upload-dropzone");

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));

      expect(mockEncrypt).toHaveBeenCalledTimes(1);
      expect(encryptionReceivedBytes).toBeInstanceOf(Uint8Array);
      expect(encryptionReceivedBytes).not.toBeInstanceOf(File);
      expect(callSequence).toEqual(["encrypt", "upload"]);
    });
  });

  describe("restricted functionality banner", () => {
    it("banner appears when KYB status is ACTION_REQUIRED", () => {
      render(React.createElement(KybRestrictedBanner, { status: "ACTION_REQUIRED" }));
      const banner = screen.getByTestId("kyb-restricted-banner");
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain("Restricted Functionality");
      expect(banner.textContent).toContain("Action is required");
    });

    it("banner appears when KYB is expired", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      render(
        React.createElement(KybRestrictedBanner, {
          status: "VERIFIED",
          expiresAt: pastDate,
        }),
      );
      const banner = screen.getByTestId("kyb-restricted-banner");
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain("Restricted Functionality");
      expect(banner.textContent).toContain("Expired");
    });

    it("banner does not appear when KYB is VERIFIED and not expired", () => {
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      render(
        React.createElement(KybRestrictedBanner, {
          status: "VERIFIED",
          expiresAt: futureDate,
        }),
      );
      expect(screen.queryByTestId("kyb-restricted-banner")).toBeNull();
    });

    it("banner does not appear when KYB is PENDING_REVIEW", () => {
      render(React.createElement(KybRestrictedBanner, { status: "PENDING_REVIEW" }));
      expect(screen.queryByTestId("kyb-restricted-banner")).toBeNull();
    });
  });
});
