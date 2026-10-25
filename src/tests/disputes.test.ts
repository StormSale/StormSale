import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchDisputes,
  submitDisputeReport,
  getDisputeStatusLabel,
  validateDisputeAttachment,
  validateDisputeSaleAmount,
  MAX_ATTACHMENT_SIZE_BYTES,
  resetDisputesStore,
  type DisputeReport,
  type DisputeCategory,
  type DisputeStatus,
} from "../utils/disputes";
import {
  handleDisputeFileProcessing,
  createDisputeFileHandler,
} from "../components/affiliate/IssueDisputeManager";

describe("Issue Reporting & Dispute Protocol Suite (#55)", () => {
  const mockStorageStore = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => mockStorageStore.get(key) ?? null,
    setItem: (key: string, val: string) => {
      mockStorageStore.set(key, String(val));
    },
    removeItem: (key: string) => {
      mockStorageStore.delete(key);
    },
    clear: () => {
      mockStorageStore.clear();
    },
  };

  beforeEach(() => {
    mockStorageStore.clear();
    vi.stubGlobal("window", { localStorage: mockStorage });
    vi.stubGlobal("localStorage", mockStorage);
    resetDisputesStore();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/affiliate/disputes")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches the list of initial mock dispute reports", async () => {
    const disputes = await fetchDisputes();
    expect(Array.isArray(disputes)).toBe(true);
    expect(disputes.length).toBeGreaterThanOrEqual(2);

    const first = disputes[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("campaignId");
    expect(first).toHaveProperty("campaignName");
    expect(first).toHaveProperty("orderReference");
    expect(first).toHaveProperty("status");
    expect(first).toHaveProperty("category");
  });

  it("submits a new standardized dispute report with calculated expected commission", async () => {
    const initialDisputes = await fetchDisputes();
    const initialCount = initialDisputes.length;

    const payload: Omit<DisputeReport, "id" | "status" | "submittedAt" | "updatedAt"> = {
      campaignId: 3,
      campaignName: "Crypto Security Hardware",
      orderReference: "ORD-TEST-9921",
      referralLinkUsed: "https://stormsale.xyz/c/3?ref=GBBD5678",
      estimatedSaleAmountXlm: 450.0,
      expectedCommissionXlm: 45.0,
      category: "missing_attribution" as DisputeCategory,
      description: "Customer ordered Ledger Nano X with referral coupon but sale was not recorded.",
      attachmentName: "receipt_screenshot.png",
      attachmentSize: "320 KB",
      attachmentPreview:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };

    const created = await submitDisputeReport(payload);

    expect(created.id.startsWith("DSP-")).toBe(true);
    expect(created.id).toMatch(/^DSP-[A-Z0-9]+$/);
    expect(created.status).toBe("submitted");
    expect(created.orderReference).toBe("ORD-TEST-9921");
    expect(created.estimatedSaleAmountXlm).toBe(450.0);
    expect(created.expectedCommissionXlm).toBe(45.0);
    expect(created.submittedAt).toBeDefined();
    expect(created.attachmentName).toBe("receipt_screenshot.png");

    const updatedDisputes = await fetchDisputes();
    expect(updatedDisputes.length).toBe(initialCount + 1);
    expect(updatedDisputes[0].id).toBe(created.id);
  });

  it("maps dispute statuses to human-readable progress labels", () => {
    const statuses: DisputeStatus[] = [
      "submitted",
      "under_review",
      "investigating",
      "approved",
      "rejected",
    ];

    const expectedLabels = [
      "Submitted",
      "Under Review",
      "Investigating",
      "Approved & Credited",
      "Rejected",
    ];

    statuses.forEach((status, idx) => {
      expect(getDisputeStatusLabel(status)).toBe(expectedLabels[idx]);
    });
  });

  it("validates file attachment size constraint under 5MB using component file handler", () => {
    expect(MAX_ATTACHMENT_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(validateDisputeAttachment(2.4 * 1024 * 1024).valid).toBe(true);
    expect(validateDisputeAttachment(6.2 * 1024 * 1024).valid).toBe(false);

    // 1. Valid image file (< 5MB) triggers FileReader and sets preview
    let successFile: File | null = null;
    let successPreview: string | null = null;
    let errorMessage: string | null = null;

    const validFile = new File(["sample image bytes"], "receipt.png", { type: "image/png" });
    Object.defineProperty(validFile, "size", { value: 2.4 * 1024 * 1024 });

    const mockFileReader = {
      result: "data:image/png;base64,mockpreviewdata",
      onload: null as ((this: FileReader, ev: ProgressEvent) => void) | null,
      readAsDataURL: function (this: {
        onload: ((this: FileReader, ev: ProgressEvent) => void) | null;
      }) {
        if (this.onload) {
          this.onload.call(this as unknown as FileReader, {} as ProgressEvent);
        }
      },
    } as unknown as FileReader;

    const accepted = handleDisputeFileProcessing(
      validFile,
      {
        onError: (err) => {
          errorMessage = err;
        },
        onSuccess: (file, preview) => {
          successFile = file;
          successPreview = preview;
        },
      },
      mockFileReader,
    );

    expect(accepted).toBe(true);
    expect(errorMessage).toBeNull();
    expect(successFile).toBe(validFile);
    expect(successPreview).toBe("data:image/png;base64,mockpreviewdata");

    // 2. Oversized file (> 5MB) is rejected by component validator and triggers onError
    let rejectedError: string | null = null;
    let rejectedFile: File | null = null;
    const oversizedFile = new File(["oversized blob"], "large_log.mp4", { type: "video/mp4" });
    Object.defineProperty(oversizedFile, "size", { value: 6.2 * 1024 * 1024 });

    const rejected = handleDisputeFileProcessing(oversizedFile, {
      onError: (err) => {
        rejectedError = err;
      },
      onSuccess: (file) => {
        rejectedFile = file;
      },
    });

    expect(rejected).toBe(false);
    expect(rejectedError).toContain("5MB");
    expect(rejectedFile).toBeNull();
  });

  it("validates sale amount correctly and rejects invalid/negative values", () => {
    expect(validateDisputeSaleAmount("150.5").valid).toBe(true);
    expect(validateDisputeSaleAmount("150.5").value).toBe(150.5);

    expect(validateDisputeSaleAmount("0").valid).toBe(false);
    expect(validateDisputeSaleAmount("-50").valid).toBe(false);
    expect(validateDisputeSaleAmount("invalid").valid).toBe(false);
    expect(validateDisputeSaleAmount("").valid).toBe(false);
  });

  it("ignores late FileReader preview callbacks if file selection was cleared or replaced", () => {
    let uploadedFile: File | null = null;
    let previewResult: string | null = null;
    let uploadError: string | null = null;
    const currentFileRef = { current: null as File | null };

    const fileA = new File(["bytes A"], "fileA.png", { type: "image/png" });
    Object.defineProperty(fileA, "size", { value: 1024 });

    // Mock delayed FileReader
    let pendingOnload: (() => void) | null = null;
    const delayedFileReader = {
      result: "data:image/png;base64,fileA_data",
      onload: null as ((this: FileReader, ev: ProgressEvent) => void) | null,
      readAsDataURL: function (this: {
        onload: ((this: FileReader, ev: ProgressEvent) => void) | null;
      }) {
        pendingOnload = () => {
          if (this.onload) this.onload.call(this as unknown as FileReader, {} as ProgressEvent);
        };
      },
    } as unknown as FileReader;

    const handler = createDisputeFileHandler(
      currentFileRef,
      {
        setUploadedFile: (f) => {
          uploadedFile = f;
        },
        setPreviewUrl: (p) => {
          previewResult = p;
        },
        setUploadError: (err) => {
          uploadError = err;
        },
      },
      delayedFileReader,
    );

    // User selects fileA
    handler.handleFileSelect(fileA);
    expect(currentFileRef.current).toBe(fileA);

    // User removes file before FileReader completes
    handler.removeFile();
    expect(currentFileRef.current).toBeNull();
    expect(uploadedFile).toBeNull();

    // Late FileReader callback fires
    if (pendingOnload) {
      (pendingOnload as () => void)();
    }

    // Preview should NOT be set because selection was cleared
    expect(previewResult).toBeNull();
    expect(uploadError).toBeNull();
  });

  it("preserves empty dispute list when localStorage has an empty array", async () => {
    mockStorage.setItem("stormsale_disputes_ledger", JSON.stringify([]));
    resetDisputesStore();
    const disputes = await fetchDisputes();
    expect(disputes).toEqual([]);
  });

  it("rejects non-positive sale amount in submitDisputeReport", async () => {
    await expect(
      submitDisputeReport({
        campaignId: 1,
        campaignName: "Tech Gadgets Pro",
        orderReference: "ORD-FAIL",
        referralLinkUsed: "https://stormsale.xyz",
        estimatedSaleAmountXlm: 0,
        expectedCommissionXlm: 0,
        category: "missing_attribution" as DisputeCategory,
        description: "Zero amount test",
      }),
    ).rejects.toThrow(/positive/);

    await expect(
      submitDisputeReport({
        campaignId: 1,
        campaignName: "Tech Gadgets Pro",
        orderReference: "ORD-FAIL-2",
        referralLinkUsed: "https://stormsale.xyz",
        estimatedSaleAmountXlm: -10,
        expectedCommissionXlm: -1,
        category: "missing_attribution" as DisputeCategory,
        description: "Negative amount test",
      }),
    ).rejects.toThrow(/positive/);
  });
});
