// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Component coverage for the enterprise compliance checklist (#64). The pure
 * checklist utilities are covered in src/lib/complianceChecklist.test.ts; this
 * suite exercises the UI: filters, attestation, per-control editing, framework
 * bulk actions, reset and the export buttons.
 */

const wallet = vi.hoisted(() => ({ userAddress: null as string | null }));
const notify = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({ userAddress: wallet.userAddress, isConnected: Boolean(wallet.userAddress) }),
}));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({ showNotification: notify }),
}));

import { ComplianceChecklist } from "../components/auditor/ComplianceChecklist";
import {
  COMPLIANCE_CONTROLS,
  COMPLIANCE_FRAMEWORKS,
  controlsForFramework,
  storageKeyFor,
} from "../lib/complianceChecklist";

const AUDITOR = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

beforeEach(() => {
  localStorage.clear();
  notify.mockReset();
  wallet.userAddress = null;
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const controlById = (id: string) => COMPLIANCE_CONTROLS.find((control) => control.id === id)!;

const attestCheckbox = (id: string) => {
  const control = controlById(id);
  return screen.getByRole("checkbox", {
    name: `Mark ${control.ref} ${control.title} as compliant`,
  });
};

describe("ComplianceChecklist — rendering and filters", () => {
  it("renders the header, seeded summary and every framework group", () => {
    render(<ComplianceChecklist />);

    expect(screen.getByText("Enterprise Audit Checklist")).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: "Severity-weighted compliance score" }),
    ).toBeTruthy();
    expect(screen.getByText("Framework Coverage")).toBeTruthy();
    COMPLIANCE_FRAMEWORKS.forEach((framework) => {
      expect(screen.getAllByText(new RegExp(framework.shortName)).length).toBeGreaterThan(0);
    });
    // Seeded progress from createInitialChecklist renders as attested checkboxes.
    expect(attestCheckbox("nist-ac-3").getAttribute("aria-checked")).toBe("true");
    expect(attestCheckbox("nist-ac-6").getAttribute("aria-checked")).toBe("false");
  });

  it("filters by search query and clears every active filter", () => {
    render(<ComplianceChecklist />);
    const target = controlById("nist-ac-6");

    fireEvent.change(screen.getByLabelText("Search controls"), {
      target: { value: target.title },
    });
    expect(attestCheckbox("nist-ac-6")).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: new RegExp(controlById("nist-ac-3").title) }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Clear 1 filter$/ }));
    expect(attestCheckbox("nist-ac-3")).toBeTruthy();
  });

  it("filters by status, severity and framework", () => {
    render(<ComplianceChecklist />);

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "exception" } });
    expect(attestCheckbox("soc2-p6-1")).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: new RegExp(controlById("nist-ac-3").title) }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter by severity"), {
      target: { value: "critical" },
    });
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "all" } });
    expect(screen.getByRole("button", { name: /Clear 1 filter$/ })).toBeTruthy();

    const nist = COMPLIANCE_FRAMEWORKS[0];
    const pressedBefore = screen
      .getAllByRole("button", { pressed: false })
      .filter((button) => button.textContent?.trim() === nist.shortName);
    fireEvent.click(pressedBefore[0]);
    expect(screen.getByRole("button", { name: /Clear 2 filters/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Clear 2 filters/ }));
    expect(screen.queryByRole("button", { name: /Clear \d filter/ })).toBeNull();
  });

  it("toggles a status filter from the summary tiles", () => {
    render(<ComplianceChecklist />);
    const tile = screen
      .getAllByRole("button", { pressed: false })
      .find(
        (button) =>
          button.textContent?.startsWith("In Progress") ||
          /In[ -]progress/i.test(button.textContent ?? ""),
      );
    expect(tile).toBeTruthy();
    fireEvent.click(tile!);
    expect(tile!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tile!);
    expect(tile!.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles a framework from the coverage card", () => {
    render(<ComplianceChecklist />);
    const framework = COMPLIANCE_FRAMEWORKS[1];
    const coverage = screen.getByText("Framework Coverage").closest("div")!.parentElement!
      .parentElement!;
    const button = within(coverage).getAllByRole("button")[1];
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.queryByRole("checkbox", { name: new RegExp(controlById("nist-ac-3").title) }),
    ).toBeNull();
    expect(controlsForFramework(framework.id).length).toBeGreaterThan(0);
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("ComplianceChecklist — editing controls", () => {
  it("attests and un-attests a control from its checkbox", () => {
    render(<ComplianceChecklist />);
    const checkbox = attestCheckbox("nist-ac-6");

    fireEvent.click(checkbox);
    expect(attestCheckbox("nist-ac-6").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(attestCheckbox("nist-ac-6"));
    expect(attestCheckbox("nist-ac-6").getAttribute("aria-checked")).toBe("false");
  });

  it("changes status from the select and cycle button, warning on exceptions", () => {
    render(<ComplianceChecklist />);
    const control = controlById("nist-ac-6");
    const select = document.getElementById(`status-${control.id}`) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "exception" } });
    expect(select.value).toBe("exception");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning", title: `Exception recorded · ${control.ref}` }),
    );

    const row = select.closest("div")!;
    fireEvent.click(within(row).getByRole("button", { name: "Cycle" }));
    expect(select.value).not.toBe("exception");
  });

  it("expands a control and records reviewer, evidence, notes and decisions", () => {
    render(<ComplianceChecklist />);
    const control = controlById("nist-ac-6");
    const select = document.getElementById(`status-${control.id}`) as HTMLSelectElement;
    const row = select.closest("div")!;
    const expand = within(row)
      .getAllByRole("button")
      .find((button) => button.hasAttribute("aria-expanded"))!;

    fireEvent.click(expand);
    expect(expand.getAttribute("aria-expanded")).toBe("true");

    fireEvent.change(screen.getByPlaceholderText("Auditor name or public key"), {
      target: { value: "Ada Auditor" },
    });
    fireEvent.change(screen.getByPlaceholderText("ledger tx hash, ticket or document link"), {
      target: { value: "https://example.com/evidence" },
    });
    fireEvent.change(screen.getByPlaceholderText(/How was this satisfied\?/), {
      target: { value: "Scope export reconciled." },
    });
    expect(
      (screen.getByPlaceholderText("Auditor name or public key") as HTMLInputElement).value,
    ).toBe("Ada Auditor");

    fireEvent.click(screen.getByRole("button", { name: /Out of scope/ }));
    expect(select.value).toBe("not-applicable");
    fireEvent.click(screen.getByRole("button", { name: /Raise exception/ }));
    expect(select.value).toBe("exception");
    fireEvent.click(screen.getByRole("button", { name: /Mark compliant/ }));
    expect(select.value).toBe("compliant");

    fireEvent.click(expand);
    expect(expand.getAttribute("aria-expanded")).toBe("false");
  });

  it("attests and clears a whole framework", () => {
    render(<ComplianceChecklist />);

    fireEvent.click(screen.getAllByRole("button", { name: /Attest all/ })[0]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Framework attested" }));
    expect(attestCheckbox("nist-ac-6").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getAllByRole("button", { name: /^Clear$/ })[0]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Framework reset" }));
    expect(attestCheckbox("nist-ac-3").getAttribute("aria-checked")).toBe("false");
  });
});

describe("ComplianceChecklist — persistence, reset and exports", () => {
  it("persists edits for the connected auditor key after the debounce", () => {
    vi.useFakeTimers();
    wallet.userAddress = AUDITOR;
    render(<ComplianceChecklist />);

    fireEvent.click(attestCheckbox("nist-ac-6"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const saved = JSON.parse(localStorage.getItem(storageKeyFor(AUDITOR)) ?? "{}");
    expect(saved.controls["nist-ac-6"].status).toBe("compliant");
  });

  it("reloads the checklist when the auditor identity changes", () => {
    const { rerender } = render(<ComplianceChecklist />);
    fireEvent.click(attestCheckbox("nist-ac-6"));
    expect(attestCheckbox("nist-ac-6").getAttribute("aria-checked")).toBe("true");

    wallet.userAddress = AUDITOR;
    rerender(<ComplianceChecklist />);
    expect(attestCheckbox("nist-ac-6").getAttribute("aria-checked")).toBe("false");
  });

  it("only resets after confirmation", () => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<ComplianceChecklist />);

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/ }));
    expect(notify).not.toHaveBeenCalled();
    expect(attestCheckbox("nist-ac-3").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/ }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Checklist reset" }));
  });

  it("downloads JSON, CSV and Markdown exports", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<ComplianceChecklist />);
    fireEvent.click(screen.getByRole("button", { name: /Export JSON/ }));
    fireEvent.click(screen.getByRole("button", { name: /^CSV$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Summary$/ }));

    expect(createObjectURL).toHaveBeenCalledTimes(3);
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(click).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Checklist exported as JSON." }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Markdown audit summary downloaded." }),
    );
  });
});
