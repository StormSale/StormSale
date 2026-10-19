import { describe, it, expect } from "vitest";
import {
  buildClickRecord,
  buildGdprCertificate,
  canonicalizeIp,
  countUniqueVisitors,
  deriveDailySalt,
  findRawIpFields,
  hashIp,
  verifyZeroPii,
} from "./privacy";

const SECRET = "test-master-secret";
const DAY1 = new Date("2026-05-16T10:00:00Z");
const DAY1_LATE = new Date("2026-05-16T23:59:59Z");
const DAY2 = new Date("2026-05-17T00:00:01Z");

describe("IP hashing", () => {
  it("matches the RFC 4231 HMAC-SHA256 test vector (key=Jefe)", async () => {
    // key "Jefe" = 4a656665 hex; message is the RFC's data string.
    expect(await hashIp("what do ya want for nothing?", "4a656665")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("changes at the UTC day boundary, not after a rolling 24h", async () => {
    const before = await buildClickRecord("c1", "203.0.113.7", SECRET, DAY1_LATE);
    const after = await buildClickRecord("c1", "203.0.113.7", SECRET, DAY2);
    expect(before.ipHash).not.toBe(after.ipHash);
  });

  it("hashes equivalent IP spellings identically", async () => {
    const a = await buildClickRecord("c1", "2001:db8::1", SECRET, DAY1);
    const b = await buildClickRecord("c1", "2001:0DB8:0:0:0:0:0:1", SECRET, DAY1);
    expect(a.ipHash).toBe(b.ipHash);
    const v4 = await buildClickRecord("c1", "10.0.0.1", SECRET, DAY1);
    const mapped = await buildClickRecord("c1", "::ffff:10.0.0.1", SECRET, DAY1);
    expect(mapped.ipHash).toBe(v4.ipHash);
  });

  it("rejects input that is not an IP address", async () => {
    await expect(buildClickRecord("c1", "not-an-ip", SECRET, DAY1)).rejects.toThrow(
      "Invalid IP address",
    );
  });

  it("is stable within a UTC day so uniqueness can be verified", async () => {
    const a = await buildClickRecord("c1", "203.0.113.7", SECRET, DAY1);
    const b = await buildClickRecord("c1", "203.0.113.7", SECRET, DAY1_LATE);
    const c = await buildClickRecord("c1", "198.51.100.2", SECRET, DAY1);
    expect(a.ipHash).toBe(b.ipHash);
    expect(countUniqueVisitors([a.ipHash, b.ipHash, c.ipHash])).toBe(2);
  });

  it("rotates across days so hashes are unlinkable", async () => {
    const a = await buildClickRecord("c1", "203.0.113.7", SECRET, DAY1);
    const b = await buildClickRecord("c1", "203.0.113.7", SECRET, DAY2);
    expect(a.ipHash).not.toBe(b.ipHash);
    expect(await deriveDailySalt(SECRET, DAY1)).not.toBe(await deriveDailySalt(SECRET, DAY2));
  });

  it("output is 64 hex chars and never contains the IP", async () => {
    const r = await buildClickRecord("c1", "203.0.113.7", SECRET, DAY1);
    expect(r.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r)).not.toContain("203.0.113.7");
  });
});

describe("canonicalizeIp", () => {
  it("accepts valid IPv4 and IPv6", () => {
    expect(canonicalizeIp(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(canonicalizeIp("::")).toBe("0:0:0:0:0:0:0:0");
    expect(canonicalizeIp("2001:db8::1")).toBe("2001:db8:0:0:0:0:0:1");
    expect(canonicalizeIp("::1")).toBe("0:0:0:0:0:0:0:1");
    expect(canonicalizeIp("1:2:3:4:5:6:1.2.3.4")).toBe("1:2:3:4:5:6:102:304");
  });

  it("rejects malformed addresses", () => {
    for (const bad of [
      "",
      "not-an-ip",
      "256.1.1.1",
      "1.2.3",
      "010.0.0.1",
      "1::2::3",
      "1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7:8:9",
      "12345::1",
      "1:2:3:4:5:6:7::8",
      "fe80::1%eth0",
    ]) {
      expect(canonicalizeIp(bad), bad).toBeNull();
    }
  });
});

describe("zero-PII verification", () => {
  it("detects raw IPs used as object keys without echoing them", () => {
    const found = findRawIpFields({ "192.0.2.1": { seen: true } });
    expect(found).toEqual(["$.<ip-key>"]);
    expect(JSON.stringify(found)).not.toContain("192.0.2.1");
  });

  it("passes hashed records", async () => {
    const r = await buildClickRecord("c1", "2001:db8::1", SECRET, DAY1);
    expect(verifyZeroPii([r]).compliant).toBe(true);
  });

  it("detects raw IPv4 and IPv6 in nested fields", () => {
    expect(findRawIpFields({ a: { b: "ip=10.0.0.1" }, c: ["2001:db8::1"] })).toEqual([
      "$.a.b",
      "$.c[0]",
    ]);
    const v = verifyZeroPii([{ ip: "192.168.1.1" }]);
    expect(v.compliant).toBe(false);
    expect(v.rawIpFields).toEqual(["records[0].ip"]);
  });

  it("detects IPs glued to letters or underscores, in values and keys", () => {
    expect(findRawIpFields({ note: "client_203.0.113.7" })).toEqual(["$.note"]);
    expect(findRawIpFields({ "ip_203.0.113.7": 1 })).toEqual(["$.<ip-key>"]);
    expect(findRawIpFields({ src: "x2001:db8:0:0:0:0:0:1" })).toEqual(["$.src"]);
    expect(findRawIpFields({ src: "ip=2001:db8::1," })).toEqual(["$.src"]);
  });

  it("flags a field that is exactly ::, but not :: embedded in other text or digits glued to an octet", () => {
    expect(findRawIpFields({ a: "Foo::Bar", b: "std::fmt", d: "see Foo:: here" })).toEqual([]);
    expect(findRawIpFields({ ip: "::" })).toEqual(["$.ip"]);
    expect(verifyZeroPii([{ ip: " :: " }]).compliant).toBe(false);
    expect(findRawIpFields({ v: "12203.0.113.7" })).toEqual([]);
    expect(findRawIpFields({ v: "256.1.1.1" })).toEqual([]);
  });

  it("does not flag hex hashes or timestamps", () => {
    expect(findRawIpFields({ h: "a".repeat(64), t: "2026-05-16T10:00:00Z" })).toEqual([]);
  });
});

describe("certificate", () => {
  it("reflects compliance status and findings", () => {
    const ok = buildGdprCertificate({
      organization: "Acme",
      issuedAt: DAY1,
      verification: verifyZeroPii([]),
    });
    expect(ok).toContain("Status:      NOT VERIFIED");
    expect(ok).toContain("not a legal determination");
    const clean = buildGdprCertificate({
      organization: "Acme",
      issuedAt: DAY1,
      verification: verifyZeroPii([{ ipHash: "a".repeat(64) }]),
    });
    expect(clean).toContain("Status:      NO RAW IPS DETECTED");
    const bad = buildGdprCertificate({
      organization: "Acme",
      issuedAt: DAY1,
      verification: verifyZeroPii([{ ip: "10.1.1.1" }]),
    });
    expect(bad).toContain("Status:      RAW IPS DETECTED");
    expect(bad).toContain("records[0].ip");
  });
});
