/**
 * B2C Consumer Feedback & Verified Purchase Review Submission (#458)
 *
 * Pure, framework-agnostic helpers backing the consumer review UI:
 * - Keyboard-accessible star rating state machine.
 * - Review text character counter and empty/short/overflow guards.
 * - Per-wallet anti-spam rate limiting for review submissions.
 * - Verified purchase guard backed by an on-chain transaction receipt.
 * - Receipt verification badge metadata for the review card.
 */

import { isValidStellarAddress } from "./stellar";
import { getStellarExplorerLink } from "../utils/network";

export const REVIEW_MAX_CHARS = 500;
export const REVIEW_MIN_CHARS = 10;
export const REVIEW_MAX_STARS = 5;
export const VERIFIED_PURCHASE_LABEL = "Verified Purchase";
export const UNVERIFIED_LABEL = "Unverified";
export const DEFAULT_REVIEW_RATE_LIMIT = 2;
export const DEFAULT_REVIEW_RATE_WINDOW_MS = 60_000;

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export type TransactionStatus = "SUCCESS" | "FAILED" | "NOT_FOUND";

export interface VerifiedTransaction {
  txHash: string;
  buyerAddress: string;
  productId: string;
  status: TransactionStatus;
}

export interface StarRatingState {
  focusedStar: number;
  rating: number;
}

export interface StarRatingController {
  getState(): StarRatingState;
  handleKeyDown(key: string): StarRatingState;
  handleStarClick(star: number): StarRatingState;
}

export type ReviewTextError = "EMPTY_REVIEW" | "TOO_SHORT" | "TOO_LONG" | null;

export interface ReviewTextValidation {
  valid: boolean;
  reason: ReviewTextError;
}

export interface ReviewCharCount {
  length: number;
  remaining: number;
  withinLimit: boolean;
  truncated: string;
}

export interface ReviewRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface ReviewRateLimiter {
  check(wallet: string, now: number): ReviewRateLimitResult;
  record(wallet: string, now: number): void;
  reset(): void;
}

export interface ReviewSubmission {
  success: boolean;
  txHash: string;
  rating: number;
  text: string;
}

export interface ReviewSubmissionParams {
  wallet: string;
  productId: string;
  rating: number;
  text: string;
  verifiedTx: VerifiedTransaction | undefined;
}

export interface ReceiptVerificationBadge {
  verified: boolean;
  label: string;
  explorerUrl: string | null;
  shortHash: string | null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Creates the keyboard-driven star rating state machine used by the review form.
 *
 * Arrow keys (and Home/End) only move focus; Enter or Space commits the focused
 * star as the rating. This mirrors the WAI-ARIA radiogroup interaction model.
 */
export function createStarRatingController(
  maxStars: number = REVIEW_MAX_STARS,
): StarRatingController {
  if (!Number.isInteger(maxStars) || maxStars < 1) {
    throw new Error("Star rating requires a positive integer number of stars.");
  }

  let state: StarRatingState = { focusedStar: 1, rating: 0 };

  const setFocusedStar = (star: number): void => {
    state = { ...state, focusedStar: clamp(star, 1, maxStars) };
  };

  const commitFocusedStar = (): StarRatingState => {
    state = { ...state, rating: state.focusedStar };
    return state;
  };

  return {
    getState: (): StarRatingState => ({ ...state }),
    handleKeyDown(key: string): StarRatingState {
      switch (key) {
        case "ArrowRight":
        case "ArrowUp":
          setFocusedStar(state.focusedStar + 1);
          break;
        case "ArrowLeft":
        case "ArrowDown":
          setFocusedStar(state.focusedStar - 1);
          break;
        case "Home":
          setFocusedStar(1);
          break;
        case "End":
          setFocusedStar(maxStars);
          break;
        case "Enter":
        case " ":
          return commitFocusedStar();
        default:
          break;
      }
      return { ...state };
    },
    handleStarClick(star: number): StarRatingState {
      const selected = clamp(star, 1, maxStars);
      state = { rating: selected, focusedStar: selected };
      return { ...state };
    },
  };
}

/**
 * Counts review characters and exposes the remaining allowance for the UI counter.
 */
export function countReviewChars(text: string, max: number = REVIEW_MAX_CHARS): ReviewCharCount {
  const length = text.length;
  return {
    length,
    remaining: Math.max(0, max - length),
    withinLimit: length <= max,
    truncated: text.slice(0, max),
  };
}

/**
 * Validates review body text before submission.
 */
export function validateReviewText(
  text: string,
  min: number = REVIEW_MIN_CHARS,
  max: number = REVIEW_MAX_CHARS,
): ReviewTextValidation {
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "EMPTY_REVIEW" };
  if (trimmed.length < min) return { valid: false, reason: "TOO_SHORT" };
  if (text.length > max) return { valid: false, reason: "TOO_LONG" };
  return { valid: true, reason: null };
}

