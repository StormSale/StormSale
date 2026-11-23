// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  zeroize,
  withZeroization,
  withZeroizationAsync,
  containsSensitiveData,
  auditStorageForSensitiveData,
  assertNoSensitiveDataStored,
  copySensitiveToClipboard,
} from "../lib/zeroization";
import { setEncryptedItem, getEncryptedItem, purgeOnLogout } from "../lib/storage";

describe("data-zeroization test suite (Issue #510)", () => {
  describe("1. Zeroization function overwriting typed arrays (Uint8Array.fill(0))", () => {
    it("overwrites non-zero Uint8Array with zeros using Uint8Array.fill(0)", () => {
      const sensitiveKey = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03]);
      expect(sensitiveKey.some((b) => b !== 0)).toBe(true);

      const result = zeroize(sensitiveKey);
      expect(result).toBe(true);
      expect(sensitiveKey.every((b) => b === 0)).toBe(true);
      expect(sensitiveKey.length).toBe(7);
    });

    it("zeros raw ArrayBuffer instances", () => {
      const buffer = new ArrayBuffer(16);
      const view = new Uint8Array(buffer);
      view.fill(0xaa);
      expect(view[0]).toBe(0xaa);

      zeroize(buffer);
      expect(view.every((b) => b === 0)).toBe(true);
    });

    it("zeros various typed array variants and DataView", () => {
      const int16 = new Int16Array([100, -200, 300, -400]);
      zeroize(int16);
      expect(int16.every((v) => v === 0)).toBe(true);

      const float64 = new Float64Array([1.23, 4.56, 7.89]);
      zeroize(float64);
      expect(float64.every((v) => v === 0)).toBe(true);

      const dataBuf = new ArrayBuffer(8);
      const dv = new DataView(dataBuf);
      dv.setUint32(0, 0x12345678);
      zeroize(dv);
      expect(dv.getUint32(0)).toBe(0);
    });

    it("gracefully handles null and undefined inputs", () => {
      expect(zeroize(null)).toBe(false);
      expect(zeroize(undefined)).toBe(false);
    });

    it("withZeroization guarantees memory wipe on successful completion", () => {
      const ephemeralSeed = new Uint8Array(32);
      ephemeralSeed.fill(0x55);

      const derivedHash = withZeroization(ephemeralSeed, (buf) => {
        expect(buf[0]).toBe(0x55);
        return buf.reduce((acc, val) => acc + val, 0);
      });

      expect(derivedHash).toBe(32 * 0x55);
      // Ephemeral seed should be wiped to 0
      expect(ephemeralSeed.every((b) => b === 0)).toBe(true);
    });

    it("withZeroization guarantees memory wipe even if an exception is thrown", () => {
      const ephemeralKey = new Uint8Array(16);
      ephemeralKey.fill(0xff);

      expect(() => {
        withZeroization(ephemeralKey, () => {
          throw new Error("Task failed prematurely");
        });
      }).toThrow("Task failed prematurely");

      // Memory must be zeroized despite the error
      expect(ephemeralKey.every((b) => b === 0)).toBe(true);
    });

    it("withZeroizationAsync wipes memory on async completion and async rejection", async () => {
      const asyncBuffer = new Uint8Array(16);
      asyncBuffer.fill(0x77);

      const result = await withZeroizationAsync(asyncBuffer, async (buf) => {
        await Promise.resolve();
        return buf[0] * 2;
      });
      expect(result).toBe(0x77 * 2);
      expect(asyncBuffer.every((b) => b === 0)).toBe(true);

      const rejectBuffer = new Uint8Array(16);
      rejectBuffer.fill(0x88);

      await expect(
        withZeroizationAsync(rejectBuffer, async () => {
          await Promise.resolve();
          throw new Error("Async failure");
        }),
      ).rejects.toThrow("Async failure");

      expect(rejectBuffer.every((b) => b === 0)).toBe(true);
    });
  });

  describe("2. Verify no private key, seed, or mnemonic is ever written to localStorage or sessionStorage", () => {
    beforeEach(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    it("detects Stellar secret keys starting with S and 56 alphanumeric chars", () => {
      // Generated dynamically to prevent static security scanners (Gitleaks) from flagging test fixtures
      const fakeSecretKey = "S" + "B".repeat(55);
      expect(containsSensitiveData(fakeSecretKey)).toBe(true);
      expect(containsSensitiveData("G" + "A".repeat(55))).toBe(false); // Public key starts with G
    });

    it("detects 12-word and 24-word BIP-39 mnemonic phrases", () => {
      const twelveWords =
        "apple banana cherry date elderberry fig grape honeydew kiwi lemon mango nectarine";
      expect(containsSensitiveData(twelveWords)).toBe(true);

      const normalSentence = "Just a short text";
      expect(containsSensitiveData(normalSentence)).toBe(false);
    });

    it("detects JSON payloads containing privateKey or secretSeed", () => {
      const jsonSecret = JSON.stringify({ privateKey: "unencrypted_key_value" });
      expect(containsSensitiveData(jsonSecret)).toBe(true);

      const safeJson = JSON.stringify({ theme: "dark", locale: "en-US" });
      expect(containsSensitiveData(safeJson)).toBe(false);
    });

    it("audits storage and flags any stored sensitive keys or values", () => {
      localStorage.setItem("user_theme", "dark");
      localStorage.setItem("app_version", "1.1.1");
      expect(auditStorageForSensitiveData(localStorage).clean).toBe(true);

      localStorage.setItem("backup_seed", "S" + "B".repeat(55));
      const audit = auditStorageForSensitiveData(localStorage);
      expect(audit.clean).toBe(false);
      expect(audit.violations.length).toBeGreaterThan(0);
    });

    it("assertNoSensitiveDataStored throws when sensitive credentials are present in localStorage or sessionStorage", () => {
      localStorage.setItem("safe_entry", "valid_data");
      expect(() => assertNoSensitiveDataStored()).not.toThrow();

      sessionStorage.setItem(
        "leaked_mnemonic",
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      );

      expect(() => assertNoSensitiveDataStored()).toThrow(
        /Sensitive data storage violation in sessionStorage/,
      );
    });

    it("confirms encrypted storage layer (storage.ts) never stores raw private keys or seeds in localStorage", async () => {
      const testKey = "user_preferences";
      const payload = { highValueCampaign: "escrow_992", autoApprove: false };

      await setEncryptedItem(testKey, payload);

      // Verify what was stored in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const storedKey = localStorage.key(i)!;
        const storedVal = localStorage.getItem(storedKey)!;

        // Raw key name must NOT be stored in plaintext
        expect(storedKey).not.toBe(testKey);
        // Sensitive patterns must NOT be present
        expect(containsSensitiveData(storedKey)).toBe(false);
        expect(containsSensitiveData(storedVal)).toBe(false);
      }

      const retrieved = await getEncryptedItem(testKey);
      expect(retrieved).toEqual(payload);

      expect(() => assertNoSensitiveDataStored()).not.toThrow();
      await purgeOnLogout();
    });
  });

  describe("3. Test clipboard clearance helper erasing sensitive copied tokens after 60 seconds", () => {
    let originalClipboard: Clipboard;
    let writeTextMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      originalClipboard = navigator.clipboard;
      writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: writeTextMock,
          readText: vi.fn(),
        },
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
        writable: true,
      });
    });

    it("copies sensitive token to clipboard and erases it after exactly 60 seconds", async () => {
      const sensitiveToken = "token_sec_999888777666555";
      await copySensitiveToClipboard(sensitiveToken);

      // Immediately written to clipboard
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenLastCalledWith(sensitiveToken);

      // After 30 seconds, clipboard must NOT be erased yet
      vi.advanceTimersByTime(30_000);
      expect(writeTextMock).toHaveBeenCalledTimes(1);

      // After 60 seconds total (another 30 seconds), clipboard must be cleared with empty string
      vi.advanceTimersByTime(30_000);
      expect(writeTextMock).toHaveBeenCalledTimes(2);
      expect(writeTextMock).toHaveBeenLastCalledWith("");
    });

    it("allows manual early clearance and prevents double clearance", async () => {
      const sensitiveToken = "token_immediate_wipe";
      const handle = await copySensitiveToClipboard(sensitiveToken, 60_000);

      expect(writeTextMock).toHaveBeenCalledWith(sensitiveToken);

      // Manually trigger early wipe after 10 seconds
      vi.advanceTimersByTime(10_000);
      await handle.clear();

      expect(writeTextMock).toHaveBeenCalledWith("");
      expect(writeTextMock).toHaveBeenCalledTimes(2);

      // Advancing past 60s should not trigger another wipe
      vi.advanceTimersByTime(60_000);
      expect(writeTextMock).toHaveBeenCalledTimes(2);
    });

    it("allows canceling scheduled clearance without clearing", async () => {
      const sensitiveToken = "token_persistent_keep";
      const handle = await copySensitiveToClipboard(sensitiveToken, 60_000);

      expect(writeTextMock).toHaveBeenCalledWith(sensitiveToken);

      // Cancel the scheduled clearance
      handle.cancel();

      // Advancing time should not clear
      vi.advanceTimersByTime(120_000);
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
  });
});
