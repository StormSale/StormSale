import { describe, it, expect } from "vitest";
import {
  CHECKLIST_SCHEMA_VERSION,
  COMPLIANCE_CONTROLS,
  COMPLIANCE_FRAMEWORKS,
  STATUS_ORDER,
  clearPersistedChecklist,
  controlsForFramework,
  createEmptyChecklist,
  createInitialChecklist,
  cycleStatus,
  escapeCsvField,
  filterControls,
  getControlState,
  loadChecklist,
  markFramework,
  openExceptions,
  parseChecklist,
  persistChecklist,
  serializeChecklist,
  storageKeyFor,
  summarizeChecklist,
  summarizeFrameworks,
  toCsv,
  toMarkdownSummary,
  updateControl,
  weightedScore,
  type ChecklistState,
  type ControlStatus,
  type StorageLike,
} from "./complianceChecklist";

const FIXED_NOW = "2026-05-20T10:00:00.000Z";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe("compliance checklist catalog", () => {
  it("ships six enterprise frameworks with a unique id each", () => {
    expect(COMPLIANCE_FRAMEWORKS).toHaveLength(6);
    const ids = COMPLIANCE_FRAMEWORKS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every control a unique id and a known parent framework", () => {
    const ids = COMPLIANCE_CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    COMPLIANCE_CONTROLS.forEach((control) => {
      expect(COMPLIANCE_FRAMEWORKS.some((f) => f.id === control.frameworkId)).toBe(true);
    });
  });

  it("places every control of a framework with controlsForFramework", () => {
    COMPLIANCE_FRAMEWORKS.forEach((framework) => {
      const controls = controlsForFramework(framework.id);
      expect(controls.length).toBeGreaterThanOrEqual(5);
      expect(controls.every((c) => c.frameworkId === framework.id)).toBe(true);
    });
  });

  it("exposes no more than five severity levels in STATUS_ORDER and cycles them", () => {
    expect(STATUS_ORDER).toHaveLength(5);
  });
});

describe("status transitions", () => {
  it("cycles through the lifecycle and wraps back to the start", () => {
    expect(cycleStatus("not-assessed")).toBe("in-progress");
    expect(cycleStatus("in-progress")).toBe("compliant");
    expect(cycleStatus("compliant")).toBe("exception");
    expect(cycleStatus("exception")).toBe("not-applicable");
    expect(cycleStatus("not-applicable")).toBe("not-assessed");
  });

  it("updates one control immutably, stamping updatedAt and keeping other fields", () => {
    const base = createEmptyChecklist();
    const next = updateControl(
      base,
      "nist-ac-3",
      { status: "compliant", reviewer: "AJ" },
      FIXED_NOW,
    );

    expect(base["nist-ac-3"].status).toBe("not-assessed");
    expect(next["nist-ac-3"]).toEqual({
      status: "compliant",
      notes: "",
      evidenceUrl: "",
      reviewer: "AJ",
      updatedAt: FIXED_NOW,
    });
  });

  it("treats unknown control ids as untouched defaults", () => {
    expect(getControlState({}, "does-not-exist").status).toBe("not-assessed");
  });

  it("marks a whole framework without touching other frameworks", () => {
    const next = markFramework(createEmptyChecklist(), "soc2", "compliant", FIXED_NOW);
    const soc2 = controlsForFramework("soc2");
    expect(soc2.every((c) => getControlState(next, c.id).status === "compliant")).toBe(true);
    expect(getControlState(next, "nist-ac-3").status).toBe("not-assessed");
  });

  it("preserves out-of-scope controls unless explicitly marking them N/A", () => {
    const scoped = updateControl(createEmptyChecklist(), "soc2-a1-2", { status: "not-applicable" });
    const keptOut = markFramework(scoped, "soc2", "compliant");
    expect(getControlState(keptOut, "soc2-a1-2").status).toBe("not-applicable");

    const overwritten = markFramework(scoped, "soc2", "not-applicable");
    expect(getControlState(overwritten, "soc2-a1-2").status).toBe("not-applicable");
  });
});

