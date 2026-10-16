/**
 * Privacy-preserving IP hashing: HMAC-SHA256(ip, daily_salt).
 *
 * The salt rotates every UTC day and is derived from a server-held master
 * secret, so a hash can be compared with other hashes from the same day
 * (uniqueness) but cannot be linked across days or reversed to an IP.
 */

const encoder = new TextEncoder();

export const SALT_DOMAIN = "stormsale:ip-salt:v1";

const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/;
const IPV6_PATTERN =
  /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{0,4}::[0-9a-f:]*/i;

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

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

/** HMAC-SHA256(ip, daily_salt) as lowercase hex. The salt is the HMAC key. */
export async function hashIp(ip: string, dailySaltHex: string): Promise<string> {
  return hmacSha256(fromHex(dailySaltHex), ip.trim().toLowerCase());
}

export const looksLikeRawIp = (value: string): boolean =>
  IPV4_PATTERN.test(value) || IPV6_PATTERN.test(value);

/**
 * Returns the paths of any string field in a record (recursively) that
 * contains a raw IPv4/IPv6 address. An empty array means zero-PII.
 */
export function findRawIpFields(record: unknown, path = "$"): string[] {
  if (typeof record === "string") return looksLikeRawIp(record) ? [path] : [];
  if (Array.isArray(record)) return record.flatMap((v, i) => findRawIpFields(v, `${path}[${i}]`));
  if (record && typeof record === "object") {
    return Object.entries(record).flatMap(([k, v]) => findRawIpFields(v, `${path}.${k}`));
  }
  return [];
}

export interface ClickRecord {
  campaignId: string;
  ipHash: string;
  day: string;
}

/** Builds the only click shape that is ever persisted: no raw IP field. */
export async function buildClickRecord(
  campaignId: string,
  ip: string,
  masterSecret: string,
  date: Date,
): Promise<ClickRecord> {
  const salt = await deriveDailySalt(masterSecret, date);
  return { campaignId, ipHash: await hashIp(ip, salt), day: saltDay(date) };
}

export interface PrivacyVerification {
  checkedRecords: number;
  rawIpFields: string[];
  compliant: boolean;
}

export function verifyZeroPii(records: unknown[]): PrivacyVerification {
  const rawIpFields = records.flatMap((r, i) => findRawIpFields(r, `records[${i}]`));
  return { checkedRecords: records.length, rawIpFields, compliant: rawIpFields.length === 0 };
}

/** Number of distinct visitors in a set of same-day hashes. */
export const countUniqueVisitors = (ipHashes: string[]): number => new Set(ipHashes).size;

export const PROOF_STEPS = [
  "H = HMAC-SHA256(key = daily_salt, message = ip), a 256-bit output.",
  "daily_salt = HMAC-SHA256(master_secret, domain:UTC day); it is never stored with click data.",
  "Determinism: same ip + same day => same H, so duplicates within 24h are detectable.",
  "Rotation: a new day yields an independent salt, so H(ip, day1) and H(ip, day2) are unlinkable.",
  "Pre-image resistance: recovering ip from H requires inverting SHA-256 or guessing the 256-bit salt.",
  "Storage: only { campaignId, ipHash, day } is persisted; verifyZeroPii() flags any record containing an IP.",
];

export interface CertificateInput {
  organization: string;
  issuedAt: Date;
  verification: PrivacyVerification;
}

export function buildGdprCertificate({
  organization,
  issuedAt,
  verification,
}: CertificateInput): string {
  const status = verification.compliant ? "COMPLIANT" : "NON-COMPLIANT";
  return [
    "STORMSALE GDPR / CCPA PRIVACY COMPLIANCE CERTIFICATE",
    "====================================================",
    `Issued to:   ${organization}`,
    `Issued at:   ${issuedAt.toISOString()}`,
    `Status:      ${status}`,
    "",
    "Scope: click IP address handling (GDPR Art. 5(1)(c), Art. 25, Art. 32; CCPA 1798.140).",
    "Algorithm: HMAC-SHA256(ip, daily_salt), salt rotated every UTC day.",
    `Records inspected: ${verification.checkedRecords}`,
    `Records containing a raw IP: ${verification.rawIpFields.length}`,
    ...verification.rawIpFields.map((p) => `  - ${p}`),
    "",
    "Proof of zero-PII architecture:",
    ...PROOF_STEPS.map((s, i) => `  ${i + 1}. ${s}`),
    "",
  ].join("\n");
}
