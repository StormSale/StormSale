import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  screenAddress,
  assertNotSanctioned,
  addSanctionedAddresses,
  clearSanctionedAddresses,
  getComplianceLog,
  SanctionedAddressError,
  COMPLIANCE_LOG_KEY,
} from "../lib/sanctions";

const FLAGGED = "GBFLAGGEDSANCTIONEDADDRESS000000000000000000000000000000";
const CLEAN = "GBCLEANADDRESS0000000000000000000000000000000000000000000";

describe("OFAC sanctions screening (#183)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    clearSanctionedAddresses();
    addSanctionedAddresses([FLAGGED]);
  });

  it("flags a sanctioned address (case-insensitive)", async () => {
    expect(await screenAddress(FLAGGED.toLowerCase(), "wallet-connect")).toBe("flagged");
  });

  it("clears a non-sanctioned address", async () => {
    expect(await screenAddress(CLEAN, "wallet-connect")).toBe("clear");
  });

  it("blocks flagged addresses with a compliance warning", async () => {
    await expect(assertNotSanctioned(FLAGGED, "create-campaign")).rejects.toBeInstanceOf(
      SanctionedAddressError,
    );
    await expect(assertNotSanctioned(FLAGGED, "claim-payout")).rejects.toThrow(
      /Compliance warning/,
    );
  });

  it("does not block clean addresses", async () => {
    await expect(assertNotSanctioned(CLEAN, "claim-payout")).resolves.toBeUndefined();
  });

  it("records timestamp and result in the compliance log", async () => {
    await screenAddress(FLAGGED, "wallet-connect");
    await screenAddress(CLEAN, "claim-payout");
    const log = getComplianceLog();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({
      address: FLAGGED,
      result: "flagged",
      context: "wallet-connect",
    });
    expect(log[1]).toMatchObject({ address: CLEAN, result: "clear", context: "claim-payout" });
    expect(Number.isNaN(Date.parse(log[0].timestamp))).toBe(false);
    expect(localStorage.getItem(COMPLIANCE_LOG_KEY)).toBeTruthy();
  });
});
