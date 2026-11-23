// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Admin } from "../pages/Admin";
import {
  setGlobalEmergencyPause,
  setContractPause,
  isProtocolPaused,
  isContractPaused,
  getEmergencyAuditLogs,
} from "../lib/emergencyPause";

const mockWeb3 = {
  userAddress: "GAADMINTESTNETADDRESS77777777777777777777777777777777",
  userRole: "ADMIN",
  isConnected: true,
  updateUserRole: vi.fn(),
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3,
}));

describe("Admin Emergency Kill-Switch UI & Circuit Breakers (#86)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockWeb3.userRole = "ADMIN";
    mockWeb3.isConnected = true;
  });

  it("governs protocol emergency pause state and storage persistence", () => {
    expect(isProtocolPaused()).toBe(false);
    expect(isContractPaused("CAMPAIGN_ESCROW")).toBe(false);

    setGlobalEmergencyPause(true, "GAADMINTEST", "Suspicious volume spike");
    expect(isProtocolPaused()).toBe(true);
    expect(isContractPaused("CAMPAIGN_ESCROW")).toBe(true);

    const logs = getEmergencyAuditLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe("GLOBAL_PAUSE");
    expect(logs[0].reason).toContain("Suspicious volume spike");

    setGlobalEmergencyPause(false, "GAADMINTEST", "Resumed after investigation");
    expect(isProtocolPaused()).toBe(false);
  });

  it("handles granular contract pauses independently", () => {
    setContractPause("AFFILIATE_PAYOUTS", true, "GAADMINTEST", "Rate limit check");
    expect(isProtocolPaused()).toBe(false);
    expect(isContractPaused("AFFILIATE_PAYOUTS")).toBe(true);
    expect(isContractPaused("BATCH_LOGGING")).toBe(false);

    setContractPause("AFFILIATE_PAYOUTS", false, "GAADMINTEST", "Normal rate restored");
    expect(isContractPaused("AFFILIATE_PAYOUTS")).toBe(false);
  });

  it("blocks non-admin users with unauthorized restricted notice", () => {
    mockWeb3.userRole = "AFFILIATE";
    render(<Admin />);

    expect(screen.getByText("Restricted Admin Area")).toBeDefined();
    expect(screen.getByText(/platform administrator role credentials/i)).toBeDefined();
    expect(screen.queryByText("Platform Admin Command Center")).toBeNull();
  });

  it("renders full Admin Command Center when authorized admin is connected", () => {
    render(<Admin />);

    expect(screen.getByText("Platform Admin Command Center")).toBeDefined();
    expect(screen.getByText("ADMIN ONLY")).toBeDefined();
    expect(screen.getByText(/Protocol Normal Operations/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Emergency Global Kill-Switch/i })).toBeDefined();
  });

  it("requires security challenge confirmation to trigger emergency pause", async () => {
    render(<Admin />);

    const killSwitchBtn = screen.getByRole("button", { name: /Emergency Global Kill-Switch/i });
    fireEvent.click(killSwitchBtn);

    // Modal opens asking for PAUSE challenge
    expect(screen.getByText(/Confirm PAUSE Interruption/i)).toBeDefined();
    const challengeInput = screen.getByPlaceholderText("Type PAUSE");
    expect(challengeInput).toBeDefined();

    const executeBtn = screen.getByRole("button", { name: /Execute Emergency Pause/i });
    expect((executeBtn as HTMLButtonElement).disabled).toBe(true);

    // Typing wrong text keeps it disabled
    fireEvent.change(challengeInput, { target: { value: "NOPE" } });
    expect((executeBtn as HTMLButtonElement).disabled).toBe(true);

    // Typing PAUSE enables execution
    fireEvent.change(challengeInput, { target: { value: "PAUSE" } });
    expect((executeBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByText(/EMERGENCY PROTOCOL PAUSE ACTIVE/i)).toBeDefined();
    });
  });
});
