// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { affiliateIssueDraftSchema, getLocalCalendarDate } from "../lib/validation";

const originalTimezone = process.env.TZ;
const draft = {
  campaignId: "spring-campaign",
  saleDate: "",
  details: "My attributed sale is missing from this campaign.",
};

afterEach(() => {
  vi.useRealTimers();
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

describe("affiliate issue sale date", () => {
  it.each([
    ["UTC-behind", "America/Los_Angeles", "2026-02-28"],
    ["UTC-ahead", "Pacific/Kiritimati", "2026-03-01"],
  ])("accepts local today and rejects tomorrow in a %s timezone", (_label, timezone, today) => {
    process.env.TZ = timezone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:30:00.000Z"));

    expect(getLocalCalendarDate()).toBe(today);
    expect(affiliateIssueDraftSchema.safeParse({ ...draft, saleDate: today }).success).toBe(true);

    const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    const result = affiliateIssueDraftSchema.safeParse({ ...draft, saleDate: tomorrow });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Sale date cannot be in the future");
    }
  });
});
