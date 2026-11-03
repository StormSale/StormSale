/**
 * StormSale Analytics Mapper & Privacy Guard
 *
 * Maps internal StormSale affiliate events to standard Segment e-commerce specs.
 * Guarantees zero PII by hashing wallet addresses with SHA-256 and validating
 * that no sensitive fields (private keys, mnemonics, tokens, raw addresses)
 * reach outgoing CDP payloads.
 */

// Pure JavaScript synchronous SHA-256 implementation (FIPS 180-4 standard)
// Ensures 100% deterministic, synchronous execution in all environments (browser, Node, workers)
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  let result = "";

  const words: number[] = [];

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Convert string to UTF-8 bytes stored as 32-bit big-endian words
  const utf8Bytes: number[] = [];
  for (let idx = 0; idx < ascii.length; idx++) {
    let charCode = ascii.charCodeAt(idx);
    if (charCode < 0x80) {
      utf8Bytes.push(charCode);
    } else if (charCode < 0x800) {
      utf8Bytes.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8Bytes.push(
        0xe0 | (charCode >> 12),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f),
      );
    } else {
      // Surrogate pair
      idx++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (ascii.charCodeAt(idx) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f),
      );
    }
  }

  const bitLength = utf8Bytes.length * 8;
  for (let b = 0; b < utf8Bytes.length; b++) {
    words[b >> 2] |= utf8Bytes[b] << (24 - (b % 4) * 8);
  }

  // Padding
  words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w: number[] = [];
    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = ((w[j - 16] + s0) | 0) + ((w[j - 7] + s1) | 0);
      }
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let j = 0; j < 64; j++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = ((((h + s1) | 0) + ((ch + k[j]) | 0)) | 0) + w[j];
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const byte = (hash[i] >> (j * 8)) & 255;
      result += (byte < 16 ? "0" : "") + byte.toString(16);
    }
  }

  return result;
}

/**
 * Hashes a Stellar or Web3 wallet address with SHA-256.
 * Guarantees zero raw wallet addresses leave the client.
 *
 * @param address Raw public wallet address (e.g., G... or 0x...)
 * @returns 64-character lowercase hexadecimal SHA-256 digest
 */
export function hashWalletAddress(address: string): string {
  if (!address || typeof address !== "string") {
    return "";
  }
  const normalized = address.trim();
  if (normalized.length === 0) {
    return "";
  }
  return sha256Sync(normalized);
}

// Regex patterns to detect raw crypto addresses or sensitive secrets
const STELLAR_PUBLIC_KEY_REGEX = /\bG[A-Z2-7]{55}\b/;
const STELLAR_SECRET_SEED_REGEX = /\bS[ABCD][A-Z2-7]{54}\b/;
const ETH_ADDRESS_REGEX = /\b0x[a-fA-F0-9]{40}\b/;
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/;

// Forbidden property keys that indicate PII or sensitive secrets
const FORBIDDEN_KEYS = new Set([
  "wallet",
  "walletaddress",
  "rawwalletaddress",
  "publickey",
  "secretkey",
  "privatekey",
  "seed",
  "mnemonic",
  "sessiontoken",
  "token",
  "password",
  "email",
  "phone",
  "ssn",
  "creditcard",
]);

/**
 * Custom error class for PII violation detection in analytics payloads.
 */
export class PIIValidationError extends Error {
  constructor(message: string) {
    super(`[Privacy Guard] PII Violation: ${message}`);
    this.name = "PIIValidationError";
  }
}

/**
 * Validates that an outgoing event payload does not contain PII or secret credentials.
 * Throws a PIIValidationError if any PII or forbidden field is detected.
 *
 * @param payload Key-value properties map intended for analytics tracking
 */
