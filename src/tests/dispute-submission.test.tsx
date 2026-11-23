import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  generateDocketId,
  createEncryptedDispute,
  unwrapDisputeEvidenceKey,
  saveDisputeRecord,
  getDisputeRecord,
  getAllDisputeRecords,
  readFileAsBase64,
  DEFAULT_PROTOCOL_AUDITOR_KEYS,
  type DisputeFormData,
} from "../lib/affiliateDispute";
import { decryptPayload } from "../lib/crypto";
import { readAuditLedger, resetAuditLedgerForDev } from "../lib/auditLedger";
import { SalesList, type Sale } from "../components/affiliate/SalesList";
import { DisputeForm, DisputeModal } from "../components/affiliate/DisputeModal";
import { NotificationContext, type NotificationContextType } from "../context/NotificationContext";
import { AuditAccessPortal } from "../components/advertiser/AuditAccessPortal";

describe("Dispute Submission Portal for Contested Conversions (#171)", { timeout: 30000 }, () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const storageMock = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStore[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
    };
    vi.stubGlobal("localStorage", storageMock);
    resetAuditLedgerForDev();
  });

  describe("Docket ID Generation & Storage Utilities", () => {
    it("generates a standardized docket ID format starting with DKT-", () => {
      const txHash = "0x4d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e";
      const docketId = generateDocketId(txHash, 1700000000000);

      expect(docketId).toMatch(/^DKT-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(docketId).toContain("4D1E0F");

      // Fallback hash when empty txHash
      const emptyDocket = generateDocketId("");
      expect(emptyDocket).toMatch(/^DKT-/);
    });

    it("persists and retrieves dispute records in local storage", () => {
      expect(getAllDisputeRecords()).toEqual([]);

      const sampleRecord = {
        docketId: "DKT-TEST-1234",
        saleId: 4,
        txHash: "0x1234567890abcdef",
        orderIds: "ORD-101",
        description: "Customer bought product through referral link",
        fileCount: 1,
        fileNames: ["receipt.png"],
        encryptedEnvelope: "mock-envelope",
        wrappedKeys: {},
        status: "under_review" as const,
        submittedAt: Date.now(),
      };

      saveDisputeRecord(sampleRecord);

      const retrieved = getDisputeRecord(4);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.docketId).toBe("DKT-TEST-1234");
      expect(retrieved?.status).toBe("under_review");
      expect(getAllDisputeRecords()).toHaveLength(1);

      // Overwrite existing record
      saveDisputeRecord({ ...sampleRecord, docketId: "DKT-UPDATED" });
      expect(getDisputeRecord(4)?.docketId).toBe("DKT-UPDATED");

      // Non-existent record
      expect(getDisputeRecord(999)).toBeNull();
    });

    it("handles corrupted storage gracefully", () => {
      mockStore["stormsale_affiliate_disputes_v1"] = "invalid-json{";
      expect(getAllDisputeRecords()).toEqual([]);
    });

    it("handles storage being unavailable gracefully", () => {
      vi.stubGlobal("localStorage", undefined);
      expect(getAllDisputeRecords()).toEqual([]);
      expect(() => {
        saveDisputeRecord({
          docketId: "DKT-NO-STORAGE",
          saleId: 99,
          txHash: "0x123",
          orderIds: "ORD-1",
          description: "Test",
          fileCount: 0,
          fileNames: [],
          encryptedEnvelope: "env",
          wrappedKeys: {},
          status: "under_review",
          submittedAt: Date.now(),
        });
      }).not.toThrow();
    });

    it("reads Blob as Base64 string stripping data URI scheme", async () => {
      const blob = new Blob(["hello-world-evidence"], { type: "text/plain" });
      const base64 = await readFileAsBase64(blob);
      expect(typeof base64).toBe("string");
      expect(base64).toBe("aGVsbG8td29ybGQtZXZpZGVuY2U=");
    });
  });

  describe("Client-Side Encryption & Auditor Envelope (Issue #171)", () => {
    it("validates required form fields before encryption", async () => {
      const missingDescription: DisputeFormData = {
        saleId: 4,
        txHash: "0x4d1e0f9a8b7c",
        orderIds: "ORD-99",
        description: "",
        files: [],
      };

      await expect(createEncryptedDispute(missingDescription)).rejects.toThrow(
        "Dispute evidence description is required.",
      );

      const missingOrderIds: DisputeFormData = {
        saleId: 4,
        txHash: "0x4d1e0f9a8b7c",
        orderIds: "   ",
        description: "Legitimate sale",
        files: [],
      };

      await expect(createEncryptedDispute(missingOrderIds)).rejects.toThrow(
        "Merchant order ID reference is required.",
      );

      const missingTxHash: DisputeFormData = {
        saleId: 4,
        txHash: "   ",
        orderIds: "ORD-99",
        description: "Legitimate sale",
        files: [],
      };

      await expect(createEncryptedDispute(missingTxHash)).rejects.toThrow(
        "Conversion transaction hash is required.",
      );
    });

    it("encrypts evidence payload and wraps session key for protocol auditors", async () => {
      const auditorKey = DEFAULT_PROTOCOL_AUDITOR_KEYS[0];

      const disputeData: DisputeFormData = {
        saleId: 4,
        txHash: "0x4d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e",
        orderIds: "ORD-8472, ORD-8473",
        description:
          "Customer clicked Telegram campaign link and completed checkout. Verified via click ID #CLK-99.",
        files: [
          {
            name: "order-confirmation.png",
            type: "image/png",
            size: 1024,
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          },
        ],
        affiliateAddress: "GAFFILIATE7TEST7WALLET7ADDRESS777777777777777777777777",
      };

      const record = await createEncryptedDispute(disputeData, [auditorKey]);

      expect(record.docketId).toMatch(/^DKT-/);
      expect(record.status).toBe("under_review");
      expect(record.fileCount).toBe(1);
      expect(record.encryptedEnvelope).toBeDefined();
      expect(record.wrappedKeys[auditorKey]).toBeDefined();

      // Verify that auditor can unwrap the AES key and decrypt the payload
      const unwrappedKey = await unwrapDisputeEvidenceKey(
        record.wrappedKeys[auditorKey],
        auditorKey,
      );

      const decryptedPayload = (await decryptPayload(record.encryptedEnvelope, unwrappedKey)) as {
        saleId: number;
        orderIds: string;
        description: string;
        files: Array<{ name: string }>;
      };

      expect(decryptedPayload.saleId).toBe(4);
      expect(decryptedPayload.orderIds).toBe("ORD-8472, ORD-8473");
      expect(decryptedPayload.description).toContain("Customer clicked Telegram campaign link");
      expect(decryptedPayload.files).toHaveLength(1);
      expect(decryptedPayload.files[0].name).toBe("order-confirmation.png");

      // Verify that a dispute event was logged to the tamper-evident audit ledger
      const auditEvents = readAuditLedger();
      const disputeEvent = auditEvents.find((e) => e.action === "dispute_opened");
      expect(disputeEvent).toBeDefined();
      expect(disputeEvent?.saleId).toBe("4");
      expect(disputeEvent?.detail).toContain(record.docketId);
    }, 30000);

    it("handles ledger logging failure gracefully during dispute creation", async () => {
      const auditLedger = await import("../lib/auditLedger");
      const spy = vi
        .spyOn(auditLedger, "appendAuditAccessEvent")
        .mockRejectedValueOnce(new Error("Ledger disk failure"));
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const disputeData: DisputeFormData = {
        saleId: 5,
        txHash: "0x4d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e",
        orderIds: "ORD-999",
        description: "Valid dispute with failing audit ledger",
        files: [],
      };

      const record = await createEncryptedDispute(disputeData);
      expect(record).toBeDefined();
      expect(record.docketId).toMatch(/^DKT-/);
      expect(consoleWarnSpy).toHaveBeenCalled();

      spy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("DisputeForm & DisputeModal Interactive UI Components", () => {
    const sampleSale: Sale = {
      id: 4,
      affiliate: "GBBD...5678",
      saleAmount: "340.0",
      commissionAmount: "34.0",
      timestamp: Math.floor(Date.now() / 1000) - 100000,
      clearingPeriod: 604800,
      claimed: false,
      status: "disputed",
      txHash: "0x4d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e",
    };

    it("renders DisputeForm with all fields, transaction hash, and privacy notice", () => {
      render(<DisputeForm sale={sampleSale} onDisputeSubmitted={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.getByText("Open Conversion Dispute")).toBeDefined();
      expect(screen.getByText(/34.0 XLM/)).toBeDefined();
      expect(screen.getByText(sampleSale.txHash!)).toBeDefined();
      expect(screen.getByLabelText(/Merchant Order ID/)).toBeDefined();
      expect(screen.getByLabelText(/Evidence Description/)).toBeDefined();
      expect(screen.getByText(/Protocol Auditor Confidentiality/)).toBeDefined();
      expect(screen.getByText("Submit Dispute for Audit")).toBeDefined();
    });

    it("generates fallback transaction hash when sale.txHash is undefined", () => {
      const saleNoTx: Sale = { ...sampleSale, txHash: undefined };
      render(<DisputeForm sale={saleNoTx} onDisputeSubmitted={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText(/0x0004e9a8b/)).toBeDefined();
    });

    it("calls onCancel when Cancel button is clicked", () => {
      const onCancel = vi.fn();
      render(<DisputeForm sale={sampleSale} onDisputeSubmitted={vi.fn()} onCancel={onCancel} />);

      const cancelBtn = screen.getByText("Cancel");
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("handles file input changes, drag-and-drop, and file removal", async () => {
      render(<DisputeForm sale={sampleSale} onDisputeSubmitted={vi.fn()} onCancel={vi.fn()} />);

      // Create dummy file
      const file = new File(["test evidence content"], "evidence.png", { type: "image/png" });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeDefined();

      // Trigger change
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("evidence.png")).toBeDefined();
      });

      // Remove the file
      const removeBtn = screen.getByLabelText("Remove evidence.png");
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(screen.queryByText("evidence.png")).toBeNull();
      });

      // Test drag & drop
      const dropZone = screen.getByText(/Click to browse/).parentElement!;
      fireEvent.dragEnter(dropZone);
      fireEvent.dragOver(dropZone);
      fireEvent.dragLeave(dropZone);

      const droppedFile = new File(["dropped file"], "screenshot.jpg", { type: "image/jpeg" });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [droppedFile] },
      });

      await waitFor(() => {
        expect(screen.getByText("screenshot.jpg")).toBeDefined();
      });
    });

    it("rejects files exceeding size limit and unsupported file extensions", async () => {
      render(<DisputeForm sale={sampleSale} onDisputeSubmitted={vi.fn()} onCancel={vi.fn()} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      // Oversized file
      const largeFile = new File(["dummy"], "big.pdf", { type: "application/pdf" });
      Object.defineProperty(largeFile, "size", { value: 11 * 1024 * 1024 }); // 11MB

      fireEvent.change(input, { target: { files: [largeFile] } });
      await waitFor(() => {
        expect(screen.getByText(/exceeds maximum allowed size/)).toBeDefined();
      });

      // Unsupported extension
      const badFile = new File(["script"], "malware.exe", { type: "application/x-msdownload" });
      fireEvent.change(input, { target: { files: [badFile] } });
      await waitFor(() => {
        expect(screen.getByText(/is not supported/)).toBeDefined();
      });
    });

    it("submits the form successfully and triggers onDisputeSubmitted callback", async () => {
      const onDisputeSubmitted = vi.fn();
      render(
        <DisputeForm
          sale={sampleSale}
          onDisputeSubmitted={onDisputeSubmitted}
          onCancel={vi.fn()}
        />,
      );

      const orderInput = screen.getByLabelText(/Merchant Order ID/);
      const descInput = screen.getByLabelText(/Evidence Description/);

      fireEvent.change(orderInput, { target: { value: "ORD-99123" } });
      fireEvent.change(descInput, {
        target: { value: "Valid conversion confirmed by email confirmation." },
      });

      const submitBtn = screen.getByText("Submit Dispute for Audit");
      fireEvent.click(submitBtn);

      await waitFor(
        () => {
          expect(onDisputeSubmitted).toHaveBeenCalledWith(
            sampleSale.id,
            expect.stringMatching(/^DKT-/),
            expect.objectContaining({
              saleId: sampleSale.id,
              orderIds: "ORD-99123",
            }),
          );
        },
        { timeout: 10000 },
      );
    });

    it("renders DisputeModal and handles open/close states", () => {
      const onClose = vi.fn();

      // When sale is null, renders nothing
      const { rerender } = render(
        <DisputeModal isOpen={true} onClose={onClose} sale={null} onDisputeSubmitted={vi.fn()} />,
      );
      expect(screen.queryByText("Open Conversion Dispute")).toBeNull();

      // When open with sale
      rerender(
        <DisputeModal
          isOpen={true}
          onClose={onClose}
          sale={sampleSale}
          onDisputeSubmitted={vi.fn()}
        />,
      );
      expect(screen.getByText("Open Conversion Dispute")).toBeDefined();
    });
  });

  describe("SalesList Dispute Integration (Acceptance Criteria)", () => {
    it("AC 1 & AC 3: Disputed rows show 'Open Dispute' button and 'Under Auditor Review' badge", async () => {
      const mockSales: Sale[] = [
        {
          id: 4,
          affiliate: "GBBD...5678",
          saleAmount: "340.0",
          commissionAmount: "34.0",
          timestamp: Math.floor(Date.now() / 1000) - 100000,
          clearingPeriod: 604800,
          claimed: false,
          status: "disputed",
          txHash: "0x4d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e",
        },
        {
          id: 5,
          affiliate: "GBBD...5678",
          saleAmount: "210.0",
          commissionAmount: "21.0",
          timestamp: Math.floor(Date.now() / 1000) - 200000,
          clearingPeriod: 604800,
          claimed: false,
          status: "under_review",
          txHash: "0x5e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f",
          disputeDocketId: "DKT-2026-9C4F",
          disputeSubmittedAt: Math.floor(Date.now() / 1000) - 43200,
        },
      ];

      const showNotification = vi.fn();
      render(
        <NotificationContext.Provider
          value={
            {
              showNotification,
              notifications: [],
              dismissNotification: vi.fn(),
            } as unknown as NotificationContextType
          }
        >
          <SalesList sales={mockSales} />
        </NotificationContext.Provider>,
      );

      // Status badges
      expect(screen.getByText("Conversion Contested")).toBeDefined();
      expect(screen.getByText("Evidence Under Review")).toBeDefined();
      expect(screen.getAllByText(/DKT-2026-9C4F/).length).toBeGreaterThan(0);

      // Open Dispute action button
      const openDisputeBtn = screen.getByText("Open Dispute");
      expect(openDisputeBtn).toBeDefined();

      // Clicking Open Dispute opens the modal
      fireEvent.click(openDisputeBtn);
      await waitFor(() => {
        expect(screen.getByText("Open Conversion Dispute")).toBeDefined();
      });

      // Filter by Disputed tab
      const disputedTab = screen.getByTestId("filter-disputed");
      fireEvent.click(disputedTab);
      expect(screen.getByText("Conversion Contested")).toBeDefined();
    });

    it("syncs persisted dispute dockets into SalesList on initial load", () => {
      saveDisputeRecord({
        docketId: "DKT-SYNC-001",
        saleId: 1,
        txHash: "0x1111",
        orderIds: "ORD-SYNC",
        description: "Auto synced",
        fileCount: 0,
        fileNames: [],
        encryptedEnvelope: "enc",
        wrappedKeys: {},
        status: "under_review",
        submittedAt: Date.now(),
      });

      const mockSales: Sale[] = [
        {
          id: 1,
          affiliate: "GBBD...5678",
          saleAmount: "100.0",
          commissionAmount: "10.0",
          timestamp: Math.floor(Date.now() / 1000) - 50000,
          clearingPeriod: 604800,
          claimed: false,
        },
      ];

      render(<SalesList sales={mockSales} />);
      expect(screen.getByText("Evidence Under Review")).toBeDefined();
      expect(screen.getAllByText(/DKT-SYNC-001/).length).toBeGreaterThan(0);
    });

    it("handles decrypt button click, dialog open, and search input filtering in SalesList", async () => {
      const mockSales: Sale[] = [
        {
          id: 1,
          affiliate: "GBBD...5678",
          saleAmount: "100.0",
          commissionAmount: "10.0",
          timestamp: Math.floor(Date.now() / 1000) - 86400,
          clearingPeriod: 604800,
          claimed: false,
          status: "in_clearing",
        },
      ];

      render(<SalesList sales={mockSales} />);
      const searchInput = screen.getByTestId("search-sales-input");
      fireEvent.change(searchInput, { target: { value: "100.0" } });
      expect(screen.getByText("100.0 XLM")).toBeDefined();

      const decryptBtn = screen.getByText("Decrypt");
      fireEvent.click(decryptBtn);
      await waitFor(() => {
        expect(screen.getByText("Decrypted Sale Data")).toBeDefined();
      });
    });

    it("submits dispute from SalesList and shows success notification", async () => {
      const mockSales: Sale[] = [
        {
          id: 4,
          affiliate: "GBBD...5678",
          saleAmount: "340.0",
          commissionAmount: "34.0",
          timestamp: Math.floor(Date.now() / 1000) - 100000,
          clearingPeriod: 604800,
          claimed: false,
          status: "disputed",
          txHash: "0x4d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e",
        },
      ];

      const showNotification = vi.fn();
      render(
        <NotificationContext.Provider
          value={
            {
              showNotification,
              notifications: [],
              dismissNotification: vi.fn(),
            } as unknown as NotificationContextType
          }
        >
          <SalesList sales={mockSales} />
        </NotificationContext.Provider>,
      );

      fireEvent.click(screen.getByText("Open Dispute"));
      fireEvent.change(screen.getByLabelText(/Merchant Order ID/), {
        target: { value: "ORD-1234" },
      });
      fireEvent.change(screen.getByLabelText(/Evidence Description/), {
        target: { value: "Valid conversion confirmed with click logs" },
      });
      fireEvent.click(screen.getByText("Submit Dispute for Audit"));

      await waitFor(() => {
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "success",
            title: "Dispute Docket Created",
          }),
        );
      });
    });
  });

  describe("AuditAccessPortal dispute_opened mapping", () => {
    it("renders AuditAccessPortal with audit action mappings", () => {
      render(
        <NotificationContext.Provider
          value={
            {
              showNotification: vi.fn(),
              notifications: [],
              dismissNotification: vi.fn(),
            } as unknown as NotificationContextType
          }
        >
          <AuditAccessPortal />
        </NotificationContext.Provider>,
      );
      expect(screen.getByText("Access Log Transparency Portal")).toBeDefined();
    });
  });
});
