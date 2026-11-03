// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { IndigoBootLoader } from "../components/shared/IndigoBootLoader";
import { Router } from "../App";

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({ isConnected: false, openWalletModal: vi.fn() }),
}));
vi.mock("../lib/telegram", () => ({
  initTelegramWebApp: vi.fn(),
  syncTelegramTheme: () => vi.fn(),
  isTelegramMiniApp: () => false,
}));
vi.mock("../components/shared/ConnectWalletModal", () => ({ ConnectWalletModal: () => null }));
vi.mock("../components/shared/MultiSigApprovalModal", () => ({
  MultiSigApprovalModal: () => null,
}));
vi.mock("../components/shared/RpcStatusModal", () => ({ RpcStatusModal: () => null }));
vi.mock("../components/affiliate/ZKProofVerifierModal", () => ({
  ZKProofVerifierModal: () => null,
}));
vi.mock("../pages/Landing", () => ({
  Landing: () => React.createElement("div", null, "Landing View Ready"),
}));

describe("High-fidelity Indigo Boot Loader Suite", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders centered branding, logo, and security encryption tag", () => {
    const { container } = render(React.createElement(IndigoBootLoader, { fast: true }));

    expect(screen.getByTestId("indigo-boot-loader")).toBeTruthy();
    expect(screen.getByText("StormSale")).toBeTruthy();
    expect(screen.getByText(/Security & Encryption Hydration/i)).toBeTruthy();
    expect(screen.getByText(/Stellar Soroban v22/i)).toBeTruthy();
    expect(screen.getByText(/ChaCha20-Poly1305/i)).toBeTruthy();
    expect(container.innerHTML).toContain("bg-[#09090b]");
    expect(container.innerHTML).toContain("from-indigo-900/30");
    expect(container.innerHTML).toContain("border-indigo-500");
    expect(container.innerHTML).toContain("bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600");
  });

  it("handles fast boot mode and triggers onComplete callback after timeout", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(React.createElement(IndigoBootLoader, { fast: true, onComplete }));
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("Decryption Complete & Ready")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("advances hydration progress smoothly across all 4 cryptographic stages and completes", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(React.createElement(IndigoBootLoader, { minDurationMs: 600, fast: false, onComplete }));

    // Stage 1 (< 30%)
    expect(screen.getByText("Initializing Cryptographic Session")).toBeTruthy();
    expect(screen.getByText(/Generating ephemeral session keys/i)).toBeTruthy();

    // Advance into Stage 2 (30% - 64%)
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(screen.getByText("Verifying Soroban Escrow Protocol")).toBeTruthy();

    // Advance into Stage 3 (65% - 94%)
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(screen.getByText("Hydrating Security & Encryption Policies")).toBeTruthy();

    // Advance into Stage 4 (>= 95% -> 100%)
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(screen.getByText("Decryption Complete & Ready")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();

    // Wait for the 180ms completion transition delay
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("triggers onComplete immediately when clicking Skip to Dashboard button", () => {
    const onComplete = vi.fn();
    render(React.createElement(IndigoBootLoader, { fast: false, onComplete }));

    const skipBtn = screen.getByRole("button", { name: /Skip to Dashboard/i });
    fireEvent.click(skipBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("integrates with Router and transitions from boot loader to main view", async () => {
    window.history.replaceState({}, "", "/?boot=true&fast=true");
    render(React.createElement(Router));

    const skipBtn = screen.getByRole("button", { name: /Skip to Dashboard/i });
    fireEvent.click(skipBtn);

    expect(await screen.findByText("Landing View Ready")).toBeTruthy();
  });

  it("respects ?boot=false query parameter in Router", async () => {
    window.history.replaceState({}, "", "/?boot=false");
    render(React.createElement(Router));

    expect(await screen.findByText("Landing View Ready")).toBeTruthy();
  });
});
