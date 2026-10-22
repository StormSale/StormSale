// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ZKRangeProofVerifier } from "./ZKRangeProofVerifier";
import { AuditorTenancyProvider } from "../../context/AuditorTenancyContext";
import { NotificationProvider } from "../../context/NotificationContext";

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <NotificationProvider>
      <AuditorTenancyProvider>{ui}</AuditorTenancyProvider>
    </NotificationProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ZKRangeProofVerifier Component (Issue #175)", () => {
  it("renders the verification console with header, presets, and on-chain metadata", () => {
    renderWithProviders(<ZKRangeProofVerifier />);

    expect(screen.getByText("Zero-Knowledge Range Proof Verification")).toBeTruthy();
    expect(screen.getByText("Issue #175 • Compliance Auditor")).toBeTruthy();
    expect(screen.getByText("WASM Worker < 500ms")).toBeTruthy();
    expect(screen.getByText("Sale #1042")).toBeTruthy();
    expect(screen.getByText("Tech Gadgets Pro")).toBeTruthy();
    expect(screen.getByText("Raw Transaction Value Withheld")).toBeTruthy();
  });

  it("verifies range proof against ledger state and displays the official verification badge", async () => {
    renderWithProviders(<ZKRangeProofVerifier />);

    const verifyBtn = screen.getByRole("button", {
      name: /Verify Range Proof Against Ledger State/i,
    });
    expect(verifyBtn).toBeTruthy();

    fireEvent.click(verifyBtn);

    // Wait for the verification to complete
    await waitFor(() => {
      expect(
        screen.getAllByText(/Cryptographically Proven in Range: \$10 - \$5,000/i).length,
      ).toBeGreaterThan(0);
    });

    // Check compliance output metrics
    expect(screen.getByText("Proof Verified & Valid")).toBeTruthy();
    expect(screen.getByText("✓ Target Met")).toBeTruthy();
    expect(screen.getByText("✓ Zero Knowledge")).toBeTruthy();

    // Check that attestation actions become available
    expect(screen.getByRole("button", { name: /Download Attestation/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy Report/i })).toBeTruthy();
  });

  it("detects tampered test conversion and displays verification failure", async () => {
    renderWithProviders(<ZKRangeProofVerifier />);

    // Click on Tampered Test preset
    const tamperedPreset = screen.getByText("Sale #776");
    fireEvent.click(tamperedPreset);

    const verifyBtn = screen.getByRole("button", {
      name: /Verify Range Proof Against Ledger State/i,
    });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getAllByText("Verification Failed").length).toBeGreaterThan(0);
    });
  });

  it("downloads the official SOC 2 compliance certificate upon click", async () => {
    const createObjectURL = vi.fn(() => "blob:zk-cert");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithProviders(<ZKRangeProofVerifier />);

    // Verify first
    const verifyBtn = screen.getByRole("button", {
      name: /Verify Range Proof Against Ledger State/i,
    });
    fireEvent.click(verifyBtn);

    const downloadBtn = await screen.findByRole("button", { name: /Download Attestation/i });
    fireEvent.click(downloadBtn);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown[])[0] as Blob;
    const text = await blob.text();
    expect(text).toContain("ZERO-KNOWLEDGE RANGE PROOF ATTESTATION");
    expect(text).toContain("Cryptographically Proven in Range: $10 - $5,000");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:zk-cert");
  });
});
