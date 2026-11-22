import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { isValidStellarAddress } from "../lib/stellar";
import { getStellarExplorerLink } from "../utils/network";

const REVIEW_MAX_CHARS = 500;
const REVIEW_MIN_CHARS = 10;
const VERIFIED_PURCHASE_LABEL = "Verified Purchase";
const UNVERIFIED_LABEL = "Unverified";

const BUYER_WALLET = Keypair.random().publicKey();
const OTHER_WALLET = Keypair.random().publicKey();
const PRODUCT_ID = "storm-sale-consumer-gadget-42";
const VALID_TX_HASH = `0x${"a".repeat(64)}`;
const FAILED_TX_HASH = `0x${"b".repeat(64)}`;

type TransactionStatus = "SUCCESS" | "FAILED" | "NOT_FOUND";

interface VerifiedTransaction {
  txHash: string;
  buyerAddress: string;
  productId: string;
  status: TransactionStatus;
}

interface StarRatingState {
  focusedStar: number;
  rating: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function createStarRatingController(maxStars = 5) {
  let state: StarRatingState = { focusedStar: 1, rating: 0 };

  const commitFocused = (): StarRatingState => {
    state = { ...state, rating: state.focusedStar };
    return state;
  };

  return {
    getState: (): StarRatingState => state,
    handleKeyDown(key: string): StarRatingState {
      switch (key) {
        case "ArrowRight":
        case "ArrowUp":
          state = { ...state, focusedStar: clamp(state.focusedStar + 1, 1, maxStars) };
          break;
        case "ArrowLeft":
        case "ArrowDown":
          state = { ...state, focusedStar: clamp(state.focusedStar - 1, 1, maxStars) };
          break;
        case "Home":
          state = { ...state, focusedStar: 1 };
          break;
        case "End":
          state = { ...state, focusedStar: maxStars };
          break;
        case "Enter":
        case " ":
          return commitFocused();
        default:
          break;
      }
      return state;
    },
    handleStarClick(star: number): StarRatingState {
      state = { rating: clamp(star, 1, maxStars), focusedStar: clamp(star, 1, maxStars) };
      return state;
    },
  };
}

function countReviewChars(text: string, max: number = REVIEW_MAX_CHARS) {
  return {
    length: text.length,
    remaining: Math.max(0, max - text.length),
    withinLimit: text.length <= max,
    truncated: text.slice(0, max),
  };
}

type ReviewTextError = "EMPTY_REVIEW" | "TOO_SHORT" | "TOO_LONG" | null;

function validateReviewText(text: string): { valid: boolean; reason: ReviewTextError } {
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "EMPTY_REVIEW" };
  if (trimmed.length < REVIEW_MIN_CHARS) return { valid: false, reason: "TOO_SHORT" };
  if (text.length > REVIEW_MAX_CHARS) return { valid: false, reason: "TOO_LONG" };
  return { valid: true, reason: null };
}

function createReviewRateLimiter(maxSubmissions: number, windowMs: number) {
  const submissionsByWallet = new Map<string, number[]>();

  const recentFor = (wallet: string, now: number): number[] =>
    (submissionsByWallet.get(wallet) ?? []).filter((time) => now - time < windowMs);

  return {
    check(wallet: string, now: number) {
      const recent = recentFor(wallet, now);
      const allowed = recent.length < maxSubmissions;
      const oldest = recent[0];
      return {
        allowed,
        remaining: Math.max(0, maxSubmissions - recent.length),
        retryAfterMs: allowed || oldest === undefined ? 0 : windowMs - (now - oldest),
      };
    },
    record(wallet: string, now: number) {
      const recent = recentFor(wallet, now);
      recent.push(now);
      submissionsByWallet.set(wallet, recent);
    },
    reset() {
      submissionsByWallet.clear();
    },
  };
}

function isVerifiedPurchase(
  tx: VerifiedTransaction | undefined,
  wallet: string,
  productId: string,
): boolean {
  if (!tx) return false;
  if (tx.status !== "SUCCESS") return false;
  if (!isValidStellarAddress(tx.buyerAddress)) return false;
  if (tx.buyerAddress !== wallet) return false;
  if (tx.productId !== productId) return false;
  return /^0x[0-9a-fA-F]{64}$/.test(tx.txHash);
}

interface ReviewSubmission {
  success: boolean;
  txHash: string;
  rating: number;
  text: string;
}

