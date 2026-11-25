import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { getStellarExplorerLink } from "../utils/network";
import {
  REVIEW_MAX_CHARS,
  REVIEW_MIN_CHARS,
  REVIEW_MAX_STARS,
  VERIFIED_PURCHASE_LABEL,
  UNVERIFIED_LABEL,
  createStarRatingController,
  countReviewChars,
  validateReviewText,
  createReviewRateLimiter,
  isVerifiedPurchase,
  submitVerifiedReview,
  buildReceiptVerificationBadge,
  type VerifiedTransaction,
} from "../lib/reviewSubmission";

const BUYER_WALLET = Keypair.random().publicKey();
const OTHER_WALLET = Keypair.random().publicKey();
const PRODUCT_ID = "storm-sale-consumer-gadget-42";
const VALID_TX_HASH = `0x${"a".repeat(64)}`;
const FAILED_TX_HASH = `0x${"b".repeat(64)}`;

const successfulTx: VerifiedTransaction = {
  txHash: VALID_TX_HASH,
  buyerAddress: BUYER_WALLET,
  productId: PRODUCT_ID,
  status: "SUCCESS",
};

const validReviewText = "Absolutely stellar quality and fast delivery, highly recommended!";

describe("B2C Consumer Feedback & Verified Purchase Review Submission (#458)", () => {
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
      expect(rating.getState().focusedStar).toBe(REVIEW_MAX_STARS);
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

    it("clamps pointer selection to the configured scale", () => {
      const rating = createStarRatingController();
      expect(rating.handleStarClick(99)).toEqual({
        focusedStar: REVIEW_MAX_STARS,
        rating: REVIEW_MAX_STARS,
      });
      expect(rating.handleStarClick(0)).toEqual({ focusedStar: 1, rating: 1 });
    });

    it("supports custom star counts", () => {
      const rating = createStarRatingController(10);
      rating.handleKeyDown("End");
      rating.handleKeyDown("Enter");
      expect(rating.getState().rating).toBe(10);
    });

    it("rejects an invalid star count", () => {
      expect(() => createStarRatingController(0)).toThrow(/positive integer/);
      expect(() => createStarRatingController(2.5)).toThrow(/positive integer/);
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

    it("never reports negative remaining characters", () => {
      const empty = countReviewChars("");
      expect(empty).toMatchObject({ length: 0, remaining: REVIEW_MAX_CHARS, withinLimit: true });
      expect(countReviewChars("x".repeat(REVIEW_MAX_CHARS + 10)).remaining).toBe(0);
    });

    it("rejects empty and whitespace-only submissions", () => {
      expect(validateReviewText("")).toEqual({ valid: false, reason: "EMPTY_REVIEW" });
      expect(validateReviewText("   \n\t ")).toEqual({ valid: false, reason: "EMPTY_REVIEW" });
    });

    it("rejects reviews shorter than the minimum length", () => {
      expect(validateReviewText("great")).toEqual({ valid: false, reason: "TOO_SHORT" });
      expect(validateReviewText("x".repeat(REVIEW_MIN_CHARS - 1))).toEqual({
        valid: false,
        reason: "TOO_SHORT",
      });
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

    it("accepts a review exactly at the minimum and maximum lengths", () => {
      expect(validateReviewText("x".repeat(REVIEW_MIN_CHARS))).toEqual({
        valid: true,
        reason: null,
      });
      expect(validateReviewText("x".repeat(REVIEW_MAX_CHARS))).toEqual({
        valid: true,
        reason: null,
      });
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

    it("reports no retry delay while submissions remain", () => {
      expect(limiter.check(BUYER_WALLET, 0)).toMatchObject({
        allowed: true,
        remaining: 2,
        retryAfterMs: 0,
      });
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

    it("rejects invalid limiter configuration", () => {
      expect(() => createReviewRateLimiter(0, 60_000)).toThrow();
      expect(() => createReviewRateLimiter(2, 0)).toThrow();
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

    it("trims surrounding whitespace from the submitted review", () => {
      const receipt = submitVerifiedReview({
        wallet: BUYER_WALLET,
        productId: PRODUCT_ID,
        rating: 4,
        text: `   ${validReviewText}   `,
        verifiedTx: successfulTx,
      });
      expect(receipt.text).toBe(validReviewText);
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
      expect(
        isVerifiedPurchase(
          { ...successfulTx, txHash: `0x${"g".repeat(64)}` },
          BUYER_WALLET,
          PRODUCT_ID,
        ),
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

      expect(() =>
        submitVerifiedReview({
          wallet: BUYER_WALLET,
          productId: PRODUCT_ID,
          rating: 0,
          text: validReviewText,
          verifiedTx: successfulTx,
        }),
      ).toThrow("Review blocked: rating must be between 1 and 5.");
    });

    it("rejects a fractional rating", () => {
      expect(() =>
        submitVerifiedReview({
          wallet: BUYER_WALLET,
          productId: PRODUCT_ID,
          rating: 3.5,
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

    it("does not trust a receipt for a different product", () => {
      const badge = buildReceiptVerificationBadge(successfulTx, BUYER_WALLET, "other-product");
      expect(badge.verified).toBe(false);
      expect(badge.label).toBe(UNVERIFIED_LABEL);
    });
  });
});
