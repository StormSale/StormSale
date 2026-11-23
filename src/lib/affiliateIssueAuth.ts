import { Keypair } from "@stellar/stellar-sdk";
import { isValidWallet, sep53Digest } from "./telegramAlerts";
import type { z } from "zod";
import { affiliateIssueDraftSchema } from "./validation";

export type AffiliateIssueAction = "read" | "submit";
export type AffiliateIssueSubmission = z.infer<typeof affiliateIssueDraftSchema>;

export interface AffiliateIssueProof {
  action: AffiliateIssueAction;
  wallet: string;
  timestamp: number;
  signature: string;
}

export function buildAffiliateIssueAuthMessage(
  action: AffiliateIssueAction,
  wallet: string,
  timestamp: number,
  payload?: AffiliateIssueSubmission,
): string {
  const serializedPayload = action === "submit" ? JSON.stringify(payload) : "";
  return [
    "StormSale affiliate issue reports",
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    `Timestamp: ${timestamp}`,
    `Payload: ${serializedPayload}`,
  ].join("\n");
}

export function verifyAffiliateIssueProof(
  proof: Partial<AffiliateIssueProof>,
  expectedAction: AffiliateIssueAction,
  payload?: AffiliateIssueSubmission,
  now: number = Date.now(),
): proof is AffiliateIssueProof {
  if (proof.action !== expectedAction || !isValidWallet(proof.wallet)) return false;
  if (
    typeof proof.timestamp !== "number" ||
    !Number.isSafeInteger(proof.timestamp) ||
    Math.abs(now - proof.timestamp) > 5 * 60 * 1000
  ) {
    return false;
  }
  if (typeof proof.signature !== "string") return false;

  let signature: Uint8Array;
  try {
    const binary = atob(proof.signature);
    signature = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return false;
  }
  if (signature.length !== 64) return false;

  const message = buildAffiliateIssueAuthMessage(
    expectedAction,
    proof.wallet,
    proof.timestamp,
    payload,
  );
  try {
    return Keypair.fromPublicKey(proof.wallet).verify(
      sep53Digest(message) as never,
      signature as never,
    );
  } catch {
    return false;
  }
}