/**
 * Sliding-window, per-wallet anti-spam limiter for review submissions.
 * Timestamps are injected so callers and tests never depend on the wall clock.
 */
export function createReviewRateLimiter(
  maxSubmissions: number = DEFAULT_REVIEW_RATE_LIMIT,
  windowMs: number = DEFAULT_REVIEW_RATE_WINDOW_MS,
): ReviewRateLimiter {
  if (!Number.isInteger(maxSubmissions) || maxSubmissions < 1) {
    throw new Error("Review rate limit requires at least one allowed submission.");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Review rate limit window must be a positive duration.");
  }

  const submissionsByWallet = new Map<string, number[]>();

  const recentFor = (wallet: string, now: number): number[] =>
    (submissionsByWallet.get(wallet) ?? []).filter((time) => now - time < windowMs);

  return {
    check(wallet: string, now: number): ReviewRateLimitResult {
      const recent = recentFor(wallet, now);
      const allowed = recent.length < maxSubmissions;
      const oldest = recent[0];
      return {
        allowed,
        remaining: Math.max(0, maxSubmissions - recent.length),
        retryAfterMs: allowed || oldest === undefined ? 0 : windowMs - (now - oldest),
      };
    },
    record(wallet: string, now: number): void {
      const recent = recentFor(wallet, now);
      recent.push(now);
      submissionsByWallet.set(wallet, recent);
    },
    reset(): void {
      submissionsByWallet.clear();
    },
  };
}

/**
 * Returns true only when the receipt proves this wallet bought this product
 * in a successful, well-formed on-chain transaction.
 */
export function isVerifiedPurchase(
  tx: VerifiedTransaction | undefined,
  wallet: string,
  productId: string,
): boolean {
  if (!tx) return false;
  if (tx.status !== "SUCCESS") return false;
  if (!isValidStellarAddress(tx.buyerAddress)) return false;
  if (tx.buyerAddress !== wallet) return false;
  if (tx.productId !== productId) return false;
  return TX_HASH_PATTERN.test(tx.txHash);
}

/**
 * Submits a review, rejecting wallets without a verified purchase for the product.
 */
export function submitVerifiedReview(params: ReviewSubmissionParams): ReviewSubmission {
  const { wallet, productId, rating, text, verifiedTx } = params;

  if (!isValidStellarAddress(wallet)) {
    throw new Error("Review blocked: invalid wallet address.");
  }
  if (!isVerifiedPurchase(verifiedTx, wallet, productId)) {
    throw new Error("Review blocked: wallet has no verified transaction for this product.");
  }

  const textCheck = validateReviewText(text, REVIEW_MIN_CHARS, REVIEW_MAX_CHARS);
  if (!textCheck.valid) {
    throw new Error(`Review blocked: invalid review text (${textCheck.reason}).`);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > REVIEW_MAX_STARS) {
    throw new Error("Review blocked: rating must be between 1 and 5.");
  }

  return {
    success: true,
    txHash: verifiedTx!.txHash,
    rating,
    text: text.trim(),
  };
}

/**
 * Builds the on-chain receipt verification badge shown on a review card.
 * A failed or mismatched receipt still exposes its explorer link for inspection,
 * but is never labelled as a verified purchase.
 */
export function buildReceiptVerificationBadge(
  tx: VerifiedTransaction | undefined,
  wallet: string,
  productId: string,
): ReceiptVerificationBadge {
  const verified = isVerifiedPurchase(tx, wallet, productId);
  return {
    verified,
    label: verified ? VERIFIED_PURCHASE_LABEL : UNVERIFIED_LABEL,
    explorerUrl: tx ? getStellarExplorerLink("tx", tx.txHash) : null,
    shortHash: tx ? `${tx.txHash.slice(0, 10)}...${tx.txHash.slice(-8)}` : null,
  };
}
