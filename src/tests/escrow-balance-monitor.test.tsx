// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EscrowBalanceMonitor } from "../components/advertiser/EscrowBalanceMonitor";
import { setMockEscrowBalance } from "../hooks/useEscrow";
import { CONTRACT_ADDRESSES } from "../config/contracts";

describe("EscrowBalanceMonitor UI Component (#71)", () => {
  const contractId = CONTRACT_ADDRESSES.CAMPAIGN_ESCROW;

  beforeEach(() => {
    vi.restoreAllMocks();
    setMockEscrowBalance(contractId, "XLM", "8500");
    setMockEscrowBalance(contractId, "USDC", "3200");
    setMockEscrowBalance(contractId, "EURC", "1500");
  });

  it("renders monitor card with title, status, and tokens", async () => {
    render(<EscrowBalanceMonitor contractAddress={contractId} pollingIntervalMs={5000} />);

    expect(screen.getByText("Escrow Balance Contract Monitor")).toBeDefined();
    expect(screen.getByText(/Polling 5s/i)).toBeDefined();

    // Wait for balances to load
    await waitFor(() => {
      expect(screen.getByTestId("token-balance-XLM")).toBeDefined();
      expect(screen.getByTestId("token-balance-USDC")).toBeDefined();
      expect(screen.getByTestId("token-balance-EURC")).toBeDefined();
    });

    expect(screen.getByText("8500.00")).toBeDefined();
    expect(screen.getByText("3200.00")).toBeDefined();
    expect(screen.getByText("1500.00")).toBeDefined();
  });

  it("toggles pause and resume on button click", async () => {
    render(<EscrowBalanceMonitor contractAddress={contractId} pollingIntervalMs={5000} />);

    const pauseBtn = screen.getByRole("button", { name: /pause/i });
    expect(pauseBtn).toBeDefined();

    fireEvent.click(pauseBtn);

    await waitFor(() => {
      expect(screen.getByText("Paused")).toBeDefined();
      expect(screen.getByRole("button", { name: /resume/i })).toBeDefined();
    });

    const resumeBtn = screen.getByRole("button", { name: /resume/i });
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Polling 5s/i)).toBeDefined();
    });
  });

  it("triggers manual sync on Sync Now button click", async () => {
    render(<EscrowBalanceMonitor contractAddress={contractId} pollingIntervalMs={5000} />);

    // Wait for initial sync to finish so button shows "Sync Now"
    const syncBtn = await screen.findByRole("button", { name: /sync now/i });
    expect(syncBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(syncBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/last synchronized:/i)).toBeDefined();
    });
  });

  it("allows switching monitored contracts via selector dropdown", async () => {
    const secondContract = "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2";
    setMockEscrowBalance(secondContract, "XLM", "9999");
    setMockEscrowBalance(secondContract, "USDC", "4444");
    setMockEscrowBalance(secondContract, "EURC", "1111");

    render(<EscrowBalanceMonitor contractAddress={contractId} showContractSelector={true} />);

    await waitFor(() => {
      expect(screen.getByText("8500.00")).toBeDefined();
    });

    const select = screen.getByRole("combobox", { name: /select monitored escrow contract/i });
    expect(select).toBeDefined();

    await act(async () => {
      fireEvent.change(select, { target: { value: secondContract } });
    });

    await waitFor(() => {
      expect(screen.getByText("9999.00")).toBeDefined();
    });
  });
});
