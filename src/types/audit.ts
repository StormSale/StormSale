/**
 * Audit log types for enterprise compliance
 */

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: AuditAction;
  resource: AuditResource;
  metadata: Record<string, unknown>;
  status: "success" | "failed";
  error?: string;
  ipAddress: string;
}

export type AuditAction =
  | "ESCROW_WITHDRAW"
  | "ESCROW_DEPOSIT"
  | "CAMPAIGN_CREATED"
  | "CAMPAIGN_UPDATED"
  | "CAMPAIGN_DELETED"
  | "ACCESS_GRANTED"
  | "ACCESS_REVOKED"
  | "PAYOUT_CLAIMED"
  | "PAYOUT_REJECTED"
  | "SETTLEMENT_PROCESSED";

export interface AuditResource {
  type: "campaign" | "escrow" | "user" | "payout" | "audit";
  id: string;
  name: string;
}

export interface AuditLogFilters {
  actor?: string;
  partialMatch?: boolean;
  startDate?: string;
  endDate?: string;
  actionTypes?: AuditAction[];
  searchQuery?: string;
}

export interface AuditLogExport {
  logs: AuditLogEntry[];
  exportedAt: string;
  exportedBy: string;
  format: "json" | "csv";
  signature?: string;
}
