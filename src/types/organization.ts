/**
 * StormSale Team Permission & Multi-User Organization Types (#154, #489)
 */

export type OrganizationRole =
  | "ADMIN"
  | "MARKETING_MANAGER"
  | "CAMPAIGN_MANAGER"
  | "EDITOR"
  | "FINANCE"
  | "VIEWER"
  | "NONE";

export type OrganizationCapability =
  | "campaign:create"
  | "campaign:edit"
  | "sale:log"
  | "escrow:refund"
  | "escrow:refill"
  | "team:manage"
  | "analytics:view"
  | "audit:grant";

export interface TeamMember {
  id: string;
  walletAddress: string;
  name: string;
  role: OrganizationRole;
  addedAt: string;
  addedBy: string;
  authSignatureStatus: "verified" | "pending";
  signatureTimestamp?: string;
  authSignature?: string;
  email?: string;
  inviteToken?: string;
  status?: "PENDING" | "ACTIVE" | "REVOKED";
}

export interface OrganizationState {
  id: string;
  name: string;
  ownerAddress: string;
  members: TeamMember[];
  updatedAt: string;
}

export interface OrganizationAuthChallenge {
  challengeNonce: string;
  timestamp: string;
  orgId: string;
  memberAddress: string;
  messageToSign: string;
}

export interface RoleDefinition {
  role: OrganizationRole;
  label: string;
  description: string;
  badgeClass: string;
  capabilities: OrganizationCapability[];
}
