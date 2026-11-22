/**
 * StormSale B2B Organization KYB Compliance Types & Constants (Issue #445)
 */

export type KybStatus = "UNVERIFIED" | "PENDING_REVIEW" | "VERIFIED" | "ACTION_REQUIRED";

export const ALLOWED_KYB_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type AllowedKybMimeType = (typeof ALLOWED_KYB_MIME_TYPES)[number];
