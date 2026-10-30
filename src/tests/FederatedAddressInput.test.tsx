import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { Keypair } from "@stellar/stellar-sdk";
import {
  FederatedAddressInput,
  deriveDisplayState,
  scheduleFederationLookup,
  type FederationOutcome,
} from "../components/shared/FederatedAddressInput";
import type { FederatedAddressRecord } from "../lib/stellar";

const VALID_PUBLIC_KEY = Keypair.random().publicKey();
const CONTRACT_ID = "C" + "A".repeat(55);

const federatedOutcome = (
  key: string,
  overrides: Partial<Extract<FederationOutcome, { status: "federated" }>> = {},
): FederationOutcome => ({
  key,
  status: "federated",
  address: VALID_PUBLIC_KEY,
  federatedAddress: key,
  ...overrides,
});

describe("[Web3] FederatedAddressInput resolution states (#126)", () => {
  describe("deriveDisplayState", () => {
    it("stays idle for empty input", () => {
      expect(deriveDisplayState("", null)).toEqual({ status: "idle" });
      expect(deriveDisplayState("   ", null)).toEqual({ status: "idle" });
    });

    it("emits raw for a valid ed25519 public key", () => {
      expect(deriveDisplayState(VALID_PUBLIC_KEY, null)).toEqual({
        status: "raw",
        address: VALID_PUBLIC_KEY,
      });
    });

    it("rejects contract ids and malformed keys instead of treating them as raw", () => {
      expect(deriveDisplayState(CONTRACT_ID, null).status).toBe("invalid");
      expect(deriveDisplayState("GAUDITOR...", null).status).toBe("invalid");
      expect(deriveDisplayState("alice", null).status).toBe("invalid");
    });

    it("is resolving (resolution null) while a federation lookup is pending", () => {
      expect(deriveDisplayState("alice*stormsale.io", null)).toEqual({ status: "resolving" });
    });

    it("ignores a stale outcome after fast retyping", () => {
      const stale = federatedOutcome("alice*stormsale.io");

      // The user has already typed a different address, so the previous result
      // must not be applied to the current text.
      expect(deriveDisplayState("bob*stormsale.io", stale)).toEqual({ status: "resolving" });
      expect(deriveDisplayState(VALID_PUBLIC_KEY, stale).status).toBe("raw");
    });

    it("emits federated with the resolved key and memo", () => {
      const state = deriveDisplayState(
        "alice*stormsale.io",
        federatedOutcome("alice*stormsale.io", { memoType: "id", memo: "1001" }),
      );

      expect(state).toEqual({
        status: "federated",
        address: VALID_PUBLIC_KEY,
        federatedAddress: "alice*stormsale.io",
        memoType: "id",
        memo: "1001",
      });
    });

    it("emits unresolved with the lookup failure message", () => {
      expect(
        deriveDisplayState("alice*stormsale.io", {
          key: "alice*stormsale.io",
          status: "unresolved",
          message: "Federation server responded with HTTP 503",
        }),
      ).toEqual({
        status: "unresolved",
        message: "Federation server responded with HTTP 503",
      });
    });
  });

  describe("scheduleFederationLookup", () => {
    const key = "alice*stormsale.io";
    const record: FederatedAddressRecord = {
      federatedAddress: key,
      accountId: VALID_PUBLIC_KEY,
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("waits for the debounce window, then emits the federated outcome", async () => {
      const resolve = vi.fn().mockResolvedValue(record);
      const onResult = vi.fn();
      scheduleFederationLookup(key, resolve, onResult, 450);

      await vi.advanceTimersByTimeAsync(449);
      expect(resolve).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(resolve).toHaveBeenCalledWith(key);
      expect(onResult).toHaveBeenCalledWith({
        key,
        status: "federated",
        address: VALID_PUBLIC_KEY,
        federatedAddress: key,
        memoType: undefined,
        memo: undefined,
      });
    });

    it("emits an unresolved outcome when the lookup fails", async () => {
      const resolve = vi.fn().mockRejectedValue(new Error("Network error"));
      const onResult = vi.fn();
      scheduleFederationLookup(key, resolve, onResult, 450);

      await vi.advanceTimersByTimeAsync(450);
      expect(onResult).toHaveBeenCalledWith({
        key,
        status: "unresolved",
        message: "Network error",
      });
    });

    it("drops a stale result when the value is retyped before it settles", async () => {
      const onResult = vi.fn();
      let release!: (value: FederatedAddressRecord) => void;
      const resolve = vi.fn(
        () =>
          new Promise<FederatedAddressRecord>((res) => {
            release = res;
          }),
      );

      const cancel = scheduleFederationLookup(key, resolve, onResult, 450);
      await vi.advanceTimersByTimeAsync(450);
      expect(resolve).toHaveBeenCalledTimes(1);

      // The user retyped, so the effect cleanup cancels this lookup mid-flight.
      cancel();
      release(record);
      await Promise.resolve();

      expect(onResult).not.toHaveBeenCalled();
    });

    it("only looks up the latest value while retyping quickly", async () => {
      const resolve = vi.fn().mockResolvedValue(record);
      const onResult = vi.fn();

      const cancelFirst = scheduleFederationLookup("first*stormsale.io", resolve, onResult, 450);
      await vi.advanceTimersByTimeAsync(100);
      cancelFirst();
      scheduleFederationLookup("second*stormsale.io", resolve, onResult, 450);
      await vi.advanceTimersByTimeAsync(450);

      expect(resolve).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith("second*stormsale.io");
    });
  });

  describe("rendered status message", () => {
    const render = (value: string) =>
      renderToString(<FederatedAddressInput value={value} onChange={vi.fn()} />);

    it("shows the verified state for a raw public key", () => {
      expect(render(VALID_PUBLIC_KEY)).toContain("Verified Stellar public key");
    });

    it("shows a resolving state for a federation address", () => {
      expect(render("alice*stormsale.io")).toContain("Resolving federation address");
    });

    it("shows validation feedback for an invalid address", () => {
      expect(render(CONTRACT_ID)).toContain("Enter a valid G... public key");
    });

    it("announces status changes through a polite live region", () => {
      const html = render(VALID_PUBLIC_KEY);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
    });
  });
});
