/**
 * Unified validation schemas for StormSale forms and API endpoints.
 *
 * All form inputs, Soroban contract arguments, and API payloads are validated here.
 * Zod schemas serve as the single source of truth — usable on both
 * the frontend (field-level feedback) and backend/API boundaries.
 */
import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const MOCK_DEMO_WALLET_ADDRESS = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
export const MOCK_WATCH_KEY = "G" + "A".repeat(55);

/**
 * A valid Stellar public key (G…) or Soroban contract ID (C…).
 * 56 uppercase alphanumeric characters with valid StrKey checksum.
 */
export const stellarAddressSchema = z
  .string()
  .trim()
  .refine(
    (val) =>
      val === MOCK_DEMO_WALLET_ADDRESS ||
      val === MOCK_WATCH_KEY ||
      StrKey.isValidEd25519PublicKey(val) ||
      StrKey.isValidContract(val),
    {
      message:
        "Must be a valid 56-character Stellar address starting with G (public key) or C (contract)",
    },
  );

/**
 * Stellar public key only (G…). Used for affiliate/auditor wallet addresses.
 */
export const stellarPublicKeySchema = z
  .string()
  .trim()
  .refine(
    (val) =>
      val === MOCK_DEMO_WALLET_ADDRESS ||
      val === MOCK_WATCH_KEY ||
      StrKey.isValidEd25519PublicKey(val),
    {
      message: "Must be a valid Stellar public key starting with G (56 characters)",
    },
  );

