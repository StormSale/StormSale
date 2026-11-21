// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  isCountrySanctioned,
  checkJurisdictionCompliance,
  setReadOnlyAuditMode,
  isReadOnlyAuditMode,
  OFAC_SANCTIONED_COUNTRIES,
  REGULATORY_DISCLOSURE_TEXT,
} from "../lib/geoFencing";
import { RestrictedJurisdictionModal } from "../components/shared/RestrictedJurisdictionModal";

describe("IP Geo-Fencing Compliance & Restricted Jurisdiction Modal Suite (#476)", () => {
  beforeEach(() => {
    setReadOnlyAuditMode(false);
    vi.restoreAllMocks();
  });

  describe("1. OFAC Sanctioned Jurisdiction Screening & Modal Triggering", () => {
    it("correctly flags all comprehensive OFAC sanctioned country codes (CU, IR, KP, SY, RU, BY, MM, VE)", () => {
      const sanctionedCodes = Object.keys(OFAC_SANCTIONED_COUNTRIES);
      expect(sanctionedCodes.length).toBeGreaterThanOrEqual(8);

      for (const code of sanctionedCodes) {
        expect(isCountrySanctioned(code)).toBe(true);
        expect(isCountrySanctioned(code.toLowerCase())).toBe(true); // Case-insensitive
      }

      // Non-sanctioned jurisdictions must be clear
      expect(isCountrySanctioned("US")).toBe(false);
      expect(isCountrySanctioned("GB")).toBe(false);
      expect(isCountrySanctioned("DE")).toBe(false);
      expect(isCountrySanctioned("JP")).toBe(false);
      expect(isCountrySanctioned("CA")).toBe(false);
      expect(isCountrySanctioned(null)).toBe(false);
      expect(isCountrySanctioned(undefined)).toBe(false);
    });

    it("evaluates wallet connection compliance and blocks attempts from sanctioned countries", () => {
      const sanctionedCheck = checkJurisdictionCompliance("KP", "wallet_connect");
      expect(sanctionedCheck.isCompliant).toBe(false);
      expect(sanctionedCheck.isSanctioned).toBe(true);
      expect(sanctionedCheck.blockedAction).toBe("wallet_connect");
      expect(sanctionedCheck.error).toContain("Access denied: Action 'wallet_connect' is prohibited");
      expect(sanctionedCheck.countryName).toBe("North Korea (DPRK)");

      const cleanCheck = checkJurisdictionCompliance("DE", "wallet_connect");
      expect(cleanCheck.isCompliant).toBe(true);
      expect(cleanCheck.isSanctioned).toBe(false);
      expect(cleanCheck.error).toBeUndefined();
    });

    it("renders modal blocking wallet connection when user country code is in OFAC sanctioned list", () => {
      render(
        React.createElement(RestrictedJurisdictionModal, {
          isOpen: true,
          countryCode: "IR",
          countryName: "Iran",
        }),
      );

      const modal = screen.getByTestId("modal-restricted-jurisdiction");
      expect(modal).toBeDefined();

      expect(screen.getByText("Access Restricted: Sanctioned Jurisdiction")).toBeDefined();
      expect(screen.getByText(/Detected Location: Iran \(IR\)/)).toBeDefined();
      expect(screen.getByText(/Wallet Connection Blocked:/)).toBeDefined();
    });

    it("does not render modal when isOpen is false", () => {
      render(
        React.createElement(RestrictedJurisdictionModal, {
          isOpen: false,
          countryCode: "CU",
        }),
      );

      expect(screen.queryByTestId("modal-restricted-jurisdiction")).toBeNull();
    });
  });

  describe("2. Compliant Read-Only View for Public Audit Purposes", () => {
    it("permits compliant read-only public audit queries from sanctioned jurisdictions", () => {
      const auditCompliance = checkJurisdictionCompliance("SY", "public_audit");
      expect(auditCompliance.isCompliant).toBe(true);
      expect(auditCompliance.isSanctioned).toBe(true);
      expect(auditCompliance.allowReadOnlyAudit).toBe(true);
      expect(auditCompliance.blockedAction).toBeUndefined();
    });

    it("transitions user to compliant read-only audit mode upon clicking action button", () => {
      const onEnterReadOnly = vi.fn();
      const onClose = vi.fn();

      render(
        React.createElement(RestrictedJurisdictionModal, {
          isOpen: true,
          countryCode: "RU",
          countryName: "Russia",
          onClose,
          onEnterReadOnlyAuditMode: onEnterReadOnly,
        }),
      );

      const readOnlyBtn = screen.getByTestId("btn-read-only-audit-mode");
      expect(readOnlyBtn).toBeDefined();
      expect(readOnlyBtn.textContent).toContain("Continue in Read-Only Audit Mode");

      fireEvent.click(readOnlyBtn);

      expect(onEnterReadOnly).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(isReadOnlyAuditMode()).toBe(true);
    });
  });

  describe("3. Clear Regulatory Compliance Disclosure Text", () => {
    it("displays prominent, unabridged OFAC and FinCEN regulatory compliance disclosures", () => {
      render(
        React.createElement(RestrictedJurisdictionModal, {
          isOpen: true,
          countryCode: "CU",
          countryName: "Cuba",
        }),
      );

      const disclosureEl = screen.getByTestId("regulatory-disclosure-text");
      expect(disclosureEl).toBeDefined();
      expect(disclosureEl.textContent).toBe(REGULATORY_DISCLOSURE_TEXT);

      // Verify specific regulatory citations in disclosure
      expect(disclosureEl.textContent).toContain("Office of Foreign Assets Control (OFAC)");
      expect(disclosureEl.textContent).toContain("FinCEN");
      expect(disclosureEl.textContent).toContain("read-only public audit mode");
      expect(disclosureEl.textContent).toContain("without active transacting");
    });
  });
});
