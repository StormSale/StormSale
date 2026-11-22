import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InviteRole = "admin" | "member" | "viewer" | "billing";
type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
type SeatTier = "starter" | "growth" | "enterprise";
type ExpiryStatus = "active" | "expiring_soon" | "expired";

interface InvitationDraft {
  email: string;
  role: string;
}

interface Invitation {
  id: string;
  email: string;
  role: InviteRole;
  status: InvitationStatus;
  createdAt: number;
  expiresAt: number;
  lastResentAt: number | null;
  resendCount: number;
}

interface ValidationResult {
  valid: boolean;
  errors: { email?: string; role?: string };
}

interface SeatQuotaEvaluation {
  tier: SeatTier;
  quota: number;
  used: number;
  remaining: number;
  atCapacity: boolean;
  exceedsQuota: boolean;
  showUpgradeWarning: boolean;
}

interface ExpiryIndicator {
  status: ExpiryStatus;
  remainingMs: number;
  daysRemaining: number;
  label: string;
}

type DispatchFailureReason = "invalid_input" | "duplicate_pending" | "seat_quota_reached";

interface DispatchResult {
  ok: boolean;
  reason?: DispatchFailureReason;
  errors?: ValidationResult["errors"];
  invitation?: Invitation;
  warning?: SeatQuotaEvaluation;
}

interface InviteActionResult {
  ok: boolean;
  reason?: "not_found" | "not_pending" | "cooldown_active";
  retryAfterMs?: number;
  invitation?: Invitation;
  resendCount?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const INVITE_TTL_MS = 7 * DAY_MS;
const EXPIRING_SOON_MS = 3 * DAY_MS;

const SEAT_QUOTAS: Record<SeatTier, number> = {
  starter: 5,
  growth: 25,
  enterprise: 100,
};
const INVITE_ROLES: InviteRole[] = ["admin", "member", "viewer", "billing"];
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function isValidInviteEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

function isInviteRole(value: string): value is InviteRole {
  return INVITE_ROLES.includes(value as InviteRole);
}

function validateInvitationDraft(draft: InvitationDraft): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  const email = draft.email?.trim() ?? "";

  if (!email) errors.email = "Email is required";
  else if (!isValidInviteEmail(email)) errors.email = "Enter a valid email address";

  if (!draft.role || !isInviteRole(draft.role)) errors.role = "Select a valid role";

  return { valid: Object.keys(errors).length === 0, errors };
}

function evaluateSeatQuota(tier: SeatTier, usedSeats: number): SeatQuotaEvaluation {
  const quota = SEAT_QUOTAS[tier];
  return {
    tier,
    quota,
    used: usedSeats,
    remaining: Math.max(0, quota - usedSeats),
    atCapacity: usedSeats >= quota,
    exceedsQuota: usedSeats > quota,
    showUpgradeWarning: usedSeats >= quota,
  };
}

function getExpiryIndicator(invite: Invitation, now: number): ExpiryIndicator {
  const remainingMs = Math.max(0, invite.expiresAt - now);
  const daysRemaining = Math.floor(remainingMs / DAY_MS);

  if (remainingMs === 0) {
    return { status: "expired", remainingMs: 0, daysRemaining: 0, label: "Expired" };
  }
  if (remainingMs <= EXPIRING_SOON_MS) {
    return { status: "expiring_soon", remainingMs, daysRemaining, label: "Expires soon" };
  }
  return { status: "active", remainingMs, daysRemaining, label: "Active" };
}

