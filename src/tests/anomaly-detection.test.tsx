// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

const exportSpies = vi.hoisted(() => ({ print: vi.fn(), download: vi.fn() }));

vi.mock("../lib/complianceExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/complianceExport")>();
  return {
    ...actual,
    printOrSavePDF: exportSpies.print,
    downloadFile: exportSpies.download,
  };
});

vi.mock("../components/auditor/Soc2EvidenceExport", () => ({
  Soc2EvidenceExport: () => <div>SOC 2 export</div>,
}));
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ComplianceReport } from "../components/auditor/ComplianceReport";
import { NotificationProvider } from "../context/NotificationContext";

afterEach(() => cleanup());

const renderReport = () =>
  render(
    <NotificationProvider>
      <ComplianceReport />
    </NotificationProvider>,
  );

describe("ComplianceReport anomaly flags (#60)", () => {
  it("summarises flags by severity", () => {
    renderReport();
    expect(screen.getByText("Suspicious Activity & Anomaly Detection")).toBeTruthy();
    expect(screen.getByText("High Severity Flags")).toBeTruthy();
    expect(screen.getByText("Medium Severity Flags")).toBeTruthy();
    expect(screen.getByText("Wash Trading")).toBeTruthy();
    expect(screen.getByText("Rapid Claim")).toBeTruthy();
    expect(screen.getByText("Sybil Cluster")).toBeTruthy();
    expect(screen.getAllByText("Red Flag").length).toBe(2);
  });

  it("reports and dismisses anomalies", () => {
    renderReport();
    const reportButtons = screen.getAllByRole("button", { name: /Report Anomaly/ });
    expect(reportButtons.length).toBe(3);
    fireEvent.click(reportButtons[0]);
    const reported = screen.getByRole("button", { name: /Reported/ });
    expect((reported as HTMLButtonElement).disabled).toBe(true);
    const counter = screen.getByText("Reported Anomalies").parentElement as HTMLElement;
    expect(within(counter).getByText("1")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /Dismiss/ })[1]);
    expect(screen.queryByText("Rapid Claim")).toBeNull();
  });
});

describe("ComplianceReport batch export panel", () => {
  it("applies presets, filters and exports signed PDF / CSV", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: /Date-Range Batch Export/ }));
    for (const label of ["7D", "30D", "May '26", "All"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dates.length).toBe(2);
    fireEvent.change(dates[0], { target: { value: "2026-05-02" } });
    fireEvent.change(dates[1], { target: { value: "2026-05-30" } });
    expect(dates[0].value).toBe("2026-05-02");
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, {
      target: { value: select.options[select.options.length - 1].value },
    });

    fireEvent.click(screen.getByRole("button", { name: /Download Signed PDF/ }));
    expect(exportSpies.print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }));
    expect(exportSpies.download).toHaveBeenCalledTimes(1);
    expect(exportSpies.download.mock.calls[0][1]).toMatch(/^compliance-audit-batch-/);

    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    fireEvent.click(dismissButtons[0]);
  });
});

describe("AuditorOverview red flags", () => {
  it("lists anomalies and marks them reported once", async () => {
    const { AuditorOverview } = await import("../components/auditor/AuditorOverview");
    const { AuditorTenancyProvider } = await import("../context/AuditorTenancyContext");
    render(
      <NotificationProvider>
        <AuditorTenancyProvider>
          <AuditorOverview />
        </AuditorTenancyProvider>
      </NotificationProvider>,
    );
    expect(screen.getByText("Suspicious Activity & Anomaly Detection")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: /Report Anomaly/ });
    expect(buttons.length).toBe(3);
    fireEvent.click(buttons[0]);
    expect(screen.getAllByRole("button", { name: /Report Anomaly/ }).length).toBe(2);
    expect(screen.getByRole("button", { name: /Reported/ })).toBeTruthy();
  });
});