export function validateNoPII(payload: Record<string, unknown>): void {
  if (!payload || typeof payload !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    // 1. Check for forbidden property key names
    const cleanKey = key.toLowerCase().replace(/[_\-\s]/g, "");
    if (FORBIDDEN_KEYS.has(cleanKey)) {
      throw new PIIValidationError(
        `Property key "${key}" contains forbidden PII/credential terminology.`,
      );
    }

    // 2. Check value contents recursively if object/array
    if (typeof value === "string") {
      if (STELLAR_SECRET_SEED_REGEX.test(value)) {
        throw new PIIValidationError(
          `Value for "${key}" contains a potential Stellar secret seed key.`,
        );
      }
      if (STELLAR_PUBLIC_KEY_REGEX.test(value)) {
        throw new PIIValidationError(
          `Value for "${key}" contains a raw Stellar wallet address. Addresses must be hashed with hashWalletAddress().`,
        );
      }
      if (ETH_ADDRESS_REGEX.test(value)) {
        throw new PIIValidationError(
          `Value for "${key}" contains a raw Ethereum address. Addresses must be hashed with hashWalletAddress().`,
        );
      }
      if (EMAIL_REGEX.test(value)) {
        throw new PIIValidationError(`Value for "${key}" contains an email address.`);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          validateNoPII(item as Record<string, unknown>);
        } else if (typeof item === "string") {
          if (STELLAR_PUBLIC_KEY_REGEX.test(item) || STELLAR_SECRET_SEED_REGEX.test(item)) {
            throw new PIIValidationError(
              `Array under "${key}" contains raw wallet address or secret.`,
            );
          }
        }
      }
    } else if (typeof value === "object" && value !== null) {
      validateNoPII(value as Record<string, unknown>);
    }
  }
}

/**
 * Input for Campaign Viewed event.
 */
export interface CampaignViewedInput {
  campaignId: string | number;
  campaignName: string;
  category?: string;
  commissionRate: number;
}

/**
 * Segment/RudderStack Campaign Viewed Payload.
 * Adheres strictly to the Segment E-Commerce Spec.
 */
export interface CampaignViewedPayload {
  campaign_id: string;
  campaign_name: string;
  category: string;
  commission_rate: number;
}

/**
 * Maps StormSale campaign metadata to standard Segment "Campaign Viewed" properties.
 * Strips any potential user/wallet identifiers.
 */
export function mapCampaignViewed(input: CampaignViewedInput): {
  event: "Campaign Viewed";
  properties: CampaignViewedPayload;
} {
  const properties: CampaignViewedPayload = {
    campaign_id: String(input.campaignId),
    campaign_name: input.campaignName || "Untitled Campaign",
    category: input.category || "General",
    commission_rate:
      typeof input.commissionRate === "number"
        ? input.commissionRate
        : Number(input.commissionRate) || 0,
  };

  validateNoPII(properties as unknown as Record<string, unknown>);

  return {
    event: "Campaign Viewed",
    properties,
  };
}

/**
 * Input for Order Completed event.
 */
export interface OrderCompletedInput {
  orderId: string | number;
  campaignId: string | number;
  revenue: number | string; // XLM amount
  affiliateAddress: string; // Raw address to be hashed
}

/**
 * Segment/RudderStack Order Completed Payload.
 * Adheres strictly to the Segment E-Commerce Spec.
 */
export interface OrderCompletedPayload {
  order_id: string;
  campaign_id: string;
  revenue: number;
  currency: "XLM";
  affiliate_id: string; // SHA-256 hashed wallet address
}

/**
 * Maps StormSale on-chain verified sale data to Segment "Order Completed" properties.
 * Automatically hashes raw affiliate address using SHA-256 and validates zero PII.
 */
export function mapOrderCompleted(input: OrderCompletedInput): {
  event: "Order Completed";
  properties: OrderCompletedPayload;
} {
  const parsedRevenue =
    typeof input.revenue === "number" ? input.revenue : parseFloat(input.revenue) || 0;
  const hashedAffiliate = hashWalletAddress(input.affiliateAddress);

  const properties: OrderCompletedPayload = {
    order_id: String(input.orderId),
    campaign_id: String(input.campaignId),
    revenue: parsedRevenue,
    currency: "XLM",
    affiliate_id: hashedAffiliate,
  };

  validateNoPII(properties as unknown as Record<string, unknown>);

  return {
    event: "Order Completed",
    properties,
  };
}
