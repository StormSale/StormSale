/**
 * Privacy-preserving IP hashing: HMAC-SHA256(ip, daily_salt).
 *
 * The salt rotates every UTC day and is derived from a server-held master
 * secret, so a hash can be compared with other hashes from the same day
 * (uniqueness) but cannot be linked across days or reversed to an IP.
 */

const encoder = new TextEncoder();

export const SALT_DOMAIN = "stormsale:ip-salt:v1";

// Digit/hex boundaries instead of word boundaries: word boundaries miss IPs glued to letters
// or "_" (e.g. "client_203.0.113.7"). Prefixes are consumed rather than using lookbehind so
// older Safari can still parse this module.
const IPV4_PATTERN =
  /(?:^|\D)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?!\d)/;
const IPV6_FULL_PATTERN = /(?:^|[^\d:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![0-9a-f:])/i;
// The compressed form must contain a hex group, so "Foo::Bar" is not flagged; a field that is
// exactly "::" is caught by the canonicalizeIp check in looksLikeRawIp.
const IPV6_COMPRESSED_PATTERN =
  /(?:^|[^\d:])(?=[0-9a-f:]*[0-9a-f])(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{0,4}::[0-9a-f:]*(?![0-9a-z:])/i;

/** Lowercase hex encoding of a byte buffer. */
const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Decodes a hex string into bytes (inverse of `toHex`). */
const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

/** HMAC-SHA256 of `message` under `key`, as lowercase hex. */
const hmacSha256 = async (key: Uint8Array, message: string): Promise<string> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
};

/** UTC calendar day (YYYY-MM-DD) that scopes a salt. */
export const saltDay = (date: Date): string => date.toISOString().slice(0, 10);

/** daily_salt = HMAC-SHA256(master_secret, domain:day), hex encoded. */
export async function deriveDailySalt(masterSecret: string, date: Date): Promise<string> {
  return hmacSha256(encoder.encode(masterSecret), `${SALT_DOMAIN}:${saltDay(date)}`);
}

/**
 * HMAC-SHA256(ip, daily_salt) as lowercase hex. The salt is the HMAC key.
 * Callers should pass a canonical IP (see `canonicalizeIp`) so equivalent
 * spellings of one address produce one hash.
 */
export async function hashIp(ip: string, dailySaltHex: string): Promise<string> {
  return hmacSha256(fromHex(dailySaltHex), ip.trim().toLowerCase());
}

const parseIpv4 = (value: string): number[] | null => {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^(0|[1-9]\d{0,2})$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o <= 255) ? octets : null;
};

const parseIpv6 = (value: string): number[] | null => {
  if (!/^[0-9a-f:.]+$/i.test(value)) return null;
  let text = value;
  const lastColon = text.lastIndexOf(":");
  if (text.includes(".")) {
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    const hex = (a: number, b: number) => ((a << 8) | b).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hex(v4[0], v4[1])}:${hex(v4[2], v4[3])}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (h: string): string[] | null => {
    if (h === "") return [];
    const g = h.split(":");
    return g.every((x) => /^[0-9a-f]{1,4}$/i.test(x)) ? g : null;
  };
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  return [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail].map(
    (g) => parseInt(g, 16),
  );
};

/**
 * Parses an IPv4/IPv6 address and returns one canonical spelling, or null if
 * the input is not an IP. IPv6 is returned as 8 unpadded lowercase hex groups;
 * IPv4-mapped IPv6 collapses to dotted IPv4.
 */
export function canonicalizeIp(input: string): string | null {
  const value = input.trim();
  const v4 = parseIpv4(value);
  if (v4) return v4.join(".");
  const v6 = parseIpv6(value);
  if (!v6) return null;
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) {
    return [v6[6] >> 8, v6[6] & 255, v6[7] >> 8, v6[7] & 255].join(".");
  }
  return v6.map((g) => g.toString(16)).join(":");
}

/**
 * True if the string is an IP address (including a bare "::") or contains
 * something that looks like one.
 */
export const looksLikeRawIp = (value: string): boolean =>
  canonicalizeIp(value) !== null ||
  IPV4_PATTERN.test(value) ||
  IPV6_FULL_PATTERN.test(value) ||
  IPV6_COMPRESSED_PATTERN.test(value);

const IP_KEY_SEGMENT = "<ip-key>";

/**
 * Returns the paths of any string field or object key in a record
 * (recursively) that contains a raw IPv4/IPv6 address. An empty array means
 * zero-PII. Keys that are IPs are reported as `<ip-key>` so findings never
 * repeat the address itself.
 */
