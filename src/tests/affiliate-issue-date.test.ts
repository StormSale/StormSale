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
  ])("accepts local today in a %s timezone", (_label, timezone, today) => {
    process.env.TZ = timezone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:30:00.000Z"));

    expect(getLocalCalendarDate()).toBe(today);
    expect(affiliateIssueDraftSchema.safeParse({ ...draft, saleDate: today }).success).toBe(true);
  });

  it("server accepts dates from ahead timezones even when server is in a behind timezone", () => {
    // Server is in Los Angeles where local date is 2026-02-28
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:30:00.000Z"));

    // Browser in Pacific/Kiritimati (UTC+14) or Tokyo submits 2026-03-01
    const clientAheadDate = "2026-03-01";
    const result = affiliateIssueDraftSchema.safeParse({ ...draft, saleDate: clientAheadDate });
    expect(result.success).toBe(true);

    // Date that has not yet arrived anywhere on Earth (2026-03-02) is rejected
    const tomorrowDate = "2026-03-02";
    const futureResult = affiliateIssueDraftSchema.safeParse({ ...draft, saleDate: tomorrowDate });
    expect(futureResult.success).toBe(false);
    if (!futureResult.success) {
      expect(futureResult.error.issues[0]?.message).toBe("Sale date cannot be in the future");
    }
  });
});
