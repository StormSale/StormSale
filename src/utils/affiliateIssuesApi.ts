import { affiliateIssueReportSchema, affiliateIssueReportsResponseSchema } from "../lib/validation";
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

export async function fetchAffiliateIssueReports(
  affiliateAddress: string,
  signal?: AbortSignal,
): Promise<AffiliateIssueReport[]> {
  if (!affiliateAddress.trim()) {
    throw new Error("Connect your affiliate wallet to view issue reports.");
  }

  const query = new URLSearchParams({ affiliateAddress: affiliateAddress.trim() });
  const response = await fetch(`${API_URL}/affiliate/issues?${query}`, { signal });
  if (!response.ok) {
    throw await getApiError(response, "Could not load issue reports");
  }

  return affiliateIssueReportsResponseSchema.parse(await response.json());
}

export async function submitAffiliateIssueReport(
  draft: AffiliateIssueDraft,
): Promise<AffiliateIssueReport> {
  if (!draft.affiliateAddress.trim()) {
    throw new Error("Connect your affiliate wallet before submitting a report.");
  }

  const body = new FormData();
  body.set("affiliateAddress", draft.affiliateAddress.trim());
  body.set("campaignId", draft.campaignId.trim());
  body.set("saleDate", draft.saleDate);
  body.set("details", draft.details.trim());
  if (draft.expectedSaleAmount?.trim()) {
    body.set("expectedSaleAmount", draft.expectedSaleAmount.trim());
  }
  draft.attachments.forEach((file) => body.append("attachments", file, file.name));

  const response = await fetch(`${API_URL}/affiliate/issues`, {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw await getApiError(response, "Could not submit issue report");
  }

  return affiliateIssueReportSchema.parse(await response.json());
}
