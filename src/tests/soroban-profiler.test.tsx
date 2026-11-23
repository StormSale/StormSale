// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  parseSimulationResourceBudget,
  formatBytes,
  stroopsToXlm,
  profileTransactionSimulation,
  SOROBAN_MAX_CPU_INSTRUCTIONS,
  SOROBAN_MAX_MEMORY_BYTES,
} from "../lib/sorobanProfiler";
import { ResourceDiagnosticAccordion } from "../components/shared/ResourceDiagnosticAccordion";
import { TransactionConfirmModal } from "../components/shared/TransactionConfirmModal";

describe("Granular Gas Limit & Soroban CPU/Memory Resource Budget Profiler (#129)", () => {
  it("formats bytes and stroops accurately", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(stroopsToXlm(10_000_000)).toBe("1.0000000 XLM");
    expect(stroopsToXlm(150_000)).toBe("0.0150000 XLM");
  });

  it("parses simulateTransaction response extracting minResourceFee, cpuInstructions, and memoryBytes", () => {
    const mockSim = {
      minResourceFee: "25000",
      cost: {
        cpuInsns: "15000000",
        memBytes: "3200000",
      },
    };

    const profile = parseSimulationResourceBudget(mockSim);
    expect(profile.minResourceFeeStroops).toBe(25000);
    expect(profile.minResourceFee).toContain("0.0025000 XLM");
    expect(profile.cpuInstructions).toBe(15_000_000);
    expect(profile.cpuPercentage).toBeCloseTo((15_000_000 / SOROBAN_MAX_CPU_INSTRUCTIONS) * 100, 1);
    expect(profile.memoryBytes).toBe(3_200_000);
    expect(profile.memoryPercentage).toBeCloseTo((3_200_000 / SOROBAN_MAX_MEMORY_BYTES) * 100, 1);
    expect(profile.status).toBe("optimal");
    expect(profile.warnings).toHaveLength(0);
  });

  it("flags unoptimized contract footprints exceeding budget thresholds (>80%)", () => {
    const heavySim = {
      minResourceFee: "6500000",
      cost: {
        cpuInsns: "85000000", // 85% of 100M
        memBytes: "38000000", // >80% of 40MB
      },
    };

    const profile = parseSimulationResourceBudget(heavySim);
    expect(profile.status).toBe("critical");
    expect(profile.warnings.some((w) => w.includes("CPU consumption"))).toBe(true);
    expect(profile.warnings.some((w) => w.includes("Memory allocation"))).toBe(true);
    expect(profile.warnings.some((w) => w.includes("Elevated resource fee"))).toBe(true);
  });

  it("profiles transaction simulation against testnet RPC client", async () => {
    const mockServer = {
      simulateTransaction: vi.fn().mockResolvedValue({
        minResourceFee: "18500",
        cost: {
          cpuInsns: 12_000_000,
          memBytes: 1_500_000,
        },
      }),
    };

    const profile = await profileTransactionSimulation(mockServer, {} as any);
    expect(mockServer.simulateTransaction).toHaveBeenCalled();
    expect(profile.minResourceFeeStroops).toBe(18500);
    expect(profile.cpuInstructions).toBe(12_000_000);
    expect(profile.memoryBytes).toBe(1_500_000);
  });

  it("renders ResourceDiagnosticAccordion with Dev Mode toggle revealing details", () => {
    const testProfile = parseSimulationResourceBudget({
      minResourceFee: "20000",
      cost: {
        cpuInsns: 20_000_000,
        memBytes: 2_000_000,
      },
    });

    render(<ResourceDiagnosticAccordion profile={testProfile} defaultOpen={true} />);

    expect(screen.getByText("Resource Diagnostic")).toBeDefined();
    expect(screen.getByText("Dev Mode")).toBeDefined();
    expect(screen.getByText(/CPU Instructions/i)).toBeDefined();
    expect(screen.getByText(/Memory Footprint/i)).toBeDefined();

    // Toggle Dev Mode checkbox
    const devModeToggle = screen.getByRole("checkbox");
    expect(devModeToggle).toBeDefined();
    fireEvent.click(devModeToggle);

    expect(screen.getByText(/Soroban RPC Profiler Breakdown/i)).toBeDefined();
  });

  it("renders within TransactionConfirmModal with full confirmation workflow", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <TransactionConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm Campaign Creation"
        contractCallName="create_campaign"
        targetContractAddress="CCAMPAIGNESCROWCONTRACTTESTNET"
        estimatedAmount="150 XLM"
      />,
    );

    expect(screen.getByText("Confirm Campaign Creation")).toBeDefined();
    expect(screen.getByText("create_campaign")).toBeDefined();
    expect(screen.getByText("150 XLM")).toBeDefined();
    expect(screen.getByText("Resource Diagnostic")).toBeDefined();

    const confirmBtn = screen.getByRole("button", { name: /Confirm & Sign/i });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });
});
