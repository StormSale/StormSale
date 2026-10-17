import { describe, it, expect } from "vitest";
import {
  buildClickRecord,
  buildGdprCertificate,
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

  it("is stable within 24h so uniqueness can be verified", async () => {
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

describe("zero-PII verification", () => {
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
    expect(ok).toContain("Status:      COMPLIANT");
    const bad = buildGdprCertificate({
      organization: "Acme",
      issuedAt: DAY1,
      verification: verifyZeroPii([{ ip: "10.1.1.1" }]),
    });
    expect(bad).toContain("NON-COMPLIANT");
    expect(bad).toContain("records[0].ip");
  });
});
