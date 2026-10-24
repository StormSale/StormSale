/**
 * Private campaigns and affiliate applications.
 *
 * A campaign is either **public** (anyone may promote it — the existing
 * behaviour) or **private** ("application required"). A campaign this browser
 * holds no policy for is reported as visibility "unknown" and still allowed
 * (see {@link getAffiliateAccess}). For a private campaign an affiliate
 * must apply with the channels they will promote on, and the advertiser must
 * approve them before they can:
 *
 *   1. generate a tracking link for the campaign ({@link buildTrackingLink}), or
 *   2. have a sale logged against them through the Log Sale form, which checks
 *      {@link getAffiliateAccess} before any encryption or submission work.
 *
 * ## Where the whitelist lives
 *
 * The campaign escrow contract exposes no whitelist entrypoint
 * (`create_campaign`, `log_sale`, `claim_payout`, `get_campaign`,
 * `refund_escrow`), so the whitelist is campaign **metadata**, keyed by
 * campaign id and checked by the client at both gates above. That stops a
 * rejected affiliate from being credited through this app. It is not a
 * substitute for an on-chain check: a caller that bypasses the app and
 * invokes `log_sale` directly is not stopped by metadata. Moving the check
 * into the contract (a `log_sale` guard against an approved set) is the
 * follow-up that makes it trustless — see {@link getAffiliateAccess}, which is
 * the single function to point at an on-chain read when that exists.
 */

import { getLocalStorage } from "./storage";

export type CampaignVisibility = "public" | "private";
export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface CampaignAccessPolicy {
  campaignId: string;
  visibility: CampaignVisibility;
  /** The advertiser who may review applications for this campaign. */
  advertiser: string;
  updatedAt: number;
}

export interface AffiliateApplication {
  id: string;
  campaignId: string;
  affiliate: string;
  /** Where the affiliate will promote: websites, social profiles, channels. */
  channels: string[];
  message: string;
  status: ApplicationStatus;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface AffiliateAccess {
  allowed: boolean;
  /**
   * `"unknown"` when this browser holds no policy for the campaign. Policies
   * live in the advertiser's browser, so "no policy here" means "not set
   * here", which is not the same as "public".
   */
  visibility: CampaignVisibility | "unknown";
  status: ApplicationStatus | "none";
  reason: string;
}

/** Thrown when an affiliate is not cleared for a private campaign. */
export class CampaignAccessError extends Error {
  readonly access: AffiliateAccess;