function submitVerifiedReview(params: {
  wallet: string;
  productId: string;
  rating: number;
  text: string;
  verifiedTx: VerifiedTransaction | undefined;
}): ReviewSubmission {
  const { wallet, productId, rating, text, verifiedTx } = params;

  if (!isValidStellarAddress(wallet)) {
    throw new Error("Review blocked: invalid wallet address.");
  }
  if (!isVerifiedPurchase(verifiedTx, wallet, productId)) {
    throw new Error("Review blocked: wallet has no verified transaction for this product.");
  }
  const textCheck = validateReviewText(text);
  if (!textCheck.valid) {
    throw new Error(`Review blocked: invalid review text (${textCheck.reason}).`);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Review blocked: rating must be between 1 and 5.");
  }

  return { success: true, txHash: verifiedTx!.txHash, rating, text: text.trim() };
}

function buildReceiptVerificationBadge(
  tx: VerifiedTransaction | undefined,
  wallet: string,
  productId: string,
) {
  const verified = isVerifiedPurchase(tx, wallet, productId);
  return {
    verified,
    label: verified ? VERIFIED_PURCHASE_LABEL : UNVERIFIED_LABEL,
    explorerUrl: tx ? getStellarExplorerLink("tx", tx.txHash) : null,
    shortHash: tx ? `${tx.txHash.slice(0, 10)}...${tx.txHash.slice(-8)}` : null,
  };
}

