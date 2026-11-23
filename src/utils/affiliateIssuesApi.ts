import {
  affiliateIssueDraftSchema,
  affiliateIssueReportSchema,
  affiliateIssueReportsResponseSchema,
} from "../lib/validation";
import {
  buildAffiliateIssueAuthMessage,
  type AffiliateIssueAction,
  type AffiliateIssueSubmission,
} from "../lib/affiliateIssueAuth";
import { freighterSigner, type MessageSigner } from "../lib/telegramClient";
import { API_URL } from "./api";

export type AffiliateIssueReport = ReturnType<typeof affiliateIssueReportSchema.parse>;
export type AffiliateIssueStatus = AffiliateIssueReport["status"];

export interface AffiliateIssueDraft {
  affiliateAddress: string;
  campaignId: string;
  saleDate: string;
  expectedSaleAmount?: string;
  details: string;
  attachments: File[];
}

async function getApiError(response: Response, fallback: string): Promise<Error> {
  try {
    const body: unknown = await response.json();
    if (
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.trim()
    ) {
      return new Error(body.error);
    }
  } catch {
    // Non-JSON error responses use the status-based fallback below.
  }
  return new Error(`${fallback} (${response.status})`);
}

async function signedHeaders(
  action: AffiliateIssueAction,
  wallet: string,
  signer: MessageSigner,
  payload?: AffiliateIssueSubmission,
): Promise<Record<string, string>> {
  const timestamp = Date.now();
  const signature = await signer(
    buildAffiliateIssueAuthMessage(action, wallet, timestamp, payload),
    wallet,
  );
  return {
    "X-StormSale-Wallet": wallet,
    "X-StormSale-Timestamp": String(timestamp),
    "X-StormSale-Signature": signature,
  };
}

export async function fetchAffiliateIssueReports(
  affiliateAddress: string,
  signal?: AbortSignal,
  signer: MessageSigner = freighterSigner,
): Promise<AffiliateIssueReport[]> {
  if (!affiliateAddress.trim()) {
    throw new Error("Connect your affiliate wallet to view issue reports.");
  }

  const wallet = affiliateAddress.trim();
  const headers = await signedHeaders("read", wallet, signer);
  const response = await fetch(`${API_URL}/affiliate/issues`, { headers, signal });
  if (!response.ok) {
    throw await getApiError(response, "Could not load issue reports");
  }

  return affiliateIssueReportsResponseSchema.parse(await response.json());
}

export async function submitAffiliateIssueReport(
  draft: AffiliateIssueDraft,
  signer: MessageSigner = freighterSigner,
): Promise<AffiliateIssueReport> {
  if (!draft.affiliateAddress.trim()) {
    throw new Error("Connect your affiliate wallet before submitting a report.");
  }
  if (draft.attachments.length > 0) {
    throw new Error(
      "Private evidence storage is not configured. Remove attachments before submitting.",
    );
  }

  const wallet = draft.affiliateAddress.trim();
  const payload = affiliateIssueDraftSchema.parse({
    campaignId: draft.campaignId,
    saleDate: draft.saleDate,
    expectedSaleAmount: draft.expectedSaleAmount,
    details: draft.details,
  });
  const headers = await signedHeaders("submit", wallet, signer, payload);
  const body = JSON.stringify(payload);

  const response = await fetch(`${API_URL}/affiliate/issues`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    throw await getApiError(response, "Could not submit issue report");
  }

  return affiliateIssueReportSchema.parse(await response.json());
}