function createInvitationManager(tier: SeatTier, initialSeats = 0) {
  const invitations: Invitation[] = [];
  let sequence = 0;
  let warningVisible = false;

  const now = () => Date.now();
  const isLivePending = (invite: Invitation) =>
    invite.status === "pending" && invite.expiresAt > now();
  const find = (id: string) => invitations.find((invite) => invite.id === id);
  const pending = () => invitations.filter(isLivePending);
  const usedSeats = () =>
    initialSeats +
    pending().length +
    invitations.filter((invite) => invite.status === "accepted").length;
  const quota = () => evaluateSeatQuota(tier, usedSeats());

  const dispatch = (draft: InvitationDraft): DispatchResult => {
    const validation = validateInvitationDraft(draft);
    if (!validation.valid) {
      return { ok: false, reason: "invalid_input", errors: validation.errors };
    }

    const email = draft.email.trim().toLowerCase();
    if (pending().some((invite) => invite.email === email)) {
      return { ok: false, reason: "duplicate_pending" };
    }

    const seatState = quota();
    if (seatState.atCapacity) {
      warningVisible = true;
      return { ok: false, reason: "seat_quota_reached", warning: seatState };
    }

    sequence += 1;
    const timestamp = now();
    const invitation: Invitation = {
      id: `inv_${sequence}`,
      email,
      role: draft.role as InviteRole,
      status: "pending",
      createdAt: timestamp,
      expiresAt: timestamp + INVITE_TTL_MS,
      lastResentAt: null,
      resendCount: 0,
    };
    invitations.push(invitation);
    warningVisible = false;
    return { ok: true, invitation };
  };

  const revoke = (id: string): InviteActionResult => {
    const invitation = find(id);
    if (!invitation) return { ok: false, reason: "not_found" };
    if (!isLivePending(invitation)) return { ok: false, reason: "not_pending" };
    invitation.status = "revoked";
    return { ok: true };
  };

  const accept = (id: string): InviteActionResult => {
    const invitation = find(id);
    if (!invitation) return { ok: false, reason: "not_found" };
    if (!isLivePending(invitation)) return { ok: false, reason: "not_pending" };
    invitation.status = "accepted";
    return { ok: true };
  };

  const resendRemaining = (id: string): number => {
    const invitation = find(id);
    if (!invitation || !isLivePending(invitation) || invitation.lastResentAt === null) return 0;
    return Math.max(0, RESEND_COOLDOWN_MS - (now() - invitation.lastResentAt));
  };

  const resend = (id: string): InviteActionResult => {
    const invitation = find(id);
    if (!invitation) return { ok: false, reason: "not_found" };
    if (!isLivePending(invitation)) return { ok: false, reason: "not_pending" };

    const retryAfterMs = resendRemaining(id);
    if (retryAfterMs > 0) {
      return { ok: false, reason: "cooldown_active", retryAfterMs };
    }

    const timestamp = now();
    invitation.lastResentAt = timestamp;
    invitation.expiresAt = timestamp + INVITE_TTL_MS;
    invitation.resendCount += 1;
    return { ok: true, invitation, resendCount: invitation.resendCount };
  };

  const sweepExpired = (): Invitation[] => {
    const expired = invitations.filter(
      (invite) => invite.status === "pending" && invite.expiresAt <= now(),
    );
    expired.forEach((invite) => {
      invite.status = "expired";
    });
    return expired;
  };

  return {
    all: () => invitations.slice(),
    pending,
    usedSeats,
    quota,
    find,
    dispatch,
    revoke,
    accept,
    resend,
    resendRemaining,
    sweepExpired,
    isWarningVisible: () => warningVisible,
    dismissWarning: () => {
      warningVisible = false;
    },
  };
}