describe("B2C Consumer Feedback & Verified Purchase Review Submission (#458)", () => {
  const successfulTx: VerifiedTransaction = {
    txHash: VALID_TX_HASH,
    buyerAddress: BUYER_WALLET,
    productId: PRODUCT_ID,
    status: "SUCCESS",
  };

  const validReviewText = "Absolutely stellar quality and fast delivery, highly recommended!";

  describe("Star Rating Keyboard Navigation", () => {
    it("focuses the first star initially with no rating committed", () => {
      const rating = createStarRatingController();
      expect(rating.getState()).toEqual({ focusedStar: 1, rating: 0 });
    });

    it("moves focus right and up through the stars without committing", () => {
      const rating = createStarRatingController();
      rating.handleKeyDown("ArrowRight");
      rating.handleKeyDown("ArrowUp");
      expect(rating.getState()).toEqual({ focusedStar: 3, rating: 0 });
    });

    it("moves focus left and down through the stars", () => {
      const rating = createStarRatingController();
      rating.handleKeyDown("End");
      rating.handleKeyDown("ArrowLeft");
      rating.handleKeyDown("ArrowDown");
      expect(rating.getState().focusedStar).toBe(3);
      expect(rating.getState().rating).toBe(0);
    });

    it("clamps focus at both ends of the scale", () => {
      const rating = createStarRatingController();
      [1, 2, 3, 4, 5, 6, 7].forEach(() => rating.handleKeyDown("ArrowRight"));
      expect(rating.getState().focusedStar).toBe(5);
      [1, 2, 3, 4, 5, 6, 7].forEach(() => rating.handleKeyDown("ArrowLeft"));
      expect(rating.getState().focusedStar).toBe(1);
    });

    it("commits the focused star on Enter", () => {
      const rating = createStarRatingController();
      rating.handleKeyDown("ArrowRight");
      rating.handleKeyDown("ArrowRight");
      rating.handleKeyDown("Enter");
      expect(rating.getState()).toEqual({ focusedStar: 3, rating: 3 });
    });

    it("commits the focused star on Space as well as Enter", () => {
      const rating = createStarRatingController();
      rating.handleKeyDown("End");
      rating.handleKeyDown(" ");
      expect(rating.getState().rating).toBe(5);
    });

    it("supports Home/End for first and last star selection", () => {
      const rating = createStarRatingController();
      rating.handleKeyDown("End");
      rating.handleKeyDown("Enter");
      expect(rating.getState().rating).toBe(5);
      rating.handleKeyDown("Home");
      rating.handleKeyDown("Enter");
      expect(rating.getState().rating).toBe(1);
    });

    it("ignores unrelated keys and keeps rating state stable", () => {
      const rating = createStarRatingController();
      rating.handleKeyDown("ArrowRight");
      rating.handleKeyDown("x");
      expect(rating.getState()).toEqual({ focusedStar: 2, rating: 0 });
    });

    it("allows mouse selection to synchronize focus and rating", () => {
      const rating = createStarRatingController();
      expect(rating.handleStarClick(4)).toEqual({ focusedStar: 4, rating: 4 });
    });
  });

  describe("Review Text Character Counter & Empty Guard", () => {
    it("counts characters and reports remaining allowance", () => {
      const counter = countReviewChars(validReviewText);
      expect(counter.length).toBe(validReviewText.length);
      expect(counter.remaining).toBe(REVIEW_MAX_CHARS - validReviewText.length);
      expect(counter.withinLimit).toBe(true);
    });

    it("flags text at the character limit and truncates overflow", () => {
      const atLimit = "x".repeat(REVIEW_MAX_CHARS);
      expect(countReviewChars(atLimit)).toMatchObject({
        length: REVIEW_MAX_CHARS,
        remaining: 0,
        withinLimit: true,
      });

      const overLimit = `${atLimit}EXTRA`;
      expect(countReviewChars(overLimit)).toMatchObject({
        remaining: 0,
        withinLimit: false,
      });
      expect(countReviewChars(overLimit).truncated).toBe(atLimit);
    });

    it("rejects empty and whitespace-only submissions", () => {
      expect(validateReviewText("")).toEqual({ valid: false, reason: "EMPTY_REVIEW" });
      expect(validateReviewText("   \n\t ")).toEqual({ valid: false, reason: "EMPTY_REVIEW" });
    });

    it("rejects reviews shorter than the minimum length", () => {
      expect(validateReviewText("great")).toEqual({ valid: false, reason: "TOO_SHORT" });
    });

    it("rejects reviews longer than the character limit", () => {
      expect(validateReviewText("x".repeat(REVIEW_MAX_CHARS + 1))).toEqual({
        valid: false,
        reason: "TOO_LONG",
      });
    });

    it("accepts a valid review body", () => {
      expect(validateReviewText(validReviewText)).toEqual({ valid: true, reason: null });
    });

    it("blocks submission through the submit path when the review text is empty", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: BUYER_WALLET,
          productId: PRODUCT_ID,
          rating: 5,
          text: "   ",
          verifiedTx: successfulTx,
        }),
      ).toThrow("Review blocked: invalid review text (EMPTY_REVIEW).");
    });
  });

  describe("Anti-Spam Review Rate Limiting", () => {
    let limiter: ReturnType<typeof createReviewRateLimiter>;

    beforeEach(() => {
      limiter = createReviewRateLimiter(2, 60_000);
    });

    it("allows submissions up to the configured maximum within the window", () => {
      expect(limiter.check(BUYER_WALLET, 0).allowed).toBe(true);
      limiter.record(BUYER_WALLET, 0);
      expect(limiter.check(BUYER_WALLET, 1_000).allowed).toBe(true);
      limiter.record(BUYER_WALLET, 1_000);
      expect(limiter.check(BUYER_WALLET, 2_000)).toMatchObject({
        allowed: false,
        remaining: 0,
      });
    });

    it("reports the retry delay when the window is exhausted", () => {
      limiter.record(BUYER_WALLET, 10_000);
      limiter.record(BUYER_WALLET, 20_000);
      const result = limiter.check(BUYER_WALLET, 30_000);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(40_000);
    });

    it("allows a new submission once the window has elapsed", () => {
      limiter.record(BUYER_WALLET, 0);
      limiter.record(BUYER_WALLET, 1_000);
      expect(limiter.check(BUYER_WALLET, 59_999).allowed).toBe(false);
      expect(limiter.check(BUYER_WALLET, 60_000).allowed).toBe(true);
    });

    it("isolates rate limits per wallet", () => {
      limiter.record(BUYER_WALLET, 0);
      limiter.record(BUYER_WALLET, 1_000);
      expect(limiter.check(BUYER_WALLET, 2_000).allowed).toBe(false);
      expect(limiter.check(OTHER_WALLET, 2_000).allowed).toBe(true);
    });

    it("clears all state on reset", () => {
      limiter.record(BUYER_WALLET, 0);
      limiter.record(BUYER_WALLET, 1_000);
      limiter.reset();
      expect(limiter.check(BUYER_WALLET, 2_000).remaining).toBe(2);
    });
  });

  describe("Verified Transaction Submission Guard", () => {
    it("accepts a submission from a verified buyer", () => {
      const receipt = submitVerifiedReview({
        wallet: BUYER_WALLET,
        productId: PRODUCT_ID,
        rating: 5,
        text: validReviewText,
        verifiedTx: successfulTx,
      });
      expect(receipt).toEqual({
        success: true,
        txHash: VALID_TX_HASH,
        rating: 5,
        text: validReviewText,
      });
    });

    it("blocks submission when the wallet has no transaction at all", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: BUYER_WALLET,
          productId: PRODUCT_ID,
          rating: 5,
          text: validReviewText,
          verifiedTx: undefined,
        }),
      ).toThrow("Review blocked: wallet has no verified transaction for this product.");
    });

    it("blocks submission when the transaction status is not SUCCESS", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: BUYER_WALLET,
          productId: PRODUCT_ID,
          rating: 5,
          text: validReviewText,
          verifiedTx: { ...successfulTx, txHash: FAILED_TX_HASH, status: "FAILED" },
        }),
      ).toThrow("Review blocked: wallet has no verified transaction for this product.");

      expect(
        isVerifiedPurchase({ ...successfulTx, status: "NOT_FOUND" }, BUYER_WALLET, PRODUCT_ID),
      ).toBe(false);
    });

    it("blocks submission when the transaction buyer does not match the wallet", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: OTHER_WALLET,
          productId: PRODUCT_ID,
          rating: 5,
          text: validReviewText,
          verifiedTx: successfulTx,
        }),
      ).toThrow("Review blocked: wallet has no verified transaction for this product.");
    });

    it("blocks submission for a different product", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: BUYER_WALLET,
          productId: "a-different-product",
          rating: 5,
          text: validReviewText,
          verifiedTx: successfulTx,
        }),
      ).toThrow("Review blocked: wallet has no verified transaction for this product.");
    });

    it("rejects a malformed transaction hash", () => {
      expect(
        isVerifiedPurchase({ ...successfulTx, txHash: "not-a-hash" }, BUYER_WALLET, PRODUCT_ID),
      ).toBe(false);
    });

    it("rejects an unverified buyer address on the transaction", () => {
      expect(
        isVerifiedPurchase({ ...successfulTx, buyerAddress: "INVALID" }, BUYER_WALLET, PRODUCT_ID),
      ).toBe(false);
    });

    it("rejects an invalid reviewer wallet address", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: "INVALID",
          productId: PRODUCT_ID,
          rating: 5,
          text: validReviewText,
          verifiedTx: successfulTx,
        }),
      ).toThrow("Review blocked: invalid wallet address.");
    });

    it("rejects a rating outside the 1-5 scale", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: BUYER_WALLET,
          productId: PRODUCT_ID,
          rating: 6,
          text: validReviewText,
          verifiedTx: successfulTx,
        }),
      ).toThrow("Review blocked: rating must be between 1 and 5.");
    });
  });

  describe("On-Chain Receipt Verification Badge", () => {
    it("renders a verified badge with an explorer link for a successful purchase", () => {
      const badge = buildReceiptVerificationBadge(successfulTx, BUYER_WALLET, PRODUCT_ID);
      expect(badge.verified).toBe(true);
      expect(badge.label).toBe(VERIFIED_PURCHASE_LABEL);
      expect(badge.explorerUrl).toBe(getStellarExplorerLink("tx", VALID_TX_HASH));
      expect(badge.explorerUrl).toContain(VALID_TX_HASH);
      expect(badge.shortHash).toBe(`${VALID_TX_HASH.slice(0, 10)}...${VALID_TX_HASH.slice(-8)}`);
    });

    it("renders an unverified badge when no receipt exists", () => {
      const badge = buildReceiptVerificationBadge(undefined, BUYER_WALLET, PRODUCT_ID);
      expect(badge).toMatchObject({
        verified: false,
        label: UNVERIFIED_LABEL,
        explorerUrl: null,
        shortHash: null,
      });
    });

    it("does not trust a failed receipt for the verified badge", () => {
      const badge = buildReceiptVerificationBadge(
        { ...successfulTx, txHash: FAILED_TX_HASH, status: "FAILED" },
        BUYER_WALLET,
        PRODUCT_ID,
      );
      expect(badge.verified).toBe(false);
      expect(badge.label).toBe(UNVERIFIED_LABEL);
      expect(badge.explorerUrl).toBe(getStellarExplorerLink("tx", FAILED_TX_HASH));
    });

    it("does not trust a receipt belonging to another wallet", () => {
      const badge = buildReceiptVerificationBadge(successfulTx, OTHER_WALLET, PRODUCT_ID);
      expect(badge.verified).toBe(false);
      expect(badge.label).toBe(UNVERIFIED_LABEL);
    });
  });
});
