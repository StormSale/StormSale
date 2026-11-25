import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AuditorTenancyProvider } from "../context/AuditorTenancyContext";
import { AuditorOverview } from "../components/auditor/AuditorOverview";
import { AuditHistory } from "../components/auditor/AuditHistory";

const mocks = vi.hoisted(() => ({
  queryContractEventsInRange: vi.fn(),
  resolveDateToLedger: vi.fn(),
  getExportAuditHistory: vi.fn(),
}));

vi.mock("../lib/auditor/blockRange", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auditor/blockRange")>();
  return {
    ...actual,
    queryContractEventsInRange: mocks.queryContractEventsInRange,
    resolveDateToLedger: mocks.resolveDateToLedger,
  };
});

vi.mock("../lib/auditor/exportService", () => ({
  getExportAuditHistory: mocks.getExportAuditHistory,
}));

vi.mock("../components/auditor/SolvencyHUD", () => ({ SolvencyHUD: () => null }));
vi.mock("../components/auditor/MasterDecryptionPortal", () => ({
  MasterDecryptionPortal: () => null,
}));

function renderOverview(tenant = "northwind-assurance") {
  localStorage.setItem("stormsale_auditor_tenant_v1", JSON.stringify(tenant));
  return render(
    <AuditorTenancyProvider>
      <AuditorOverview />
    </AuditorTenancyProvider>,
  );
}

function renderHistory(tenant = "helix-compliance") {
  localStorage.setItem("stormsale_auditor_tenant_v1", JSON.stringify(tenant));
  return render(
    <AuditorTenancyProvider>
      <AuditHistory />
    </AuditorTenancyProvider>,
  );
}