export function findRawIpFields(record: unknown, path = "$"): string[] {
  if (typeof record === "string") return looksLikeRawIp(record) ? [path] : [];
  if (Array.isArray(record)) return record.flatMap((v, i) => findRawIpFields(v, `${path}[${i}]`));
  if (record && typeof record === "object") {
    return Object.entries(record).flatMap(([k, v]) => {
      const keyIsIp = looksLikeRawIp(k);
      const childPath = `${path}.${keyIsIp ? IP_KEY_SEGMENT : k}`;
      return [...(keyIsIp ? [childPath] : []), ...findRawIpFields(v, childPath)];
    });
  }
  return [];
}

/** Thrown when a value that must be an IPv4/IPv6 address is not one. */
export class InvalidIpError extends Error {
  constructor() {
    super("Invalid IP address");
    this.name = "InvalidIpError";
  }
}

export interface ClickRecord {
  campaignId: string;
  ipHash: string;
  day: string;
}

/**
 * Builds the only click shape that is ever persisted: no raw IP field.
 * Throws if `ip` is not a valid IPv4/IPv6 address.
 */
export async function buildClickRecord(
  campaignId: string,
  ip: string,
  masterSecret: string,
  date: Date,
): Promise<ClickRecord> {
  const canonicalIp = canonicalizeIp(ip);
  if (!canonicalIp) throw new InvalidIpError();
  const salt = await deriveDailySalt(masterSecret, date);
  return { campaignId, ipHash: await hashIp(canonicalIp, salt), day: saltDay(date) };
}

export interface PrivacyVerification {
  checkedRecords: number;
  rawIpFields: string[];
  compliant: boolean;
}

/** Scans records for raw IPs. Scoped to the supplied records only. */
export function verifyZeroPii(records: unknown[]): PrivacyVerification {
  const rawIpFields = records.flatMap((r, i) => findRawIpFields(r, `records[${i}]`));
  return { checkedRecords: records.length, rawIpFields, compliant: rawIpFields.length === 0 };
}

/** Number of distinct visitors in a set of hashes from the same UTC day. */
export const countUniqueVisitors = (ipHashes: string[]): number => new Set(ipHashes).size;

export const PROOF_STEPS = [
  "H = HMAC-SHA256(key = daily_salt, message = ip), a 256-bit output.",
  "daily_salt = HMAC-SHA256(master_secret, domain:UTC day); it is never stored with click data.",
  "Determinism: same ip + same UTC day => same H, so duplicates within a UTC calendar day are detectable. Clicks either side of 00:00 UTC hash differently.",
  "Rotation: a new day yields an independent salt, so H(ip, day1) and H(ip, day2) are unlinkable.",
  "Pre-image resistance: recovering ip from H requires inverting SHA-256 or obtaining the salt. Anyone holding the master secret can enumerate candidate IPs, so this depends on keeping the secret undisclosed; hashes made with the public demo secret are not irreversible.",
  "Storage: only { campaignId, ipHash, day } is persisted; verifyZeroPii() flags any record containing an IP.",
];

export interface CertificateInput {
  organization: string;
  issuedAt: Date;
  verification: PrivacyVerification;
}

/** Renders a plain-text report of a scoped raw-IP check, with its limits stated. */
export function buildGdprCertificate({
  organization,
  issuedAt,
  verification,
}: CertificateInput): string {
  const status =
    verification.checkedRecords === 0
      ? "NOT VERIFIED (no records inspected)"
      : verification.compliant
        ? "NO RAW IPS DETECTED"
        : "RAW IPS DETECTED";
  return [
    "STORMSALE GDPR / CCPA PRIVACY COMPLIANCE CERTIFICATE",
    "====================================================",
    `Issued to:   ${organization}`,
    `Issued at:   ${issuedAt.toISOString()}`,
    `Status:      ${status}`,
    "",
    "Scope: technical check of the supplied click records for raw IP addresses",
    "(relevant to GDPR Art. 5(1)(c), Art. 25, Art. 32; CCPA 1798.140).",
    "Limits: covers only the records listed below. It is not a legal determination or a",
    "formal GDPR/CCPA certification.",
    "Algorithm: HMAC-SHA256(ip, daily_salt), salt rotated every UTC day.",
    `Records inspected: ${verification.checkedRecords}`,
    `Raw IP findings: ${verification.rawIpFields.length}`,
    ...verification.rawIpFields.map((p) => `  - ${p}`),
    "",
    "Proof of zero-PII architecture:",
    ...PROOF_STEPS.map((s, i) => `  ${i + 1}. ${s}`),
    "",
  ].join("\n");
}
