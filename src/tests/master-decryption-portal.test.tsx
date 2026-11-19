// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MasterDecryptionPortal } from "../components/auditor/MasterDecryptionPortal";
import { AuditorTenancyProvider } from "../context/AuditorTenancyContext";
import { NotificationProvider } from "../context/NotificationContext";
import { revokeAuditorKey, readAuditLedger } from "../lib/auditLedger";

describe("MasterDecryptionPortal (#58)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderComponent = () => {
    return render(
      <NotificationProvider>
        <AuditorTenancyProvider>
          <MasterDecryptionPortal />
        </AuditorTenancyProvider>
      </NotificationProvider>,
    );
  };

  it("renders the Master Decryption Portal interface with key inputs", () => {
    renderComponent();
    expect(screen.getByTestId("master-decryption-portal")).toBeTruthy();
    expect(screen.getByText(/Authorized Master Decryption Portal/i)).toBeTruthy();
    expect(screen.getByTestId("input-master-key")).toBeTruthy();
    expect(screen.getByTestId("input-target-sale-id")).toBeTruthy();
    expect(screen.getByTestId("btn-master-decrypt")).toBeTruthy();
  });

  it("validates key format before access and rejects empty or invalid key", async () => {
    renderComponent();
    const keyInput = screen.getByTestId("input-master-key");
    const verifyBtn = screen.getByTestId("btn-validate-key");

    fireEvent.change(keyInput, { target: { value: "invalid-short" } });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Key format invalid/i).length).toBeGreaterThan(0);
    });
  });

  it("accepts valid Stellar key or AUD-MASTER- token", async () => {
    renderComponent();
    const keyInput = screen.getByTestId("input-master-key");
    const verifyBtn = screen.getByTestId("btn-validate-key");

    fireEvent.change(keyInput, { target: { value: "AUD-MASTER-AUTHORIZED-KEY-123" } });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Master key cryptographic integrity verified/i).length,
      ).toBeGreaterThan(0);
    });
  });

  it("denies access if master key has been revoked in audit ledger", async () => {
    const revokedKey = "GASTORMSALEREVOKEDKEY7777777777777777777777777777777777777";
    await revokeAuditorKey(revokedKey, "Security incident breach", "Admin");

    renderComponent();
    const keyInput = screen.getByTestId("input-master-key");
    const decryptBtn = screen.getByTestId("btn-master-decrypt");

    fireEvent.change(keyInput, { target: { value: revokedKey } });
    fireEvent.click(decryptBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/emergency-revoked/i).length).toBeGreaterThan(0);
    });
  });

  it("decrypts sale and appends an entry to the tamper-evident audit ledger", async () => {
    renderComponent();
    const keyInput = screen.getByTestId("input-master-key");
    const saleInput = screen.getByTestId("input-target-sale-id");
    const decryptBtn = screen.getByTestId("btn-master-decrypt");

    // Northwind includes sale 1042
    fireEvent.change(keyInput, { target: { value: "AUD-MASTER-AUTHORIZED-KEY-2026" } });
    fireEvent.change(saleInput, { target: { value: "1042" } });
    fireEvent.click(decryptBtn);

    await waitFor(
      () => {
        expect(screen.getByTestId("master-decrypted-result")).toBeTruthy();
      },
      { timeout: 3000 },
    );

    expect(screen.getAllByText(/Sale #1042/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Gross Conversion/i)).toBeTruthy();
    expect(screen.getByText(/Affiliate Commission/i)).toBeTruthy();

    // Verify audit ledger entry was written
    const ledger = readAuditLedger();
    const decryptEvents = ledger.filter(
      (e) => e.action === "payload_decrypted" && e.saleId === "1042",
    );
    expect(decryptEvents.length).toBeGreaterThan(0);
    expect(decryptEvents[0].detail).toContain("Authorized Master Decryption");
  });
});