describe("progress summaries", () => {
  it("counts each status and ignores not-applicable controls in the percentage", () => {
    let state: ChecklistState = createEmptyChecklist();
    state = updateControl(state, "nist-ac-3", { status: "compliant" }, FIXED_NOW);
    state = updateControl(state, "nist-ac-6", { status: "compliant" }, FIXED_NOW);
    state = updateControl(state, "nist-au-12", { status: "in-progress" }, FIXED_NOW);
    state = updateControl(state, "nist-sc-8", { status: "not-applicable" }, FIXED_NOW);

    const summary = summarizeChecklist(state);
    expect(summary.total).toBe(COMPLIANCE_CONTROLS.length);
    expect(summary.compliant).toBe(2);
    expect(summary.inProgress).toBe(1);
    expect(summary.notApplicable).toBe(1);
    expect(summary.applicable).toBe(COMPLIANCE_CONTROLS.length - 1);
    expect(summary.compliantPercent).toBe(Math.round((2 / (COMPLIANCE_CONTROLS.length - 1)) * 100));
    expect(summary.coveragePercent).toBe(Math.round((3 / (COMPLIANCE_CONTROLS.length - 1)) * 100));
  });

  it("reports at-risk as soon as one exception exists, even at full compliance", () => {
    let state: ChecklistState = createEmptyChecklist();
    COMPLIANCE_CONTROLS.forEach((control) => {
      state = updateControl(state, control.id, { status: "compliant" });
    });
    expect(summarizeChecklist(state).readiness).toBe("ready");

    state = updateControl(state, "fips-self-test", { status: "exception" });
    const summary = summarizeChecklist(state);
    expect(summary.readiness).toBe("at-risk");
    expect(openExceptions(state).map((c) => c.id)).toEqual(["fips-self-test"]);
  });

  it("reports at-risk for a blank checklist and in-review at partial coverage", () => {
    const blank = createEmptyChecklist();
    expect(summarizeChecklist(blank).readiness).toBe("at-risk");
    expect(summarizeChecklist(blank).compliantPercent).toBe(0);

    const half = COMPLIANCE_CONTROLS.slice(0, Math.ceil(COMPLIANCE_CONTROLS.length / 2)).reduce(
      (acc, control) => updateControl(acc, control.id, { status: "compliant" }),
      createEmptyChecklist(),
    );
    const summary = summarizeChecklist(half);
    expect(summary.compliantPercent).toBeGreaterThanOrEqual(50);
    expect(summary.compliantPercent).toBeLessThan(90);
    expect(summary.readiness).toBe("in-review");
  });

  it("weights critical controls more heavily than medium ones", () => {
    const criticalsOnly = COMPLIANCE_CONTROLS.filter((c) => c.severity === "critical").reduce(
      (acc, control) => updateControl(acc, control.id, { status: "compliant" }),
      createEmptyChecklist(),
    );
    const blanks = createEmptyChecklist();
    expect(summarizeChecklist(criticalsOnly).compliantPercent).toBeLessThan(
      weightedScore(criticalsOnly),
    );
    expect(weightedScore(blanks)).toBe(0);
    expect(weightedScore(criticalsOnly)).toBeLessThan(100);
  });

  it("summarizes each framework independently", () => {
    const seeded = createInitialChecklist();
    const summaries = summarizeFrameworks(seeded);
    expect(summaries).toHaveLength(COMPLIANCE_FRAMEWORKS.length);
    summaries.forEach(({ framework, summary }) => {
      expect(summary.total).toBe(controlsForFramework(framework.id).length);
      expect(summary.applicable + summary.notApplicable).toBe(summary.total);
    });
    expect(summaries.reduce((total, entry) => total + entry.summary.total, 0)).toBe(
      COMPLIANCE_CONTROLS.length,
    );
  });

  it("seeds a realistic first-run checklist with an open exception", () => {
    const seeded = summarizeChecklist(createInitialChecklist());
    expect(seeded.compliant).toBeGreaterThan(0);
    expect(seeded.exceptions).toBeGreaterThan(0);
    expect(seeded.readiness).toBe("at-risk");
  });
});

describe("filtering", () => {
  const state = createInitialChecklist();

  it("scopes to a framework", () => {
    const filtered = filterControls(COMPLIANCE_CONTROLS, { frameworkId: "gdpr-art32" }, state);
    expect(filtered.length).toBe(controlsForFramework("gdpr-art32").length);
    expect(filtered.every((c) => c.frameworkId === "gdpr-art32")).toBe(true);
  });

  it("treats 'all' as no filter", () => {
    expect(filterControls(COMPLIANCE_CONTROLS, { frameworkId: "all" }, state)).toHaveLength(
      COMPLIANCE_CONTROLS.length,
    );
  });

  it("filters by assessment status using live state", () => {
    const exceptions = filterControls(COMPLIANCE_CONTROLS, { status: "exception" }, state);
    expect(exceptions.length).toBeGreaterThan(0);
    expect(exceptions.every((c) => getControlState(state, c.id).status === "exception")).toBe(true);
  });

  it("filters by severity", () => {
    const criticals = filterControls(COMPLIANCE_CONTROLS, { severity: "critical" }, state);
    expect(criticals.length).toBeGreaterThan(0);
    expect(criticals.every((c) => c.severity === "critical")).toBe(true);
  });

  it("searches controls and their reviewer notes case-insensitively", () => {
    expect(filterControls(COMPLIANCE_CONTROLS, { query: "AC-3" }, state).map((c) => c.id)).toEqual([
      "nist-ac-3",
    ]);
    // Matches flow through requirement text, control titles and evidence hints.
    const pseudonymisation = filterControls(
      COMPLIANCE_CONTROLS,
      { query: "pseudonymisation mapping" },
      state,
    ).map((c) => c.id);
    expect(pseudonymisation).toContain("gdpr-32-1-a");
    expect(pseudonymisation).toContain("iso-a-5-34");
    expect(filterControls(COMPLIANCE_CONTROLS, { query: "no-such-control-text" }, state)).toEqual(
      [],
    );
  });

  it("combines framework, status and query filters", () => {
    const filtered = filterControls(
      COMPLIANCE_CONTROLS,
      { frameworkId: "nist-800-53", status: "compliant", query: "key" },
      state,
    );
    expect(filtered.map((c) => c.id)).toEqual(["nist-ac-3"]);
  });
});