function applyRange(fromBlock: string, toBlock: string): void {
  fireEvent.change(screen.getByLabelText("From block"), { target: { value: fromBlock } });
  fireEvent.change(screen.getByLabelText("To block"), { target: { value: toBlock } });
  fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.queryContractEventsInRange.mockResolvedValue([]);
  mocks.resolveDateToLedger.mockResolvedValue(6_204_100);
  mocks.getExportAuditHistory.mockReturnValue([]);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AuditorOverview block-range navigation", () => {
  it("filters tenant-scoped dashboard records and requests the normalized live range", async () => {
    renderOverview();
    expect(screen.getAllByText("Tech Gadgets Pro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DeFi Starter Pack").length).toBeGreaterThan(0);

    applyRange("6204200", "6204200");

    await waitFor(() =>
      expect(mocks.queryContractEventsInRange).toHaveBeenCalledWith({
        fromBlock: 6_204_200,
        toBlock: 6_204_200,
      }),
    );
    expect(screen.getByText("Tech Gadgets Pro")).toBeTruthy();
    expect(screen.queryByText("DeFi Starter Pack")).toBeNull();
    expect(screen.getByText(/Showing block #6,204,200 through #6,204,200/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/0 contract events found/)).toBeTruthy());
  });

  it("shows validation errors without changing the active range or querying the chain", () => {
    renderOverview();
    applyRange("20", "10");
    expect(screen.getByRole("alert").textContent).toContain(
      "Enter whole block numbers with the start no later than the end.",
    );
    expect(mocks.queryContractEventsInRange).not.toHaveBeenCalled();
    expect(screen.getByText("All block ranges are currently visible.")).toBeTruthy();
  });

  it("resolves a UTC date to one ledger and applies that range", async () => {
    renderOverview("helix-compliance");
    fireEvent.change(screen.getByLabelText("Jump to date (UTC)"), {
      target: { value: "2026-05-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Jump" }));

    await waitFor(() => expect(mocks.resolveDateToLedger).toHaveBeenCalledWith("2026-05-15"));
    await waitFor(() =>
      expect(mocks.queryContractEventsInRange).toHaveBeenCalledWith({
        fromBlock: 6_204_100,
        toBlock: 6_204_100,
      }),
    );
    expect(screen.getByText("Web3 Masterclass")).toBeTruthy();
    expect(screen.queryByText("NFT Drop Alpha")).toBeNull();
  });

  it("keeps local filtering active when the live query fails", async () => {
    mocks.queryContractEventsInRange.mockRejectedValue(new Error("RPC unavailable"));
    renderOverview();
    applyRange("6204100", "6204100");

    await waitFor(() =>
      expect(
        screen.getByText(/Live chain lookup is unavailable; the block filter still applies/),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("DeFi Starter Pack")).toBeNull();
  });

  it("resets the range and restores tenant records", async () => {
    renderOverview();
    applyRange("6204100", "6204100");
    await waitFor(() => expect(screen.queryByText("DeFi Starter Pack")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Reset range" }));
    expect(screen.getByText("All block ranges are currently visible.")).toBeTruthy();
    expect(screen.getAllByText("DeFi Starter Pack").length).toBeGreaterThan(0);
    expect((screen.getByLabelText("From block") as HTMLInputElement).value).toBe("");
  });

  it("never exposes records from another tenant", () => {
    renderOverview("meridian-trust");
    expect(screen.getAllByText("Crypto Tools Suite").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tech Gadgets Pro")).toBeNull();
    expect(screen.queryByText("Summer Sale 2024")).toBeNull();
  });
});

describe("AuditHistory campaign lifecycle timelines", () => {
  it("expands a verified campaign into block-referenced metadata steps", () => {
    renderHistory();
    fireEvent.click(screen.getAllByRole("button", { name: "View timeline" })[0]);

    const timeline = document.getElementById("audit-timeline-988");
    expect(timeline).not.toBeNull();
    const view = within(timeline as HTMLElement);
    expect(view.getByRole("heading", { name: "Campaign registered" })).toBeTruthy();
    expect(view.getByRole("heading", { name: "Escrow funded" })).toBeTruthy();
    expect(view.getByRole("heading", { name: "Read-only access requested" })).toBeTruthy();
    expect(view.getByRole("heading", { name: "Audit verified" })).toBeTruthy();
    expect(view.getByRole("heading", { name: "Evidence receipt sealed" })).toBeTruthy();
    expect(view.getByText("#6,204,070")).toBeTruthy();
    expect(view.getByText("2026-05-15 11:30:00 UTC")).toBeTruthy();
    expect(view.getByText("Advertiser")).toBeTruthy();
    expect(view.getByText("988-created")).toBeTruthy();
  });

  it("keeps only one timeline expanded and preserves Merkle-proof navigation", () => {
    const onViewMerkleProof = vi.fn();
    localStorage.setItem("stormsale_auditor_tenant_v1", JSON.stringify("helix-compliance"));
    render(
      <AuditorTenancyProvider>
        <AuditHistory onViewMerkleProof={onViewMerkleProof} />
      </AuditorTenancyProvider>,
    );
    const buttons = screen.getAllByRole("button", { name: "View timeline" });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(document.getElementById("audit-timeline-988")).toBeNull();
    expect(document.getElementById("audit-timeline-512")).not.toBeNull();
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
    expect(buttons[1].getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Merkle Proof" }));
    expect(onViewMerkleProof).toHaveBeenCalledWith("988", "Web3 Masterclass");
  });

  it("shows denied and pending decisions without sealing evidence", () => {
    renderHistory("meridian-trust");
    fireEvent.click(screen.getAllByRole("button", { name: "View timeline" })[0]);
    let view = within(document.getElementById("audit-timeline-776") as HTMLElement);
    expect(view.getByRole("heading", { name: "Access denied" })).toBeTruthy();
    expect(view.queryByRole("heading", { name: "Evidence receipt sealed" })).toBeNull();

    cleanup();
    renderHistory("helix-compliance");
    fireEvent.click(screen.getAllByRole("button", { name: "View timeline" })[1]);
    view = within(document.getElementById("audit-timeline-512") as HTMLElement);
    expect(view.getByRole("heading", { name: "Advertiser approval pending" })).toBeTruthy();
    expect(view.getByText("current")).toBeTruthy();
    expect(view.queryByRole("heading", { name: "Evidence receipt sealed" })).toBeNull();
  });
});
