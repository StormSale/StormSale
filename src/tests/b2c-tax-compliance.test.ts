// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ClaimPayouts } from "../components/affiliate/ClaimPayouts";
import { NotificationProvider } from "../context/NotificationContext";
import {
  BACKUP_WITHHOLDING_RATE_PCT,
  TAX_FORM_THRESHOLD_USD,
  buildTaxStatus,
  computeWithholding,
  formTypeForCountry,
  hasCrossedTaxThreshold,
  isTaxFormRequired,
  loadTaxStatus,
  resolveWithholdingPct,
  saveTaxStatus,
  validateTaxForm,
} from "../lib/taxCompliance";

const WALLET = "GTAXCOMPLIANCE_TEST_WALLET_1234567890";

const mockWeb3 = {
  userAddress: WALLET,
  isConnected: true,
  claimPayoutOnChain: vi.fn().mockResolvedValue({ txHash: "0xsingle" }),
  batchClaimPayoutsOnChain: vi.fn().mockResolvedValue({
    txHash: "0xbatch",
    totalClaimedXlm: 155.75,
    itemizedClaims: [],
  }),
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3,
  useSafeWeb3: () => mockWeb3,
}));

const renderClaims = (cumulativeEarningsUsd?: number) =>
  render(
    createElement(
      NotificationProvider,
      null,
      createElement(ClaimPayouts, { cumulativeEarningsUsd }),
    ),
  );

const fillForm = (opts: { country?: string; name?: string; sign?: boolean }) => {
  if (opts.country !== undefined) {
    fireEvent.change(screen.getByTestId("tax-country-select"), {
      target: { value: opts.country },
    });
  }
  if (opts.name !== undefined) {
    fireEvent.change(screen.getByTestId("tax-signature-name"), { target: { value: opts.name } });
  }
  if (opts.sign) fireEvent.click(screen.getByTestId("tax-signature-checkbox"));
};

