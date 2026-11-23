/**
 * Consumer purchase dispute helpers: form validation, client-side evidence
 * image compression, and the Soroban call that locks the associated escrow.
 */
import { Address, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { z } from "zod";
import { campaignIdSchema, stellarAddressSchema } from "./validation";
import { invokeSorobanMethod, type WalletType } from "./stellar";

export const DISPUTE_REASON_CATEGORIES = [
  "not_delivered",
  "not_as_described",
  "damaged",
  "unauthorized",
  "other",
] as const;
export type DisputeReasonCategory = (typeof DISPUTE_REASON_CATEGORIES)[number];

export const DISPUTE_DESCRIPTION_MIN = 20;
export const DISPUTE_DESCRIPTION_MAX = 2000;

export const disputeFormSchema = z.object({
  orderId: z
    .string()
    .trim()
    .min(1, "Order ID is required")
    .refine((v) => /^\d+$/.test(v) && Number(v) > 0, {
      message: "Order ID must be a positive whole number",
    })
    .pipe(campaignIdSchema),
  reason: z.enum(DISPUTE_REASON_CATEGORIES, { message: "Select a reason category" }),
  description: z
    .string()
    .trim()
    .min(
      DISPUTE_DESCRIPTION_MIN,
      `Description must be at least ${DISPUTE_DESCRIPTION_MIN} characters`,
    )
    .max(
      DISPUTE_DESCRIPTION_MAX,
      `Description must be at most ${DISPUTE_DESCRIPTION_MAX} characters`,
    ),
});
export type DisputeFormInput = z.infer<typeof disputeFormSchema>;

export const MAX_EVIDENCE_DIMENSION = 1600;
export const EVIDENCE_QUALITY = 0.7;
export const MAX_EVIDENCE_FILES = 5;

/** Scale (width, height) down so the longest side fits within `max`; never upscales. */
export function computeScaledDimensions(
  width: number,
  height: number,
  max: number = MAX_EVIDENCE_DIMENSION,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error("Invalid image dimensions");
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface ImageCodec {
  decode(file: Blob): Promise<{ width: number; height: number; source: unknown }>;
  encode(
    source: unknown,
    width: number,
    height: number,
    type: string,
    quality: number,
  ): Promise<Blob>;
}

/** Default browser codec built on createImageBitmap + canvas. */
export const browserImageCodec: ImageCodec = {
  async decode(file) {
    const bmp = await createImageBitmap(file);
    return { width: bmp.width, height: bmp.height, source: bmp };
  },
  async encode(source, width, height, type, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Compression failed"))),
        type,
        quality,
      ),
    );
  },
};

/**
 * Compress an evidence image before upload. Non-images are rejected; if
 * compression does not shrink the file, the original is returned.
 */
export async function compressEvidenceImage(
  file: File,
  codec: ImageCodec = browserImageCodec,
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Evidence must be an image file");
  }
  const { width, height, source } = await codec.decode(file);
  const dims = computeScaledDimensions(width, height);
  const blob = await codec.encode(source, dims.width, dims.height, "image/jpeg", EVIDENCE_QUALITY);
  if (blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
}

/**
 * Opens a dispute on-chain; the contract locks the escrow tied to the order.
 * `evidenceHash` is a hex digest of the evidence bundle (kept off-chain).
 */
export async function openDisputeContractCall(
  consumerAddress: string,
  orderId: number,
  reason: DisputeReasonCategory,
  evidenceHash: string,
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string }> {
  if (!stellarAddressSchema.safeParse(consumerAddress).success) {
    throw new Error("Invalid consumer address");
  }
  if (!Number.isInteger(orderId) || orderId <= 0 || orderId > 0xffffffff) {
    throw new Error("Invalid order ID");
  }
  const args: xdr.ScVal[] = [
    new Address(consumerAddress).toScVal(),
    nativeToScVal(orderId, { type: "u32" }),
    nativeToScVal(reason, { type: "symbol" }),
    nativeToScVal(evidenceHash, { type: "string" }),
  ];
  const result = await invokeSorobanMethod(consumerAddress, "open_dispute", args, walletType);
  return { success: true, txHash: result.txHash };
}