describe("[B2B] Member Invitation Lifecycle & Seat Allocation Limits (#435)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Invitation form validation before dispatch", () => {
    it("dispatches a well-formed email with a supported role as a pending invite", () => {
      const manager = createInvitationManager("enterprise");
      const result = manager.dispatch({ email: "  Alice@Example.com  ", role: "member" });

      expect(result.ok).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.invitation).toMatchObject({
        id: "inv_1",
        email: "alice@example.com",
        role: "member",
        status: "pending",
      });
      expect((result.invitation?.expiresAt ?? 0) - (result.invitation?.createdAt ?? 0)).toBe(
        INVITE_TTL_MS,
      );
      expect(manager.pending()).toHaveLength(1);
    });

    it("rejects malformed email formats without dispatching an invite", () => {
      const manager = createInvitationManager("enterprise");
      const invalidEmails = [
        "not-an-email",
        "alice@",
        "@example.com",
        "alice@example",
        "alice example.com",
        "alice@@example.com",
      ];

      for (const email of invalidEmails) {
        const result = manager.dispatch({ email, role: "member" });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("invalid_input");
        expect(result.errors?.email).toBe("Enter a valid email address");
      }
      expect(manager.pending()).toHaveLength(0);
    });

    it("requires a non-empty email before dispatch", () => {
      const manager = createInvitationManager("enterprise");
      const result = manager.dispatch({ email: "   ", role: "viewer" });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("invalid_input");
      expect(result.errors?.email).toBe("Email is required");
      expect(manager.pending()).toHaveLength(0);
    });

    it("rejects an empty or unsupported role selection before dispatch", () => {
      const manager = createInvitationManager("enterprise");

      for (const role of ["", "owner", "superadmin"]) {
        const result = manager.dispatch({ email: "bob@example.com", role });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("invalid_input");
        expect(result.errors?.role).toBe("Select a valid role");
      }
      expect(manager.pending()).toHaveLength(0);
    });

    it("reports email and role errors together for a fully invalid form", () => {
      const validation = validateInvitationDraft({ email: "bad-email", role: "owner" });

      expect(validation.valid).toBe(false);
      expect(validation.errors.email).toBe("Enter a valid email address");
      expect(validation.errors.role).toBe("Select a valid role");
    });

    it("accepts every role offered by the role selector", () => {
      const manager = createInvitationManager("enterprise");

      for (const role of INVITE_ROLES) {
        expect(manager.dispatch({ email: `${role}@example.com`, role }).ok).toBe(true);
      }
      expect(manager.pending().map((invite) => invite.role)).toEqual(INVITE_ROLES);
    });

    it("blocks duplicate pending invitations case-insensitively", () => {
      const manager = createInvitationManager("enterprise");
      expect(manager.dispatch({ email: "alice@example.com", role: "member" }).ok).toBe(true);

      const duplicate = manager.dispatch({ email: "ALICE@EXAMPLE.COM", role: "admin" });
      expect(duplicate.ok).toBe(false);
      expect(duplicate.reason).toBe("duplicate_pending");
      expect(manager.pending()).toHaveLength(1);
    });
  });

  describe("Enterprise seat tier quota and warning modal", () => {
    it("maps each subscription tier to its seat capacity", () => {
      expect(evaluateSeatQuota("starter", 0)).toMatchObject({ quota: 5, remaining: 5 });
      expect(evaluateSeatQuota("growth", 10)).toMatchObject({ quota: 25, remaining: 15 });
      expect(evaluateSeatQuota("enterprise", 80)).toMatchObject({ quota: 100, remaining: 20 });
    });

    it("shows the upgrade warning only when the tier quota is reached or exceeded", () => {
      expect(evaluateSeatQuota("enterprise", 99)).toMatchObject({
        atCapacity: false,
        showUpgradeWarning: false,
        exceedsQuota: false,
      });
      expect(evaluateSeatQuota("enterprise", 100)).toMatchObject({
        atCapacity: true,
        showUpgradeWarning: true,
        exceedsQuota: false,
      });
      expect(evaluateSeatQuota("enterprise", 101)).toMatchObject({
        atCapacity: true,
        showUpgradeWarning: true,
        exceedsQuota: true,
      });
      expect(evaluateSeatQuota("enterprise", 110).remaining).toBe(0);
    });

    it("fills the final enterprise seat and caps pending invites at the quota", () => {
      const manager = createInvitationManager("enterprise", 99);

      expect(manager.quota()).toMatchObject({ quota: 100, used: 99, remaining: 1 });
      expect(manager.dispatch({ email: "last@example.com", role: "member" }).ok).toBe(true);
      expect(manager.usedSeats()).toBe(100);
      expect(manager.quota()).toMatchObject({ atCapacity: true, remaining: 0 });
      expect(manager.isWarningVisible()).toBe(false);
    });

    it("blocks dispatch and opens the warning modal when the enterprise quota is reached", () => {
      const manager = createInvitationManager("enterprise", 100);

      const result = manager.dispatch({ email: "overflow@example.com", role: "viewer" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("seat_quota_reached");
      expect(result.warning).toMatchObject({
        tier: "enterprise",
        quota: 100,
        used: 100,
        remaining: 0,
        showUpgradeWarning: true,
      });
      expect(manager.isWarningVisible()).toBe(true);
      expect(manager.pending()).toHaveLength(0);

      expect(manager.dispatch({ email: "another@example.com", role: "member" }).ok).toBe(false);
      expect(manager.pending()).toHaveLength(0);
    });

    it("hides the warning modal and allows dispatch after revocation frees a seat", () => {
      const manager = createInvitationManager("enterprise", 99);
      expect(manager.dispatch({ email: "temp@example.com", role: "member" }).ok).toBe(true);

      const blocked = manager.dispatch({ email: "blocked@example.com", role: "member" });
      expect(blocked.reason).toBe("seat_quota_reached");
      expect(manager.isWarningVisible()).toBe(true);

      manager.dismissWarning();
      expect(manager.isWarningVisible()).toBe(false);

      expect(manager.revoke("inv_1").ok).toBe(true);
      expect(manager.usedSeats()).toBe(99);
      expect(manager.dispatch({ email: "replacement@example.com", role: "viewer" }).ok).toBe(true);
      expect(manager.isWarningVisible()).toBe(false);
      expect(manager.pending().map((invite) => invite.email)).toEqual(["replacement@example.com"]);
    });

    it("enforces the seat cap on lower tiers too", () => {
      const manager = createInvitationManager("starter", 5);

      const result = manager.dispatch({ email: "user@example.com", role: "member" });
      expect(result.reason).toBe("seat_quota_reached");
      expect(result.warning?.quota).toBe(5);
      expect(manager.pending()).toHaveLength(0);
    });
  });

  describe("Pending invitation revocation and instant list updates", () => {
    it("removes a revoked invite from the pending list immediately", () => {
      const manager = createInvitationManager("growth");
      manager.dispatch({ email: "alice@example.com", role: "admin" });
      manager.dispatch({ email: "bob@example.com", role: "member" });
      expect(manager.pending()).toHaveLength(2);

      const result = manager.revoke("inv_1");
      expect(result.ok).toBe(true);

      expect(manager.pending().map((invite) => invite.id)).toEqual(["inv_2"]);
      expect(manager.find("inv_1")?.status).toBe("revoked");
      expect(manager.all()).toHaveLength(2);
    });

    it("releases the reserved seat so another member can be invited", () => {
      const manager = createInvitationManager("starter", 4);
      manager.dispatch({ email: "alice@example.com", role: "member" });
      expect(manager.usedSeats()).toBe(5);

      manager.revoke("inv_1");
      expect(manager.usedSeats()).toBe(4);
      expect(manager.dispatch({ email: "carol@example.com", role: "member" }).ok).toBe(true);
      expect(manager.pending()[0].email).toBe("carol@example.com");
    });

    it("does not revoke an already accepted invite or an unknown id", () => {
      const manager = createInvitationManager("growth");
      manager.dispatch({ email: "alice@example.com", role: "member" });
      expect(manager.accept("inv_1").ok).toBe(true);

      expect(manager.revoke("inv_1")).toEqual({ ok: false, reason: "not_pending" });
      expect(manager.revoke("inv_missing")).toEqual({ ok: false, reason: "not_found" });
      expect(manager.find("inv_1")?.status).toBe("accepted");
    });

    it("does not allow resending a revoked invitation", () => {
      const manager = createInvitationManager("growth");
      manager.dispatch({ email: "alice@example.com", role: "member" });
      manager.revoke("inv_1");

      expect(manager.resend("inv_1")).toEqual({ ok: false, reason: "not_pending" });
      expect(manager.find("inv_1")?.resendCount).toBe(0);
    });
  });

  describe("Resend invitation cooldown (60 seconds)", () => {
    it("allows the first resend immediately and increments the resend count", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });

      const result = manager.resend("inv_1");
      expect(result.ok).toBe(true);
      expect(result.resendCount).toBe(1);
      expect(result.invitation?.resendCount).toBe(1);
      expect(result.invitation?.lastResentAt).toBe(Date.now());
    });

    it("blocks resends inside the 60 second window and reports the remaining time", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });
      expect(manager.resendRemaining("inv_1")).toBe(0);
      expect(manager.resend("inv_1").ok).toBe(true);

      expect(manager.resendRemaining("inv_1")).toBe(60_000);
      expect(manager.resend("inv_1").reason).toBe("cooldown_active");

      vi.advanceTimersByTime(59_000);
      expect(manager.resendRemaining("inv_1")).toBe(1_000);
      expect(manager.resend("inv_1")).toMatchObject({
        ok: false,
        reason: "cooldown_active",
        retryAfterMs: 1_000,
      });

      vi.advanceTimersByTime(999);
      expect(manager.resendRemaining("inv_1")).toBe(1);
      expect(manager.resend("inv_1").reason).toBe("cooldown_active");

      vi.advanceTimersByTime(1);
      expect(manager.resendRemaining("inv_1")).toBe(0);
      expect(manager.resend("inv_1").ok).toBe(true);
    });

    it("restarts the cooldown window after each successful resend", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });
      expect(manager.resend("inv_1").ok).toBe(true);

      vi.advanceTimersByTime(60_000);
      expect(manager.resend("inv_1").ok).toBe(true);
      expect(manager.find("inv_1")?.resendCount).toBe(2);
      expect(manager.resendRemaining("inv_1")).toBe(60_000);
      expect(manager.resend("inv_1").reason).toBe("cooldown_active");
    });

    it("does not apply the cooldown to a newly dispatched invitation", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });
      vi.advanceTimersByTime(59_000);
      manager.dispatch({ email: "bob@example.com", role: "admin" });

      expect(manager.resendRemaining("inv_2")).toBe(0);
      expect(manager.resend("inv_2").ok).toBe(true);
      expect(manager.resendRemaining("inv_2")).toBe(60_000);
      expect(manager.resend("inv_2").reason).toBe("cooldown_active");
      expect(manager.resend("inv_1").ok).toBe(true);
    });
  });

  describe("Invitation expiry indicators", () => {
    it("marks a freshly dispatched invite active with seven days remaining", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });

      const indicator = getExpiryIndicator(manager.find("inv_1")!, Date.now());
      expect(indicator).toMatchObject({
        status: "active",
        remainingMs: INVITE_TTL_MS,
        daysRemaining: 7,
        label: "Active",
      });
    });

    it("flags an expiring invite with the soon indicator inside the three day window", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });

      vi.advanceTimersByTime(3 * DAY_MS);
      expect(getExpiryIndicator(manager.find("inv_1")!, Date.now()).status).toBe("active");

      vi.advanceTimersByTime(DAY_MS + 1);
      const indicator = getExpiryIndicator(manager.find("inv_1")!, Date.now());
      expect(indicator.status).toBe("expiring_soon");
      expect(indicator.label).toBe("Expires soon");
      expect(indicator.daysRemaining).toBe(2);
    });

    it("marks an invite expired at the TTL boundary and removes it from the pending list", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });

      vi.advanceTimersByTime(INVITE_TTL_MS - 1);
      expect(getExpiryIndicator(manager.find("inv_1")!, Date.now()).status).toBe("expiring_soon");
      expect(manager.pending()).toHaveLength(1);

      vi.advanceTimersByTime(1);
      const indicator = getExpiryIndicator(manager.find("inv_1")!, Date.now());
      expect(indicator).toMatchObject({ status: "expired", label: "Expired", remainingMs: 0 });
      expect(manager.pending()).toHaveLength(0);
    });

    it("sweeps expired invites and releases their reserved seats", () => {
      const manager = createInvitationManager("starter", 4);
      manager.dispatch({ email: "alice@example.com", role: "member" });
      expect(manager.usedSeats()).toBe(5);

      vi.advanceTimersByTime(INVITE_TTL_MS);
      const swept = manager.sweepExpired();

      expect(swept.map((invite) => invite.id)).toEqual(["inv_1"]);
      expect(manager.find("inv_1")?.status).toBe("expired");
      expect(manager.usedSeats()).toBe(4);
      expect(manager.sweepExpired()).toHaveLength(0);
      expect(manager.dispatch({ email: "replacement@example.com", role: "member" }).ok).toBe(true);
    });

    it("refreshes the expiry window when an invitation is resent", () => {
      const manager = createInvitationManager("enterprise");
      manager.dispatch({ email: "alice@example.com", role: "member" });

      vi.advanceTimersByTime(6 * DAY_MS);
      expect(getExpiryIndicator(manager.find("inv_1")!, Date.now()).status).toBe("expiring_soon");

      expect(manager.resend("inv_1").ok).toBe(true);
      const refreshed = manager.find("inv_1")!;
      expect(refreshed.expiresAt).toBe(Date.now() + INVITE_TTL_MS);
      expect(getExpiryIndicator(refreshed, Date.now())).toMatchObject({
        status: "active",
        daysRemaining: 7,
      });
    });
  });
});