  constructor(message: string, access: AffiliateAccess) {
    super(message);
    this.name = "CampaignAccessError";
    this.access = access;
  }
}

export const MAX_CHANNELS = 5;
export const MAX_MESSAGE_LENGTH = 500;

const POLICY_KEY = "stormsale_campaign_access_policies_v1";
const APPLICATION_KEY = "stormsale_affiliate_applications_v1";

// ─── Validation ─────────────────────────────────────────────────────────────

/** A Stellar account (G…) or contract (C…) address, by shape. */
export function isStellarAccount(address: string): boolean {
  return /^[GC][A-Z2-7]{55}$/.test(address.trim());
}

/** An http(s) URL with a host — what a promotional channel link must be. */
export function isChannelUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Campaign ids are on-chain u32s; accept them as strings, trimmed. */
export function normalizeCampaignId(id: string | number): string {
  const s = String(id).trim();
  if (!/^\d+$/.test(s) || Number(s) > 0xffffffff) {
    throw new Error("Campaign ID must be a whole number (the on-chain campaign id).");
  }
  return String(Number(s));
}

const sameAccount = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

// ─── Storage ────────────────────────────────────────────────────────────────

function read<T>(key: string): T[] {
  try {
    const raw = getLocalStorage().getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Thrown when campaign-access data cannot be saved (storage full, disabled,
 * or blocked in a private window). Callers that run after an on-chain side
 * effect — creating a campaign — catch it and report that the on-chain part
 * succeeded, instead of letting a raw `QuotaExceededError` read as a failure.
 */
export class CampaignAccessStorageError extends Error {
  constructor(cause: unknown) {
    super(
      `This browser could not save the campaign access data (${
        cause instanceof Error ? cause.message : String(cause)
      }).`,
    );
    this.name = "CampaignAccessStorageError";
  }
}

function write<T>(key: string, rows: T[]): void {
  try {
    getLocalStorage().setItem(key, JSON.stringify(rows));
  } catch (err) {
    // Quota exceeded, storage disabled, private mode: nothing was saved, so
    // no change event is sent either.
    console.warn(`[campaignAccess] could not save ${key}:`, err);
    throw new CampaignAccessStorageError(err);
  }
  if (typeof window !== "undefined") {
    // Lets open views (the advertiser queue, the affiliate status card)
    // refresh when another tab or component changes the data.
    window.dispatchEvent(new CustomEvent("stormsale:campaign-access"));
  }
}

// ─── Campaign policy ────────────────────────────────────────────────────────

/** The campaign's policy, or null when this browser holds none (see getAffiliateAccess). */
export function getCampaignPolicy(campaignId: string | number): CampaignAccessPolicy | null {
  const id = normalizeCampaignId(campaignId);
  return read<CampaignAccessPolicy>(POLICY_KEY).find((p) => p.campaignId === id) ?? null;
}

export function isPrivateCampaign(campaignId: string | number): boolean {
  return getCampaignPolicy(campaignId)?.visibility === "private";
}

/**
 * Record a campaign's visibility. Only the advertiser who first set a policy
 * may change it afterwards.
 */
export function setCampaignVisibility(
  campaignId: string | number,
  advertiser: string,
  visibility: CampaignVisibility,
): CampaignAccessPolicy {
  const id = normalizeCampaignId(campaignId);
  if (!advertiser) throw new Error("Connect the advertiser wallet first.");
  const policies = read<CampaignAccessPolicy>(POLICY_KEY);
  const existing = policies.find((p) => p.campaignId === id);
  if (existing && !sameAccount(existing.advertiser, advertiser)) {
    throw new Error("Only the advertiser who owns this campaign can change its visibility.");
  }
  const policy: CampaignAccessPolicy = {
    campaignId: id,
    visibility,
    advertiser: existing?.advertiser ?? advertiser,
    updatedAt: Date.now(),
  };
  write(POLICY_KEY, [...policies.filter((p) => p.campaignId !== id), policy]);
  return policy;
}

/** Every policy an advertiser owns. */
export function listAdvertiserPolicies(advertiser: string): CampaignAccessPolicy[] {
  return read<CampaignAccessPolicy>(POLICY_KEY).filter((p) =>
    sameAccount(p.advertiser, advertiser),
  );
}

// ─── Applications ───────────────────────────────────────────────────────────

export function listApplications(
  filter: {
    campaignId?: string | number;
    affiliate?: string;
    advertiser?: string;
    status?: ApplicationStatus;
  } = {},
): AffiliateApplication[] {
  const campaignId =
    filter.campaignId === undefined ? undefined : normalizeCampaignId(filter.campaignId);
  const owned = filter.advertiser
    ? new Set(listAdvertiserPolicies(filter.advertiser).map((p) => p.campaignId))
    : null;
  return read<AffiliateApplication>(APPLICATION_KEY)
    .filter((a) => campaignId === undefined || a.campaignId === campaignId)
    .filter((a) => !filter.affiliate || sameAccount(a.affiliate, filter.affiliate))
    .filter((a) => !owned || owned.has(a.campaignId))
    .filter((a) => !filter.status || a.status === filter.status)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

/** The affiliate's current application for a campaign, if any. */
export function getApplication(
  campaignId: string | number,
  affiliate: string,
): AffiliateApplication | null {
  return listApplications({ campaignId, affiliate })[0] ?? null;
}

/**
 * Apply to promote a private campaign.
 *
 * Refuses: public campaigns (nothing to apply for), malformed addresses,
 * missing or invalid channel links, and a second application while one is
 * pending or approved. A **rejected** affiliate cannot re-apply on their own —
 * otherwise rejection would only cost them a click; the advertiser can still
 * reverse the decision from the queue.
 */
export function submitApplication(input: {
  campaignId: string | number;
  affiliate: string;
  channels: string[];
  message?: string;
}): AffiliateApplication {
  const campaignId = normalizeCampaignId(input.campaignId);
  const affiliate = input.affiliate.trim();
  if (!isStellarAccount(affiliate)) throw new Error("Connect a valid Stellar wallet to apply.");

  const policy = getCampaignPolicy(campaignId);
  if (!policy || policy.visibility !== "private") {
    throw new Error(
      "This campaign is public — no application is needed. Generate your link directly.",
    );
  }
  if (sameAccount(policy.advertiser, affiliate)) {
    throw new Error("You own this campaign; advertisers do not apply to their own campaigns.");
  }

  const channels = [...new Set(input.channels.map((c) => c.trim()).filter(Boolean))];
  if (channels.length === 0) throw new Error("Add at least one promotional channel link.");
  if (channels.length > MAX_CHANNELS) throw new Error(`Add at most ${MAX_CHANNELS} channel links.`);
  const invalid = channels.find((c) => !isChannelUrl(c));
  if (invalid) throw new Error(`"${invalid}" is not a valid http(s) link.`);

  const message = (input.message ?? "").trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Keep the message under ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const existing = getApplication(campaignId, affiliate);
  if (existing?.status === "pending")
    throw new Error("Your application is already awaiting review.");
  if (existing?.status === "approved")
    throw new Error("You are already approved for this campaign.");
  if (existing?.status === "rejected") {
    throw new Error("Your application for this campaign was declined by the advertiser.");
  }

  const application: AffiliateApplication = {
    id: `app_${campaignId}_${affiliate.slice(0, 8)}_${Date.now().toString(36)}`,
    campaignId,
    affiliate,
    channels,
    message,
    status: "pending",
    submittedAt: Date.now(),
  };
  write(APPLICATION_KEY, [...read<AffiliateApplication>(APPLICATION_KEY), application]);
  return application;
}

/**
 * Approve or reject an application — one call, one click. Only the campaign's
 * advertiser may decide, and a decision can be reversed.
 */
export function reviewApplication(
  applicationId: string,
  reviewer: string,
  decision: "approved" | "rejected",
): AffiliateApplication {
  const all = read<AffiliateApplication>(APPLICATION_KEY);
  const application = all.find((a) => a.id === applicationId);
  if (!application) throw new Error("Application not found.");
  const policy = getCampaignPolicy(application.campaignId);
  if (!policy || !sameAccount(policy.advertiser, reviewer)) {
    throw new Error("Only the campaign's advertiser can review its applications.");
  }
  const updated: AffiliateApplication = {
    ...application,
    status: decision,
    reviewedAt: Date.now(),
    reviewedBy: reviewer,
  };
  write(
    APPLICATION_KEY,
    all.map((a) => (a.id === applicationId ? updated : a)),
  );
  return updated;
}

// ─── Gates ──────────────────────────────────────────────────────────────────

/**
 * May `affiliate` promote `campaignId`? Public campaigns: yes. Private
 * campaigns: only with an approved application.
 *
 * A campaign this browser holds no policy for is reported as
 * `visibility: "unknown"`, never as public. It is still allowed — every
 * campaign created before private campaigns existed has no policy, and the
 * contract does not enforce a whitelist yet (`log_sale` can be called
 * directly), so refusing here would block public campaigns without making
 * private ones any safer. The UI says plainly that it cannot tell.
 *
 * The one place the whitelist is read. When the contract gains an on-chain
 * whitelist, this is the function to point at it.
 */
export function getAffiliateAccess(
  campaignId: string | number,
  affiliate: string,
): AffiliateAccess {
  const policy = getCampaignPolicy(campaignId);
  if (!policy) {
    return {
      allowed: true,
      visibility: "unknown",
      status: "none",
      reason:
        "No access setting for this campaign is stored in this browser. If the advertiser made it " +
        "private on another device, check with them before promoting it.",
    };
  }
  if (policy.visibility === "public") {
    return { allowed: true, visibility: "public", status: "none", reason: "Public campaign." };
  }
  const application = getApplication(campaignId, affiliate);
  switch (application?.status) {
    case "approved":
      return {
        allowed: true,
        visibility: "private",
        status: "approved",
        reason: "Approved by the advertiser.",
      };
    case "rejected":
      return {
        allowed: false,
        visibility: "private",
        status: "rejected",
        reason: "This affiliate's application was rejected for this private campaign.",
      };
    case "pending":
      return {
        allowed: false,
        visibility: "private",
        status: "pending",
        reason: "This affiliate's application is still awaiting the advertiser's review.",
      };
    default:
      return {
        allowed: false,
        visibility: "private",
        status: "none",
        reason: "This is a private campaign and the affiliate has not applied.",
      };
  }
}

/** Throw unless the affiliate is cleared for the campaign. */
export function assertAffiliateAllowed(campaignId: string | number, affiliate: string): void {
  const access = getAffiliateAccess(campaignId, affiliate);
  if (!access.allowed) throw new CampaignAccessError(access.reason, access);
}

/**
 * The affiliate's tracking link for a campaign — only once they are cleared.
 * `origin` defaults to the current site.
 */
export function buildTrackingLink(
  campaignId: string | number,
  affiliate: string,
  origin: string = typeof window !== "undefined" ? window.location.origin : "https://stormsale.app",
): string {
  const id = normalizeCampaignId(campaignId);
  if (!isStellarAccount(affiliate)) throw new Error("Connect a valid Stellar wallet first.");
  assertAffiliateAllowed(id, affiliate);
  const url = new URL("/", origin);
  url.searchParams.set("campaign", id);
  url.searchParams.set("ref", affiliate.trim());
  return url.toString();
}