describe("B2C affiliate tax compliance (#457)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  describe("threshold logic", () => {
    it("does not cross the threshold below $600", () => {
      expect(hasCrossedTaxThreshold(TAX_FORM_THRESHOLD_USD - 0.01)).toBe(false);
      expect(isTaxFormRequired(599.99, null)).toBe(false);
    });

    it("crosses the threshold at exactly $600 and above", () => {
      expect(hasCrossedTaxThreshold(600)).toBe(true);
      expect(isTaxFormRequired(600, null)).toBe(true);
      expect(isTaxFormRequired(12_000, null)).toBe(true);
    });

    it("ignores non-finite earnings", () => {
      expect(hasCrossedTaxThreshold(NaN)).toBe(false);
      expect(hasCrossedTaxThreshold(Infinity)).toBe(false);
    });

    it("no longer requires a form once status is on file", () => {
      const status = buildTaxStatus({
        countryCode: "US",
        signatureName: "Ada Lovelace",
        signatureAccepted: true,
      });
      expect(isTaxFormRequired(5_000, status)).toBe(false);
    });
  });

  describe("form validation (country + signature)", () => {
    it("rejects an empty form with all three errors", () => {
      const errors = validateTaxForm({
        countryCode: "",
        signatureName: "",
        signatureAccepted: false,
      });
      expect(Object.keys(errors).sort()).toEqual([
        "countryCode",
        "signatureAccepted",
        "signatureName",
      ]);
    });

    it("rejects an unknown country code", () => {
      const errors = validateTaxForm({
        countryCode: "ZZ",
        signatureName: "Ada Lovelace",
        signatureAccepted: true,
      });
      expect(errors.countryCode).toBeTruthy();
    });

    it("rejects an unchecked signature box and a whitespace-only name", () => {
      const errors = validateTaxForm({
        countryCode: "GB",
        signatureName: "   ",
        signatureAccepted: false,
      });
      expect(errors.signatureAccepted).toBeTruthy();
      expect(errors.signatureName).toBeTruthy();
      expect(errors.countryCode).toBeUndefined();
    });

    it("accepts a complete form", () => {
      expect(
        validateTaxForm({ countryCode: "GB", signatureName: "Ada", signatureAccepted: true }),
      ).toEqual({});
    });

    it("buildTaxStatus throws on invalid input", () => {
      expect(() =>
        buildTaxStatus({ countryCode: "", signatureName: "", signatureAccepted: false }),
      ).toThrow();
    });

    it("maps US to W-9 and every other country to W-8BEN", () => {
      expect(formTypeForCountry("US")).toBe("W-9");
      expect(formTypeForCountry("NG")).toBe("W-8BEN");
      expect(formTypeForCountry("GB")).toBe("W-8BEN");
    });
  });

  describe("withholding math", () => {
    it("is 0% below the threshold with no form", () => {
      expect(resolveWithholdingPct(100, null)).toBe(0);
    });

    it("applies backup withholding above the threshold with no form", () => {
      expect(resolveWithholdingPct(900, null)).toBe(BACKUP_WITHHOLDING_RATE_PCT);
    });

    it("uses the declared country rate once a form is on file", () => {
      const us = buildTaxStatus({
        countryCode: "US",
        signatureName: "A B",
        signatureAccepted: true,
      });
      const ng = buildTaxStatus({
        countryCode: "NG",
        signatureName: "A B",
        signatureAccepted: true,
      });
      expect(resolveWithholdingPct(900, us)).toBe(0);
      expect(resolveWithholdingPct(900, ng)).toBe(30);
    });

    it("computes withheld and net amounts", () => {
      expect(computeWithholding(100, 24)).toEqual({ withheldXlm: 24, netXlm: 76 });
      expect(computeWithholding(155.75, 24)).toEqual({ withheldXlm: 37.38, netXlm: 118.37 });
      expect(computeWithholding(50, 0)).toEqual({ withheldXlm: 0, netXlm: 50 });
    });
  });

  describe("persistence", () => {
    it("round-trips a status per wallet", () => {
      const status = buildTaxStatus({
        countryCode: "IN",
        signatureName: "Ada",
        signatureAccepted: true,
      });
      saveTaxStatus(WALLET, status);
      expect(loadTaxStatus(WALLET)).toEqual(status);
      expect(loadTaxStatus("GOTHERWALLET")).toBeNull();
    });

    it("returns null for corrupt storage", () => {
      localStorage.setItem(`stormsale:tax-status:${WALLET}`, "{not json");
      expect(loadTaxStatus(WALLET)).toBeNull();
    });
  });

  describe("modal prompt trigger", () => {
    it("does not prompt below the threshold", async () => {
      renderClaims(599);
      await waitFor(() => expect(screen.getByTestId("btn-batch-claim")).toBeTruthy());
      expect(screen.queryByTestId("tax-form-modal")).toBeNull();
      expect(screen.queryByTestId("tax-status-banner-required")).toBeNull();
      expect(screen.queryByTestId("withholding-summary")).toBeNull();
    });

    it("prompts when earnings cross the threshold", async () => {
      renderClaims(750);
      expect(await screen.findByTestId("tax-form-modal")).toBeTruthy();
      expect(screen.getByTestId("tax-status-banner-required")).toBeTruthy();
    });

    it("does not re-prompt after dismissal but keeps the banner CTA", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");
      fireEvent.click(screen.getByTestId("tax-form-close"));
      expect(screen.queryByTestId("tax-form-modal")).toBeNull();

      fireEvent.click(screen.getByTestId("btn-open-tax-form"));
      expect(screen.getByTestId("tax-form-modal")).toBeTruthy();
    });

    it("does not prompt when a form is already on file", async () => {
      saveTaxStatus(
        WALLET,
        buildTaxStatus({ countryCode: "US", signatureName: "Ada", signatureAccepted: true }),
      );
      renderClaims(750);
      await waitFor(() => expect(screen.getByTestId("btn-batch-claim")).toBeTruthy());
      expect(screen.queryByTestId("tax-form-modal")).toBeNull();
    });
  });

  describe("tax country selection and digital signature", () => {
    it("blocks submit and shows errors for an empty form", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");
      fireEvent.click(screen.getByTestId("tax-form-submit"));

      expect(screen.getByTestId("tax-error-country")).toBeTruthy();
      expect(screen.getByTestId("tax-error-name")).toBeTruthy();
      expect(screen.getByTestId("tax-error-signature")).toBeTruthy();
      expect(screen.getByTestId("tax-form-modal")).toBeTruthy();
      expect(loadTaxStatus(WALLET)).toBeNull();
    });

    it("requires the signature checkbox even with country and name filled", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");
      fillForm({ country: "GB", name: "Ada Lovelace" });
      fireEvent.click(screen.getByTestId("tax-form-submit"));

      expect(screen.getByTestId("tax-error-signature")).toBeTruthy();
      expect(screen.queryByTestId("tax-error-country")).toBeNull();
      expect(loadTaxStatus(WALLET)).toBeNull();
    });

    it("shows the form type and rate for the selected country", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");

      fillForm({ country: "US" });
      expect(screen.getByTestId("tax-form-type").textContent).toMatch(/W-9/);
      expect(screen.getByTestId("tax-form-type").textContent).toMatch(/0%/);

      fillForm({ country: "NG" });
      expect(screen.getByTestId("tax-form-type").textContent).toMatch(/W-8BEN/);
      expect(screen.getByTestId("tax-form-type").textContent).toMatch(/30%/);
    });

    it("toggles the signature checkbox", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");
      const box = screen.getByTestId("tax-signature-checkbox") as HTMLInputElement;
      expect(box.checked).toBe(false);
      fireEvent.click(box);
      expect(box.checked).toBe(true);
    });
  });

  describe("submission and status confirmation banner", () => {
    it("submits a W-8BEN, closes the modal, persists and shows the confirmation banner", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");
      fillForm({ country: "NG", name: "Ada Lovelace", sign: true });
      fireEvent.click(screen.getByTestId("tax-form-submit"));

      await waitFor(() => expect(screen.queryByTestId("tax-form-modal")).toBeNull());
      const banner = screen.getByTestId("tax-status-banner-confirmed");
      expect(banner.textContent).toMatch(/W-8BEN/);
      expect(banner.textContent).toMatch(/30%/);
      expect(screen.queryByTestId("tax-status-banner-required")).toBeNull();

      const saved = loadTaxStatus(WALLET);
      expect(saved?.formType).toBe("W-8BEN");
      expect(saved?.countryCode).toBe("NG");
      expect(saved?.signatureName).toBe("Ada Lovelace");
    });

    it("submits a W-9 for a US person with 0% withholding", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");
      fillForm({ country: "US", name: "Grace Hopper", sign: true });
      fireEvent.click(screen.getByTestId("tax-form-submit"));

      const banner = await screen.findByTestId("tax-status-banner-confirmed");
      expect(banner.textContent).toMatch(/W-9/);
      expect(banner.textContent).toMatch(/0%/);
      expect(screen.queryByTestId("withholding-summary")).toBeNull();
    });

    it("shows the confirmation banner on a later visit without re-prompting", async () => {
      saveTaxStatus(
        WALLET,
        buildTaxStatus({ countryCode: "GB", signatureName: "Ada", signatureAccepted: true }),
      );
      renderClaims(750);
      expect(await screen.findByTestId("tax-status-banner-confirmed")).toBeTruthy();
      expect(screen.queryByTestId("tax-form-modal")).toBeNull();
    });
  });

  describe("withholding display in the claim panel", () => {
    it("shows backup withholding before a form is submitted", async () => {
      renderClaims(750);
      await waitFor(() => expect(screen.getByTestId("withholding-pct")).toBeTruthy());
      expect(screen.getByTestId("withholding-pct").textContent).toMatch(/24%/);
      // 3 matured mock campaigns: 45.5 + 78 + 32.25 = 155.75 XLM
      expect(screen.getByTestId("withholding-net").textContent).toMatch(/37\.38 XLM/);
      expect(screen.getByTestId("withholding-net").textContent).toMatch(/118\.37 XLM/);
    });

    it("updates to the declared rate after submission", async () => {
      renderClaims(750);
      await screen.findByTestId("tax-form-modal");
      fillForm({ country: "IN", name: "Ada Lovelace", sign: true });
      fireEvent.click(screen.getByTestId("tax-form-submit"));

      await waitFor(() => expect(screen.getByTestId("withholding-pct").textContent).toMatch(/15%/));
      expect(screen.getByTestId("withholding-net").textContent).toMatch(/23\.36 XLM/);
      expect(screen.getByTestId("withholding-net").textContent).toMatch(/132\.39 XLM/);
    });

    it("hides withholding when earnings are below the threshold", async () => {
      renderClaims(100);
      await waitFor(() => expect(screen.getByTestId("btn-batch-claim")).toBeTruthy());
      expect(screen.queryByTestId("withholding-summary")).toBeNull();
    });
  });
});