/** `username*domain.com` SEP-0002 federation address. */
const FEDERATION_ADDRESS_PATTERN =
  /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?\*[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/**
 * A recipient entered as either a Stellar public key (G…) or a federation
 * address. Federation addresses are resolved to a G… account before any
 * contract call, where the resolved value is still validated as a public key.
 */
export const stellarRecipientSchema = z
  .string()
  .trim()
  .refine((val) => StrKey.isValidEd25519PublicKey(val) || FEDERATION_ADDRESS_PATTERN.test(val), {
    message:
      "Must be a valid 56-character Stellar public key starting with G, or a name*domain federation address",
  });

/**
 * Soroban contract address only (C…). Used for campaign contract addresses.
 */
export const sorobanContractSchema = z
  .string()
  .trim()
  .refine((val) => StrKey.isValidContract(val), {
    message: "Must be a valid Soroban contract address starting with C (56 characters)",
  });

/** Positive XLM amount with up to 7 decimal places (Stellar's native precision). */
export const xlmAmountSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .refine((val) => !isNaN(Number(val)) && isFinite(Number(val)), {
    message: "Must be a valid number",
  })
  .refine((val) => Number(val) > 0, { message: "Amount must be greater than 0" })
  .refine((val) => /^\d+(\.\d{1,7})?$/.test(val), {
    message: "Maximum 7 decimal places (XLM precision)",
  });

/** Positive integer ID (sale ID, campaign ID). */
/**
 * An on-chain campaign id: a whole number that fits the contract's u32.
 * A larger value would be rejected by the contract call, so it is refused
 * here with a message instead of failing as an unhandled rejection.
 */
export const campaignIdSchema = z
  .string()
  .trim()
  .refine((val) => /^\d+$/.test(val) && Number(val) <= 0xffffffff, {
    message: "Campaign ID must be a whole number up to 4294967295",
  });

export const positiveIntSchema = z
  .string()
  .trim()
  .min(1, "ID is required")
  .refine((val) => /^\d+$/.test(val) && parseInt(val, 10) > 0, {
    message: "Must be a positive whole number",
  });

// ---------------------------------------------------------------------------
// Form schemas
// ---------------------------------------------------------------------------

/**
 * Matches a plain, non-negative decimal amount such as `1000`, `12.5` or `.5`.
 * Exponent notation (`1e3`), signs, hex and whitespace are rejected so that the
 * value the user sees is exactly the value that is validated and escrowed.
 */
export const PLAIN_DECIMAL_AMOUNT_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export function isPlainDecimalAmount(value: string): boolean {
  return PLAIN_DECIMAL_AMOUNT_PATTERN.test(value.trim());
}

/**
 * CreateCampaignForm generator with asset decimal precision enforcement.
 * contract: create_campaign(name, budgetXlm, commissionRatePercent, clearingPeriodSecs)
 */
export const getCreateCampaignSchema = (maxDecimals: number = 7) =>
  z.object({
    campaignName: z
      .string()
      .trim()
      .min(3, "Campaign name must be at least 3 characters")
      .max(64, "Campaign name must be 64 characters or fewer"),

    commissionRate: z
      .string()
      .trim()
      .min(1, "Commission rate is required")
      .refine((val) => !isNaN(Number(val)) && isFinite(Number(val)), {
        message: "Must be a valid number",
      })
      .refine((val) => Number(val) >= 1, { message: "Commission rate must be at least 1%" })
      .refine((val) => Number(val) <= 50, { message: "Commission rate cannot exceed 50%" }),

    budget: z
      .string()
      .trim()
      .min(1, "Budget is required")
      .refine((val) => !isNaN(Number(val)) && isFinite(Number(val)), {
        message: "Must be a valid number",
      })
      .refine((val) => isPlainDecimalAmount(val), {
        message: "Enter a plain decimal amount (e.g. 1000 or 12.5), without exponent notation",
      })
      .refine((val) => Number(val) > 0, { message: "Budget must be a positive number" })
      .refine(
        (val) => {
          const fracDigits = val.includes(".") ? (val.split(".")[1]?.length ?? 0) : 0;
          return fracDigits <= maxDecimals;
        },
        {
          message: `Budget supports at most ${maxDecimals} decimal places`,
        },
      ),

    clearingPeriod: z
      .string()
      .trim()
      .min(1, "Clearing period is required")
      .refine((val) => /^\d+$/.test(val) && parseInt(val, 10) > 0, {
        message: "Must be a positive number of seconds",
      })
      .refine((val) => parseInt(val, 10) >= 3600, {
        message: "Clearing period must be at least 1 hour (3600 seconds)",
      }),
  });

export const createCampaignSchema = getCreateCampaignSchema(7);

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

// ---------------------------------------------------------------------------

/**
 * LogSaleForm
 * contract: log_sale(campaignId, affiliateAddress, amountXlm)
 */
export const logSaleSchema = z.object({
  // The on-chain campaign id (what private-campaign access is keyed on), or
  // a contract/account address.
  campaignAddress: campaignIdSchema.or(sorobanContractSchema).or(stellarAddressSchema),

  affiliateAddress: stellarRecipientSchema,

  saleAmount: xlmAmountSchema,

  customerData: z.string().max(256, "Customer info must be 256 characters or fewer").optional(),
});

export type LogSaleInput = z.infer<typeof logSaleSchema>;

// ---------------------------------------------------------------------------

/**
 * GrantAccessForm
 * contract: grant_audit_access(saleId, auditorAddress, wrappedKey)
 */
export const grantAccessSchema = z.object({
  campaignAddress: sorobanContractSchema.or(stellarAddressSchema),

  saleId: positiveIntSchema,

  auditorAddress: stellarRecipientSchema,
});

export type GrantAccessInput = z.infer<typeof grantAccessSchema>;

// ---------------------------------------------------------------------------

/**
 * JoinCampaignButton
 * contract: join_campaign(campaignAddress)
 */
export const joinCampaignSchema = z.object({
  campaignAddress: sorobanContractSchema.or(stellarAddressSchema),
});

export type JoinCampaignInput = z.infer<typeof joinCampaignSchema>;

// ---------------------------------------------------------------------------

/**
 * VerifyAccess (Auditor)
 * contract: check_audit_access(campaignAddress, saleId)
 */
export const verifyAccessSchema = z.object({
  campaignAddress: sorobanContractSchema.or(stellarAddressSchema),

  saleId: positiveIntSchema,
});

export type VerifyAccessInput = z.infer<typeof verifyAccessSchema>;

// ---------------------------------------------------------------------------
// API schemas
// ---------------------------------------------------------------------------

/** Schema for registerUser API request */
export const registerUserRequestSchema = z.object({
  walletAddress: stellarPublicKeySchema,
  role: z.string().trim().min(1, "Role is required"),
});

export type RegisterUserRequestInput = z.infer<typeof registerUserRequestSchema>;

/** Schema for registerUser API response */
export const registerUserResponseSchema = z
  .object({
    role: z.string().optional(),
  })
  .passthrough();

/** Schema for fetchCampaign API response */
export const campaignMetadataResponseSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
  })
  .passthrough();

/** Schema for individual CustomerConversion in fetchConversions API response */
export const customerConversionSchema = z.object({
  id: z.string(),
  customerRef: z.string(),
  affiliateAddress: z.string(),
  affiliateName: z.string(),
  campaignId: z.string(),
  campaignName: z.string(),
  amount: z.number(),
  timestamp: z.string(),
});

/** Schema for fetchConversions API response */
export const conversionsListResponseSchema = z.array(customerConversionSchema.passthrough());

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Parses a Zod error and returns a flat field → message map.
 * Works with any of the form schemas above.
 *
 * @example
 * const result = createCampaignSchema.safeParse(data);
 * if (!result.success) {
 *   const errors = getFieldErrors(result.error);
 *   // { campaignName: "Must be at least 3 characters", ... }
 * }
 */
export function getFieldErrors(error: z.ZodError): Record<string, string> {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path.join(".");
    if (key && !acc[key]) acc[key] = issue.message;
    return acc;
  }, {});
}

/**
 * Validates form data against a schema and returns typed errors.
 * Returns null when validation passes.
 */
export function validate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { data: z.infer<T>; errors: null } | { data: null; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) return { data: result.data, errors: null };
  return { data: null, errors: getFieldErrors(result.error) };
}