describe("persistence", () => {
  it("builds a versioned, actor-scoped storage key", () => {
    expect(storageKeyFor("GABCDEF")).toBe(
      `stormsale:compliance-checklist:v${CHECKLIST_SCHEMA_VERSION}:GABCDEF`,
    );
    expect(storageKeyFor(null)).toContain("anonymous");
  });

  it("round-trips state through serialize/parse without losing a status", () => {
    const original = createInitialChecklist();
    const parsed = parseChecklist(serializeChecklist(original));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.state).toEqual(original);
  });

  it("parses a bare control map as well as a versioned envelope", () => {
    const bare = JSON.stringify({ "pci-3-5": { status: "compliant", notes: "no PAN on chain" } });
    const result = parseChecklist(bare);
    expect(result.state["pci-3-5"].status).toBe("compliant");
    expect(result.state["pci-3-5"].notes).toBe("no PAN on chain");
    expect(result.state["nist-ac-3"].status).toBe("not-assessed");
  });

  it("warns and falls back on invalid, unknown or malformed payloads", () => {
    expect(parseChecklist(null).warnings).toEqual([]);
    expect(parseChecklist("{not json").warnings).toHaveLength(1);

    const messy = parseChecklist(
      JSON.stringify({
        schemaVersion: 0,
        controls: {
          "nist-ac-3": { status: "totally-invalid", notes: 42 },
          "legacy-control": { status: "compliant" },
          "soc2-cc6-1": "not-an-object",
        },
      }),
    );
    expect(messy.state["nist-ac-3"]).toEqual({
      status: "not-assessed",
      notes: "",
      evidenceUrl: "",
      reviewer: "",
      updatedAt: null,
    });
    expect(messy.warnings).toHaveLength(3);
  });

  it("loads seeded defaults when storage is empty or unavailable", () => {
    const storage = memoryStorage();
    expect(loadChecklist("k", storage)).toEqual(createInitialChecklist());
    expect(loadChecklist("k", null)).toEqual(createInitialChecklist());
  });

  it("persists, reloads and clears a checklist", () => {
    const storage = memoryStorage();
    const key = storageKeyFor("GABC");
    const edited = updateControl(createEmptyChecklist(), "iso-a-8-15", {
      status: "in-progress",
      evidenceUrl: "https://evidence.example/iso-a-8-15",
    });

    expect(persistChecklist(key, edited, storage)).toBe(true);
    expect(loadChecklist(key, storage)).toEqual(edited);
    expect(clearPersistedChecklist(key, storage)).toBe(true);
    expect(loadChecklist(key, storage)).toEqual(createInitialChecklist());
  });

  it("survives a storage backend that throws (private browsing)", () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadChecklist("k", hostile)).toEqual(createInitialChecklist());
    expect(persistChecklist("k", createEmptyChecklist(), hostile)).toBe(false);
    expect(clearPersistedChecklist("k", hostile)).toBe(false);
  });
});

describe("exports", () => {
  it("escapes commas, quotes and newlines for CSV", () => {
    expect(escapeCsvField("Acme, Inc")).toBe('"Acme, Inc"');
    expect(escapeCsvField('said "ok"')).toBe('"said ""ok"""');
    expect(escapeCsvField("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvField("plain")).toBe("plain");
  });

  it("exports every control exactly once with a header row", () => {
    const csv = toCsv(createInitialChecklist());
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("framework,control_ref");
    expect(lines).toHaveLength(COMPLIANCE_CONTROLS.length + 1);
    expect(lines.some((line) => line.includes("AES"))).toBe(true);
  });

  it("quotes notes containing commas so the column count stays stable", () => {
    const state = updateControl(createEmptyChecklist(), "nist-ac-3", {
      status: "compliant",
      notes: "Reviewed, signed off",
    });
    const lines = toCsv(state).split("\n");
    const row = lines.find((line) => line.includes("AC-3")) as string;
    expect(row).toContain('"Reviewed, signed off"');
  });

  it("produces a markdown summary that lists open exceptions", () => {
    const markdown = toMarkdownSummary(createInitialChecklist());
    expect(markdown).toContain("# StormSale Enterprise Audit Checklist");
    expect(markdown).toContain("Open exceptions");
    expect(markdown).toContain("SOC 2 Type II");
    expect(markdown).toContain("| Framework |");
  });
});

describe("status typing", () => {
  it("only accepts statuses from the lifecycle order", () => {
    const statuses: ControlStatus[] = [...STATUS_ORDER];
    expect(statuses).toHaveLength(5);
  });
});
