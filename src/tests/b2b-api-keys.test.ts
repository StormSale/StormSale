import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import {
  AVAILABLE_SCOPES,
  createApiKey,
  generateSecretKey,
  listApiKeys,
  maskApiKey,
  revokeApiKey,
  validateKeyScope,
} from "../lib/apiKeyManager";
import { ApiKeyManager } from "../components/advertiser/ApiKeyManager";
import type { ApiKeyScope } from "../types/apiKey";

const TEST_WALLET = "GENTERPRISEB2BTESTWALLETADDRESS436";

describe("Enterprise B2B API Key Creation, Scoping, and Secret Reveal (#436)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe("Core Logic & Security Helpers (apiKeyManager.ts)", () => {
    it("generates unmasked secret keys prefixed with sk_live_", () => {
      const secret = generateSecretKey();
      expect(secret.startsWith("sk_live_")).toBe(true);
      expect(secret.length).toBeGreaterThan(20);
    });

    it("masks secret keys strictly in sk_live_...<suffix> format", () => {
      const secret = ["sk", "live", "0123456789abcdef0123456789abcdef4f8a"].join("_");
      const masked = maskApiKey(secret);
      expect(masked).toBe("sk_live_...4f8a");
    });

    it("stores only masked keys in persistent storage and never the plaintext secret", () => {
      const result = createApiKey(TEST_WALLET, {
        name: "CI/CD Pipeline Key",
        scopes: ["campaigns:read", "campaigns:write"],
      });

      expect(result.secretKey.startsWith("sk_live_")).toBe(true);
      expect(result.apiKey.maskedKey).toBe(`sk_live_...${result.secretKey.slice(-4)}`);

      // Verify stored records
      const stored = listApiKeys(TEST_WALLET);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(result.apiKey.id);
      expect(stored[0].name).toBe("CI/CD Pipeline Key");
      expect(stored[0].maskedKey).toBe(result.apiKey.maskedKey);
      expect(stored[0].scopes).toEqual(["campaigns:read", "campaigns:write"]);
      expect(stored[0].status).toBe("active");

      // Verify the plaintext secret was never saved in storage
      const rawStoredString = localStorage.getItem(`b2b_api_keys_${TEST_WALLET}`) || "";
      expect(rawStoredString).not.toContain(result.secretKey);
    });

    it("validates permission scopes on active keys", () => {
      const result = createApiKey(TEST_WALLET, {
        name: "Analytics Service",
        scopes: ["analytics:read", "conversions:read"],
      });

      expect(validateKeyScope(result.apiKey, "analytics:read")).toBe(true);
      expect(validateKeyScope(result.apiKey, "conversions:read")).toBe(true);
      expect(validateKeyScope(result.apiKey, "campaigns:write")).toBe(false);

      // Revoked keys must fail validation for all scopes
      const revoked = revokeApiKey(TEST_WALLET, result.apiKey.id, result.apiKey.name);
      expect(validateKeyScope(revoked, "analytics:read")).toBe(false);
    });

    it("rejects invalid input during key creation", () => {
      expect(() =>
        createApiKey(TEST_WALLET, { name: "", scopes: ["campaigns:read"] }),
      ).toThrowError(/name is required/i);

      expect(() => createApiKey(TEST_WALLET, { name: "Test Key", scopes: [] })).toThrowError(
        /at least one permission scope/i,
      );

      expect(() =>
        createApiKey(TEST_WALLET, {
          name: "Test Key",
          scopes: ["invalid:scope" as ApiKeyScope],
        }),
      ).toThrowError(/invalid permission scope/i);
    });

    it("requires exact key identifier to revoke key", () => {
      const result = createApiKey(TEST_WALLET, {
        name: "Staging Bot",
        scopes: ["campaigns:read"],
      });

      expect(() => revokeApiKey(TEST_WALLET, result.apiKey.id, "Wrong Name")).toThrowError(
        /does not match required key identifier/i,
      );

      const revoked = revokeApiKey(TEST_WALLET, result.apiKey.id, "Staging Bot");
      expect(revoked.status).toBe("revoked");
    });
  });

  describe("AC 1: Permission Scope Checkboxes", () => {
    it("renders all permission scope checkboxes with descriptions", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      // Open create key modal
      fireEvent.click(screen.getByTestId("open-create-key-btn"));

      expect(screen.getByTestId("create-key-modal")).toBeTruthy();

      // Verify each available scope checkbox is present
      AVAILABLE_SCOPES.forEach((scope) => {
        const checkbox = screen.getByTestId(`scope-checkbox-${scope.id}`) as HTMLInputElement;
        expect(checkbox).toBeTruthy();
        expect(screen.getByText(scope.label)).toBeTruthy();
        expect(screen.getByText(scope.description)).toBeTruthy();
      });
    });

    it("allows toggling individual scope checkboxes", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));

      const writeCheckbox = screen.getByTestId(
        "scope-checkbox-campaigns:write",
      ) as HTMLInputElement;
      expect(writeCheckbox.checked).toBe(false);

      fireEvent.click(writeCheckbox);
      expect(writeCheckbox.checked).toBe(true);

      fireEvent.click(writeCheckbox);
      expect(writeCheckbox.checked).toBe(false);
    });

    it("provides Select All and Clear helpers for scope selection", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));

      // Click Select All
      fireEvent.click(screen.getByTestId("select-all-scopes-btn"));
      AVAILABLE_SCOPES.forEach((scope) => {
        const checkbox = screen.getByTestId(`scope-checkbox-${scope.id}`) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
      });

      // Click Clear
      fireEvent.click(screen.getByTestId("clear-all-scopes-btn"));
      AVAILABLE_SCOPES.forEach((scope) => {
        const checkbox = screen.getByTestId(`scope-checkbox-${scope.id}`) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
      });
    });

    it("displays validation error when attempting to submit with no scopes selected", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));

      // Fill in name
      fireEvent.change(screen.getByTestId("api-key-name-input"), {
        target: { value: "My Readonly Key" },
      });

      // Clear all scopes
      fireEvent.click(screen.getByTestId("clear-all-scopes-btn"));

      // Submit
      fireEvent.click(screen.getByTestId("create-key-submit-btn"));

      expect(screen.getByTestId("create-key-error")).toBeTruthy();
      expect(screen.getByText(/select at least one permission scope/i)).toBeTruthy();
      expect(screen.queryByTestId("secret-reveal-modal")).toBeNull();
    });

    it("creates API key with exactly the selected subset of scopes", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));

      fireEvent.change(screen.getByTestId("api-key-name-input"), {
        target: { value: "Custom Scoped Key" },
      });

      // Clear all first, then select campaigns:read and analytics:read
      fireEvent.click(screen.getByTestId("clear-all-scopes-btn"));
      fireEvent.click(screen.getByTestId("scope-checkbox-campaigns:read"));
      fireEvent.click(screen.getByTestId("scope-checkbox-analytics:read"));

      fireEvent.click(screen.getByTestId("create-key-submit-btn"));

      // Reveal modal appears
      expect(screen.getByTestId("secret-reveal-modal")).toBeTruthy();

      // Close modal
      fireEvent.click(screen.getByTestId("close-secret-modal-btn"));

      // Check stored key scopes
      const keys = listApiKeys(TEST_WALLET);
      expect(keys[0].scopes).toEqual(["campaigns:read", "analytics:read"]);
    });
  });

  describe("AC 2: One-Time Secret Key Modal Reveal & Security Warning", () => {
    it("presents the secret key in a modal immediately upon creation", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));

      fireEvent.change(screen.getByTestId("api-key-name-input"), {
        target: { value: "Automated Deployer" },
      });
      fireEvent.click(screen.getByTestId("create-key-submit-btn"));

      const modal = screen.getByTestId("secret-reveal-modal");
      expect(modal).toBeTruthy();

      const secretInput = screen.getByTestId("full-secret-key-display") as HTMLInputElement;
      expect(secretInput.value).toMatch(/^sk_live_[a-f0-9]{32}$/);
    });

    it("displays prominent security warning that the secret will never be shown again", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));

      fireEvent.change(screen.getByTestId("api-key-name-input"), {
        target: { value: "SecOps Service Key" },
      });
      fireEvent.click(screen.getByTestId("create-key-submit-btn"));

      const warningBox = screen.getByTestId("secret-warning-banner");
      expect(warningBox).toBeTruthy();
      expect(warningBox.textContent).toMatch(/never be shown again/i);
      expect(warningBox.textContent).toMatch(/important security warning/i);
    });

    it("provides a functional copy-to-clipboard button with visual feedback", async () => {
      // Mock clipboard API
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));
      fireEvent.change(screen.getByTestId("api-key-name-input"), {
        target: { value: "Clipboard Test Key" },
      });
      fireEvent.click(screen.getByTestId("create-key-submit-btn"));

      const secretInput = screen.getByTestId("full-secret-key-display") as HTMLInputElement;
      const secret = secretInput.value;

      const copyBtn = screen.getByTestId("copy-secret-key-btn");
      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalledWith(secret);
      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeTruthy();
      });
    });

    it("purges secret key from DOM and state when dismissing the modal", () => {
      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));
      fireEvent.click(screen.getByTestId("open-create-key-btn"));
      fireEvent.change(screen.getByTestId("api-key-name-input"), {
        target: { value: "Purge Test Key" },
      });
      fireEvent.click(screen.getByTestId("create-key-submit-btn"));

      const secretInput = screen.getByTestId("full-secret-key-display") as HTMLInputElement;
      const secretValue = secretInput.value;

      // Close modal
      fireEvent.click(screen.getByTestId("close-secret-modal-btn"));

      // Modal is unmounted
      expect(screen.queryByTestId("secret-reveal-modal")).toBeNull();

      // Plaintext secret is nowhere in the document
      expect(screen.queryByText(secretValue)).toBeNull();
      expect(document.body.innerHTML).not.toContain(secretValue);
    });
  });

  describe("AC 3: Key Masking in Subsequent List Views", () => {
    it("renders masked key format sk_live_...4f8a in table rows", () => {
      // Seed pre-existing keys directly
      createApiKey(TEST_WALLET, {
        name: "Production Worker",
        scopes: ["campaigns:read", "analytics:read"],
      });
      createApiKey(TEST_WALLET, {
        name: "Webhook Consumer",
        scopes: ["conversions:read"],
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      const table = screen.getByTestId("api-keys-table");
      expect(table).toBeTruthy();

      const storedKeys = listApiKeys(TEST_WALLET);
      expect(storedKeys).toHaveLength(2);

      storedKeys.forEach((key) => {
        const maskedElement = screen.getByTestId(`masked-key-${key.id}`);
        expect(maskedElement.textContent).toBe(key.maskedKey);
        expect(maskedElement.textContent).toMatch(/^sk_live_\.\.\.[a-f0-9]{4}$/);

        // Name, scopes, and status
        expect(screen.getByTestId(`key-name-${key.id}`).textContent).toContain(key.name);
        expect(screen.getByTestId(`key-status-${key.id}`).textContent).toContain("ACTIVE");
      });
    });

    it("never leaks raw secrets into the DOM in table views", () => {
      const { secretKey } = createApiKey(TEST_WALLET, {
        name: "Leaking Guard Key",
        scopes: ["campaigns:read"],
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      // Plaintext secret is not present anywhere in HTML
      expect(document.body.innerHTML).not.toContain(secretKey);
      // But masked representation is present
      const suffix = secretKey.slice(-4);
      expect(document.body.innerHTML).toContain(`sk_live_...${suffix}`);
    });

    it("displays assigned scope badges for each key in list", () => {
      createApiKey(TEST_WALLET, {
        name: "Multi-Scope Robot",
        scopes: ["campaigns:read", "campaigns:write", "escrow:read"],
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      expect(screen.getByTestId("scope-badge-campaigns:read")).toBeTruthy();
      expect(screen.getByTestId("scope-badge-campaigns:write")).toBeTruthy();
      expect(screen.getByTestId("scope-badge-escrow:read")).toBeTruthy();
    });
  });

  describe("AC 4: Revocation Confirmation Dialog Requiring Explicit Key Identifier Input", () => {
    it("opens revocation dialog when clicking Revoke button", () => {
      const { apiKey } = createApiKey(TEST_WALLET, {
        name: "Temp Testing Key",
        scopes: ["campaigns:read"],
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      const revokeBtn = screen.getByTestId(`revoke-key-btn-${apiKey.id}`);
      fireEvent.click(revokeBtn);

      expect(screen.getByTestId("revoke-confirmation-dialog")).toBeTruthy();
      expect(screen.getByTestId("revoke-warning-box")).toBeTruthy();
      expect(screen.getByTestId("revoke-confirmation-dialog").textContent).toContain(apiKey.name);
    });

    it("keeps Revoke Key button strictly disabled until exact key name is entered", () => {
      const { apiKey } = createApiKey(TEST_WALLET, {
        name: "Security Critical Key",
        scopes: ["campaigns:write"],
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      fireEvent.click(screen.getByTestId(`revoke-key-btn-${apiKey.id}`));

      const confirmBtn = screen.getByTestId("confirm-revoke-btn") as HTMLButtonElement;
      const input = screen.getByTestId("revoke-confirm-input") as HTMLInputElement;

      // Initially empty -> disabled
      expect(confirmBtn.disabled).toBe(true);

      // Typing wrong text -> remains disabled
      fireEvent.change(input, { target: { value: "Security" } });
      expect(confirmBtn.disabled).toBe(true);

      fireEvent.change(input, { target: { value: "Security Critical" } });
      expect(confirmBtn.disabled).toBe(true);

      // Typing exact matching name -> enabled
      fireEvent.change(input, { target: { value: apiKey.name } });
      expect(confirmBtn.disabled).toBe(false);

      // Typing trailing typo -> disabled again
      fireEvent.change(input, { target: { value: `${apiKey.name} extra` } });
      expect(confirmBtn.disabled).toBe(true);
    });

    it("successfully revokes key upon explicit confirmation and updates table status", () => {
      const { apiKey } = createApiKey(TEST_WALLET, {
        name: "Deprecate Me",
        scopes: ["campaigns:read"],
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      fireEvent.click(screen.getByTestId(`revoke-key-btn-${apiKey.id}`));

      const input = screen.getByTestId("revoke-confirm-input");
      fireEvent.change(input, { target: { value: "Deprecate Me" } });

      const confirmBtn = screen.getByTestId("confirm-revoke-btn");
      fireEvent.click(confirmBtn);

      // Dialog is dismissed
      expect(screen.queryByTestId("revoke-confirmation-dialog")).toBeNull();

      // Key status updated to REVOKED in table
      const statusElement = screen.getByTestId(`key-status-${apiKey.id}`);
      expect(statusElement.textContent).toContain("REVOKED");

      // Revoke action button is removed / replaced with Revoked label
      expect(screen.queryByTestId(`revoke-key-btn-${apiKey.id}`)).toBeNull();

      // Verified in storage
      const keys = listApiKeys(TEST_WALLET);
      expect(keys[0].status).toBe("revoked");
    });

    it("allows canceling revocation without modifying key status", () => {
      const { apiKey } = createApiKey(TEST_WALLET, {
        name: "Keep Me Active",
        scopes: ["campaigns:read"],
      });

      render(createElement(ApiKeyManager, { walletAddress: TEST_WALLET }));

      fireEvent.click(screen.getByTestId(`revoke-key-btn-${apiKey.id}`));
      expect(screen.getByTestId("revoke-confirmation-dialog")).toBeTruthy();

      // Click cancel
      fireEvent.click(screen.getByTestId("cancel-revoke-btn"));

      expect(screen.queryByTestId("revoke-confirmation-dialog")).toBeNull();
      expect(screen.getByTestId(`key-status-${apiKey.id}`).textContent).toContain("ACTIVE");

      const keys = listApiKeys(TEST_WALLET);
      expect(keys[0].status).toBe("active");
    });
  });
});
