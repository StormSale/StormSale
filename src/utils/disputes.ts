export type DisputeStatus =
  "submitted" | "under_review" | "investigating" | "approved" | "rejected";

export type DisputeCategory =
  "missing_attribution" | "incorrect_commission" | "uncredited_sale" | "delayed_clearing" | "other";

export interface DisputeReport {
  id: string;
  campaignId: number;
  campaignName: string;
  orderReference: string;
  referralLinkUsed: string;
  estimatedSaleAmountXlm: number;
  expectedCommissionXlm: number;
  category: DisputeCategory;
  description: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentPreview?: string; // data URL
  status: DisputeStatus;
  submittedAt: string;
  updatedAt: string;
  advertiserResponse?: string;
  syncStatus?: "synced" | "pending_sync";
  persisted?: boolean;
}

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateDisputeAttachment(size: number): { valid: boolean; error?: string } {
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: "File size exceeds 5MB limit. Please upload a smaller screenshot.",
    };
  }
  return { valid: true };
}

export function validateDisputeSaleAmount(amount: unknown): {
  valid: boolean;
  value?: number;
  error?: string;
} {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) {
    return {
      valid: false,
      error: "Please enter a valid, positive sale amount in XLM.",
    };
  }
  return { valid: true, value: num };
}

const STORAGE_KEY = "stormsale_disputes_ledger";

let disputeCounter = 1043;

export const generateDisputeId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `DSP-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  }
  disputeCounter += 1;
  return `DSP-${disputeCounter}-${Date.now().toString(36).toUpperCase()}`;
};

const initialDisputes: DisputeReport[] = [
  {
    id: "DSP-1042",
    campaignId: 1,
    campaignName: "Tech Gadgets Pro",
    orderReference: "ORD-98432-TG",
    referralLinkUsed: "https://stormsale.xyz/c/1?ref=GBBD5678",
    estimatedSaleAmountXlm: 350.0,
    expectedCommissionXlm: 35.0,
    category: "missing_attribution",
    description:
      "Customer completed purchase via my referral link on 10/12/2026. The order confirmation shows my affiliate tag but the commission did not log on-chain.",
    attachmentName: "customer_checkout_confirmation.png",
    attachmentSize: "245 KB",
    status: "under_review",
    submittedAt: "10/13/2026, 02:40 PM",
    updatedAt: "10/14/2026, 09:15 AM",
    advertiserResponse: "Reviewing order logs in Shopify integration webhook.",
  },
  {
    id: "DSP-1038",
    campaignId: 2,
    campaignName: "Web3 Masterclass 2026",
    orderReference: "TX-77821-W3",
    referralLinkUsed: "https://stormsale.xyz/c/2?ref=GBBD5678",
    estimatedSaleAmountXlm: 200.0,
    expectedCommissionXlm: 20.0,
    category: "uncredited_sale",
    description:
      "Course enrollment confirmed by customer via Telegram. Attribution missing from sale ledger.",
    attachmentName: "telegram_payment_receipt.jpg",
    attachmentSize: "180 KB",
    status: "approved",
    submittedAt: "10/10/2026, 11:20 AM",
    updatedAt: "10/11/2026, 04:30 PM",
    advertiserResponse:
      "Attribution verified via customer cookie match. 20 XLM credited to claimable escrow.",
  },
];

const getLocalStorage = (): Storage | null => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
};

const loadStoredDisputes = (): DisputeReport[] => {
  const storage = getLocalStorage();
  if (storage) {
    try {
      const stored = storage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }
  return initialDisputes;
};

export const persistDisputes = (reports: DisputeReport[]): boolean => {
  const storage = getLocalStorage();
  if (storage) {
    try {
      const sanitized = reports.map(({ attachmentPreview: _, ...rest }) => rest);
      storage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

let disputesStore: DisputeReport[] = loadStoredDisputes();

export const resetDisputesStore = (custom?: DisputeReport[]) => {
  disputesStore = custom ? [...custom] : loadStoredDisputes();
};

export const fetchDisputes = async (): Promise<DisputeReport[]> => {
  try {
    const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001/api";
    const res = await fetch(`${API_URL}/affiliate/disputes`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const validServerReports = data.filter((d): d is DisputeReport =>
          Boolean(
            d &&
            typeof d === "object" &&
            typeof d.id === "string" &&
            typeof d.campaignId === "number" &&
            typeof d.orderReference === "string" &&
            typeof d.status === "string",
          ),
        );
        const serverMap = new Map(validServerReports.map((r) => [r.id, r]));
        const merged = disputesStore.map((local) => serverMap.get(local.id) || local);
        for (const s of validServerReports) {
          if (!merged.some((m) => m.id === s.id)) {
            merged.push(s);
          }
        }
        disputesStore = merged;
        persistDisputes(disputesStore);
      }
    }
  } catch {
    // Offline / fallback to local persistent store
  }
  return [...disputesStore];
};

export const submitDisputeReport = async (
  report: Omit<DisputeReport, "id" | "status" | "submittedAt" | "updatedAt">,
): Promise<DisputeReport> => {
  const saleValidation = validateDisputeSaleAmount(report.estimatedSaleAmountXlm);
  if (!saleValidation.valid || saleValidation.value === undefined) {
    throw new Error(saleValidation.error || "Please enter a valid, positive sale amount in XLM.");
  }

  const id = generateDisputeId();
  const now = new Date().toLocaleString();

  let syncStatus: "synced" | "pending_sync" = "pending_sync";
  try {
    const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001/api";
    const res = await fetch(`${API_URL}/affiliate/disputes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...report,
        id,
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
      }),
    });
    if (res.ok) {
      syncStatus = "synced";
    }
  } catch {
    syncStatus = "pending_sync";
  }

  const newReport: DisputeReport = {
    ...report,
    id,
    status: "submitted",
    submittedAt: now,
    updatedAt: now,
    syncStatus,
  };

  disputesStore = [newReport, ...disputesStore];
  const persisted = persistDisputes(disputesStore);
  newReport.persisted = persisted;

  return newReport;
};

export const getDisputeStatusLabel = (status: DisputeStatus): string => {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "under_review":
      return "Under Review";
    case "investigating":
      return "Investigating";
    case "approved":
      return "Approved & Credited";
    case "rejected":
      return "Rejected";
  }
};
