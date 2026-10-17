import { describe, it, expect } from "vitest";
import {
  base64UrlDecodeToBytes,
  base64UrlEncode,
  buildReferralLink,
  decodeReferralTag,
  encodeReferralTag,
  generateReferralEncryptionKey,
  resolveReferralOrigin,
  REFERRAL_ENVELOPE_VERSION,
  REFERRAL_FALLBACK_ORIGIN,
} from "../lib/referralLink";

const AFFILIATE = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const CAMPAIGN = "1042";

describe("Affiliate Encrypted Link & QR Generator (#46)", () => {
  it("builds an encoded tracking URL with ref + tag params", async () => {
    const link = await buildReferralLink({
      campaignId: CAMPAIGN,
      affiliateAddress: AFFILIATE,
      origin: "https://stormsale.xyz",
    });
    const url = new URL(link);
    expect(url.pathname).toBe(`/c/${CAMPAIGN}`);
    expect(url.searchParams.get("ref")).toBe(AFFILIATE);

    const tag = url.searchParams.get("tag");
    expect(tag).toBeTruthy();
    const decoded = await decodeReferralTag(tag as string);
    expect(decoded).toMatchObject({ v: REFERRAL_ENVELOPE_VERSION, aff: AFFILIATE, cid: CAMPAIGN });
    expect(typeof decoded.ts).toBe("number");
  });

  it("round-trips base64url helpers without loss", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 16, 32, 64, 128]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(Array.from(base64UrlDecodeToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it("seals the tag envelope with AES-GCM when a key is provided", async () => {
    const key = await generateReferralEncryptionKey();
    const tag = await encodeReferralTag(AFFILIATE, CAMPAIGN, key);
    const sealed = await decodeReferralTag(tag);
    // Without the key the envelope stays sealed: no affiliate/campaign leak.
    expect(sealed.aff).toBeUndefined();
    expect(sealed.cid).toBeUndefined();
    expect(typeof sealed.iv).toBe("string");
    expect(typeof sealed.ct).toBe("string");
    expect((sealed.iv as string).length).toBeGreaterThan(0);
    expect((sealed.ct as string).length).toBeGreaterThan(0);

    // Ciphertext must actually hide the affiliate address.
    const rawEnvelope = JSON.stringify(sealed);
    expect(sealed.ct).not.toContain(AFFILIATE);
    expect(rawEnvelope).not.toContain(AFFILIATE.slice(4, 20));

    // With the key the original metadata is recovered.
    const opened = await decodeReferralTag(tag, key);
    expect(opened.aff).toBe(AFFILIATE);
    expect(opened.cid).toBe(CAMPAIGN);
  });

  it("rejects sealed envelopes opened with the wrong key", async () => {
    const keyA = await generateReferralEncryptionKey();
    const keyB = await generateReferralEncryptionKey();
    const tag = await encodeReferralTag(AFFILIATE, CAMPAIGN, keyA);
    await expect(decodeReferralTag(tag, keyB)).rejects.toThrow(
      "Invalid referral tag envelope.",
    );
  });

  it("rejects malformed tag envelopes", async () => {
    await expect(decodeReferralTag("not-a-valid-envelope!!!")).rejects.toThrow();
    await expect(decodeReferralTag("")).rejects.toThrow();
  });

  it("requires campaign and affiliate identifiers", async () => {
    await expect(
      buildReferralLink({ campaignId: " ", affiliateAddress: AFFILIATE }),
    ).rejects.toThrow("Campaign ID is required");
    await expect(buildReferralLink({ campaignId: CAMPAIGN, affiliateAddress: "  " })).rejects.toThrow(
      "Affiliate address is required",
    );
  });

  it("resolves origin from explicit value or falls back in Node", () => {
    expect(resolveReferralOrigin("https://example.com///")).toBe("https://example.com");
    // No window in vitest node env -> fallback origin.
    expect(resolveReferralOrigin()).toBe(REFERRAL_FALLBACK_ORIGIN);
  });
});
