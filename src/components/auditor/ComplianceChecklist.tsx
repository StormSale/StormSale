import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useNotification } from "../../context/NotificationContext";
import { useWeb3 } from "../../hooks/useWeb3";
import { cn } from "../../lib/utils";
import {
  COMPLIANCE_CONTROLS,
  COMPLIANCE_FRAMEWORKS,
  READINESS_META,
  SEVERITY_META,
  SEVERITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
  clearPersistedChecklist,
  controlsForFramework,
  cycleStatus,
  filterControls,
  getControlState,
  getFramework,
  loadChecklist,
  markFramework,
  persistChecklist,
  resetChecklist,
  storageKeyFor,
  summarizeChecklist,
  summarizeControls,
  summarizeFrameworks,
  toCsv,
  toMarkdownSummary,
  updateControl,
  weightedScore,
  type ChecklistState,
  type ComplianceControl,
  type ControlSeverity,
  type ControlStatus,
  type FrameworkAccent,
  type Readiness,
} from "../../lib/complianceChecklist";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Download,
  FileDown,
  Gauge,
  Link2,
  ListChecks,
  MinusCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Presentation maps
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<
  ControlStatus,
  { badge: string; dot: string; icon: ComponentType<{ className?: string }> }
> = {
  "not-assessed": {
    badge: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300",
    dot: "bg-slate-400",
    icon: CircleDashed,
  },
  "in-progress": {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
    dot: "bg-sky-500",
    icon: RotateCcw,
  },
  compliant: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
  },
  exception: {
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    dot: "bg-rose-500",
    icon: AlertTriangle,
  },
  "not-applicable": {
    badge: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    dot: "bg-zinc-400",
    icon: MinusCircle,
  },
};

const ACCENT_STYLES: Record<FrameworkAccent, { bar: string; active: string; icon: string }> = {
  indigo: {
    bar: "bg-indigo-500",
    active: "bg-indigo-600 border-indigo-600 text-white",
    icon: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  emerald: {
    bar: "bg-emerald-500",
    active: "bg-emerald-600 border-emerald-600 text-white",
    icon: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  sky: {
    bar: "bg-sky-500",
    active: "bg-sky-600 border-sky-600 text-white",
    icon: "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  amber: {
    bar: "bg-amber-500",
    active: "bg-amber-600 border-amber-600 text-white",
    icon: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  violet: {
    bar: "bg-violet-500",
    active: "bg-violet-600 border-violet-600 text-white",
    icon: "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  rose: {
    bar: "bg-rose-500",
    active: "bg-rose-600 border-rose-600 text-white",
    icon: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
};

const SEVERITY_STYLES: Record<ControlSeverity, string> = {
  critical:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
  high: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  medium:
    "bg-slate-50 text-slate-600 border-slate-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700",
};

const READINESS_STYLES: Record<Readiness, { badge: string; bar: string }> = {
  ready: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  "in-review": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  "at-risk": {
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
    bar: "bg-rose-500",
  },
};

function formatTimestamp(value: string | null): string {
  if (!value) return "Never reviewed";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadFile(filename: string, content: string, mimeType: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ComplianceChecklist = () => {
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const storageKey = storageKeyFor(userAddress);
  const [loadedKey, setLoadedKey] = useState(storageKey);
  const [checklist, setChecklist] = useState<ChecklistState>(() => loadChecklist(storageKey));
  const [activeFramework, setActiveFramework] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<ControlStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<ControlSeverity | "all">("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Reset the checklist when the connected auditor identity changes (render-phase state sync).
  if (loadedKey !== storageKey) {
    setLoadedKey(storageKey);
    setChecklist(() => loadChecklist(storageKey));
    setExpandedId(null);
  }

  // Debounced so typing in a notes field does not write the whole checklist on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => persistChecklist(loadedKey, checklist), 300);
    return () => clearTimeout(timer);
  }, [loadedKey, checklist]);

  const overall = useMemo(() => summarizeChecklist(checklist), [checklist]);
  const score = useMemo(() => weightedScore(checklist), [checklist]);
  const frameworkSummaries = useMemo(() => summarizeFrameworks(checklist), [checklist]);

  const visibleControls = useMemo(() => {
    const scope =
      activeFramework === "all" ? COMPLIANCE_CONTROLS : controlsForFramework(activeFramework);
    return filterControls(
      scope,
      { status: statusFilter, severity: severityFilter, query },
      checklist,
    );
  }, [activeFramework, statusFilter, severityFilter, query, checklist]);

  const groupedControls = useMemo(() => {
    return COMPLIANCE_FRAMEWORKS.map((framework) => ({
      framework,
      controls: visibleControls.filter((control) => control.frameworkId === framework.id),
    })).filter((group) => group.controls.length > 0);
  }, [visibleControls]);

  const activeFilterCount =
    (activeFramework === "all" ? 0 : 1) +
    (statusFilter === "all" ? 0 : 1) +
    (severityFilter === "all" ? 0 : 1) +
    (query.trim() ? 1 : 0);

  const applyStatus = (control: ComplianceControl, status: ControlStatus) => {
    setChecklist((prev) => updateControl(prev, control.id, { status }));
    if (status === "exception") {
      showNotification({
        type: "warning",
        title: `Exception recorded · ${control.ref}`,
        message: `${control.title} needs a remediation note before attestation.`,
      });
    }
  };

  const toggleAttestation = (control: ComplianceControl) => {
    const current = getControlState(checklist, control.id).status;
    applyStatus(control, current === "compliant" ? "not-assessed" : "compliant");
  };

  const updateField = (
    control: ComplianceControl,
    patch: { notes?: string; evidenceUrl?: string; reviewer?: string },
  ) => {
    setChecklist((prev) => updateControl(prev, control.id, patch));
  };

  const attestFramework = (frameworkId: string) => {
    const framework = getFramework(frameworkId);
    setChecklist((prev) => markFramework(prev, frameworkId, "compliant"));
    showNotification({
      type: "success",
      title: "Framework attested",
      message: `All applicable ${framework?.shortName ?? frameworkId} controls marked compliant.`,
    });
  };

  const clearFramework = (frameworkId: string) => {
    const framework = getFramework(frameworkId);
    setChecklist((prev) => markFramework(prev, frameworkId, "not-assessed"));
    showNotification({
      type: "info",
      title: "Framework reset",
      message: `${framework?.shortName ?? frameworkId} controls returned to not assessed.`,
    });
  };

  const resetAll = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset every control to Not Assessed?")) {
      return;
    }
    clearPersistedChecklist(loadedKey);
    setChecklist(resetChecklist());
    setExpandedId(null);
    showNotification({
      type: "info",
      title: "Checklist reset",
      message: "All assessment progress for this auditor key was cleared.",
    });
  };

  const exportJson = () => {
    downloadFile(
      `stormsale-audit-checklist-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        { schemaVersion: 1, generatedAt: new Date().toISOString(), controls: checklist },
        null,
        2,
      ),
      "application/json",
    );
    showNotification({
      type: "success",
      title: "Export ready",
      message: "Checklist exported as JSON.",
    });
  };

  const exportCsv = () => {
    downloadFile(
      `stormsale-audit-checklist-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(checklist),
      "text/csv",
    );
    showNotification({
      type: "success",
      title: "Export ready",
      message: "Checklist exported as CSV for the audit workpapers.",
    });
  };

  const exportMarkdown = () => {
    downloadFile(
      `stormsale-audit-summary-${new Date().toISOString().slice(0, 10)}.md`,
      toMarkdownSummary(checklist),
      "text/markdown",
    );
    showNotification({
      type: "success",
      title: "Summary ready",
      message: "Markdown audit summary downloaded.",
    });
  };

  const readinessMeta = READINESS_META[overall.readiness];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
            Enterprise Audit Checklist
            <ClipboardCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium max-w-2xl">
            Work each {COMPLIANCE_CONTROLS.length}-control enterprise framework, record evidence and
            raise exceptions. Progress is kept locally for the connected auditor key.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={resetAll}
            className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            variant="outline"
            onClick={exportMarkdown}
            className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Summary
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button
            onClick={exportJson}
            className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/80 lg:col-span-2 overflow-hidden">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Severity-weighted readiness
                  </span>
                </div>
                <div className="text-4xl font-black text-zinc-900 dark:text-white mt-2">
                  {score}%
                </div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-2 max-w-md">
                  {readinessMeta.description}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full self-start",
                  READINESS_STYLES[overall.readiness].badge,
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {readinessMeta.label}
              </span>
            </div>

            <div className="space-y-2">
              <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    READINESS_STYLES[overall.readiness].bar,
                  )}
                  style={{ width: `${Math.max(score, 2)}%` }}
                  role="progressbar"
                  aria-valuenow={score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Severity-weighted compliance score"
                />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                <span>{overall.compliantPercent}% of applicable controls compliant</span>
                <span>{overall.coveragePercent}% assessed</span>
                <span>
                  {overall.applicable} applicable · {overall.notApplicable} out of scope
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
              {(
                [
                  ["compliant", overall.compliant],
                  ["in-progress", overall.inProgress],
                  ["exception", overall.exceptions],
                  ["not-assessed", overall.notAssessed],
                ] as [ControlStatus, number][]
              ).map(([status, count]) => {
                const Icon = STATUS_STYLES[status].icon;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
                    aria-pressed={statusFilter === status}
                    className={cn(
                      "text-left rounded-2xl border p-3 transition-colors",
                      statusFilter === status
                        ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10"
                        : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700",
                    )}
                  >
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      <Icon className="w-3.5 h-3.5" />
                      {STATUS_META[status].label}
                    </div>
                    <div className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-1">
                      {count}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/80">
          <CardHeader className="pb-4 pt-6 px-6">
            <div className="flex items-center gap-2.5">
              <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                Framework Coverage
              </CardTitle>
            </div>
            <CardDescription className="text-zinc-500 dark:text-zinc-400 text-xs">
              Compliant controls per standard
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-3.5">
            {frameworkSummaries.map(({ framework, summary }) => {
              const accent = ACCENT_STYLES[framework.accent];
              return (
                <button
                  key={framework.id}
                  type="button"
                  onClick={() =>
                    setActiveFramework(activeFramework === framework.id ? "all" : framework.id)
                  }
                  aria-pressed={activeFramework === framework.id}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    <span className="truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {framework.shortName} {framework.revision}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {summary.compliant}/{summary.applicable}
                      {summary.exceptions > 0 && (
                        <span className="text-rose-600 dark:text-rose-400">
                          {" "}
                          · {summary.exceptions} exc
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", accent.bar)}
                      style={{ width: `${summary.compliantPercent}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/60">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search controls, references, owners or notes…"
                aria-label="Search controls"
                className="h-11 pl-11 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <label className="flex-1">
                <span className="sr-only">Filter by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as ControlStatus | "all")}
                  className="h-11 w-full min-w-[9rem] rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
                >
                  <option value="all">All statuses</option>
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="sr-only">Filter by severity</span>
                <select
                  value={severityFilter}
                  onChange={(event) =>
                    setSeverityFilter(event.target.value as ControlSeverity | "all")
                  }
                  className="h-11 w-full min-w-[9rem] rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
                >
                  <option value="all">All severities</option>
                  {SEVERITY_ORDER.map((severity) => (
                    <option key={severity} value={severity}>
                      {SEVERITY_META[severity].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFramework("all")}
              aria-pressed={activeFramework === "all"}
              className={cn(
                "px-3 py-1.5 rounded-full border text-xs font-bold transition-colors",
                activeFramework === "all"
                  ? "bg-zinc-900 border-zinc-900 text-white dark:bg-indigo-600 dark:border-indigo-600"
                  : "border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-slate-300",
              )}
            >
              All standards
            </button>
            {COMPLIANCE_FRAMEWORKS.map((framework) => (
              <button
                key={framework.id}
                type="button"
                onClick={() => setActiveFramework(framework.id)}
                aria-pressed={activeFramework === framework.id}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs font-bold transition-colors",
                  activeFramework === framework.id
                    ? ACCENT_STYLES[framework.accent].active
                    : "border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-slate-300",
                )}
              >
                {framework.shortName}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveFramework("all");
                  setStatusFilter("all");
                  setSeverityFilter("all");
                  setQuery("");
                }}
                className="px-3 py-1.5 rounded-full text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </button>
            )}
            <span className="ml-auto text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {visibleControls.length} of {COMPLIANCE_CONTROLS.length} controls shown
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Checklist groups */}
      {groupedControls.length === 0 && (
        <Card className="border border-dashed border-slate-300 dark:border-zinc-700 rounded-3xl bg-white dark:bg-zinc-900/40">
          <CardContent className="p-10 text-center space-y-2">
            <ListChecks className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="font-bold text-zinc-800 dark:text-zinc-100">
              No controls match your filters
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Adjust or clear the filters to see the rest of the checklist.
            </p>
          </CardContent>
        </Card>
      )}

      {groupedControls.map(({ framework, controls }) => {
        const summary = summarizeControls(controlsForFramework(framework.id), checklist);
        const accent = ACCENT_STYLES[framework.accent];
        return (
          <Card
            key={framework.id}
            className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden"
          >
            <CardHeader className="pt-8 px-6 sm:px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                      accent.icon,
                    )}
                  >
                    <BadgeCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                      {framework.name} <span className="text-zinc-400">{framework.revision}</span>
                    </CardTitle>
                    <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                      {framework.scope}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {summary.compliant}/{summary.applicable} compliant
                    </span>
                    {summary.exceptions > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                        {summary.exceptions} exception{summary.exceptions > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => clearFramework(framework.id)}
                    className="h-9 rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-semibold"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => attestFramework(framework.id)}
                    className="h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Attest all
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                {controls.map((control) => {
                  const entry = getControlState(checklist, control.id);
                  const statusStyle = STATUS_STYLES[entry.status];
                  const StatusIcon = statusStyle.icon;
                  const isExpanded = expandedId === control.id;
                  return (
                    <div key={control.id} className="px-6 sm:px-8 py-5">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={entry.status === "compliant"}
                          aria-label={`Mark ${control.ref} ${control.title} as compliant`}
                          onClick={() => toggleAttestation(control)}
                          className={cn(
                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                            entry.status === "compliant"
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-slate-300 dark:border-zinc-600 hover:border-indigo-500",
                          )}
                        >
                          {entry.status === "compliant" && <CheckCircle2 className="w-4 h-4" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                              {control.ref}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border",
                                SEVERITY_STYLES[control.severity],
                              )}
                            >
                              {SEVERITY_META[control.severity].label}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full",
                                statusStyle.badge,
                              )}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {STATUS_META[entry.status].label}
                            </span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              {formatTimestamp(entry.updatedAt)}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white mt-2">
                            {control.title}
                          </h4>
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed max-w-2xl">
                            {control.requirement}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="w-3 h-3" />
                              {control.owner}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Link2 className="w-3 h-3" />
                              {control.evidenceHint}
                            </span>
                          </div>
                          {entry.notes && !isExpanded && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 italic truncate max-w-2xl">
                              “{entry.notes}”
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 sm:flex-col sm:items-end shrink-0">
                          <label className="sr-only" htmlFor={`status-${control.id}`}>
                            Status for {control.ref}
                          </label>
                          <select
                            id={`status-${control.id}`}
                            value={entry.status}
                            onChange={(event) =>
                              applyStatus(control, event.target.value as ControlStatus)
                            }
                            className="h-9 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2 text-xs font-bold text-zinc-700 dark:text-zinc-200"
                          >
                            {STATUS_ORDER.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_META[status].label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => applyStatus(control, cycleStatus(entry.status))}
                            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            title="Advance to the next status"
                          >
                            Cycle
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : control.id)}
                            aria-expanded={isExpanded}
                            className="h-9 w-9 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                            title={isExpanded ? "Hide evidence panel" : "Record evidence"}
                          >
                            <ChevronDown
                              className={cn(
                                "w-4 h-4 transition-transform",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 ml-0 sm:ml-10 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60 p-4 sm:p-5 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="space-y-1.5 block">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                Reviewer
                              </span>
                              <Input
                                value={entry.reviewer}
                                onChange={(event) =>
                                  updateField(control, { reviewer: event.target.value })
                                }
                                placeholder="Auditor name or public key"
                                className="h-10 border-slate-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 text-xs"
                              />
                            </label>
                            <label className="space-y-1.5 block">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                Evidence reference
                              </span>
                              <Input
                                value={entry.evidenceUrl}
                                onChange={(event) =>
                                  updateField(control, { evidenceUrl: event.target.value })
                                }
                                placeholder="ledger tx hash, ticket or document link"
                                className="h-10 border-slate-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 text-xs"
                              />
                            </label>
                          </div>
                          <label className="space-y-1.5 block">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              Assessment notes
                            </span>
                            <textarea
                              value={entry.notes}
                              onChange={(event) =>
                                updateField(control, { notes: event.target.value })
                              }
                              rows={3}
                              placeholder={`How was this satisfied? Expected evidence: ${control.evidenceHint}`}
                              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-xs font-medium text-zinc-700 dark:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            />
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              Last updated {formatTimestamp(entry.updatedAt)}
                            </span>
                            <div className="ml-auto flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => applyStatus(control, "not-applicable")}
                                className="h-8 rounded-lg text-[11px] font-bold border-slate-200 dark:border-zinc-800"
                              >
                                Out of scope
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => applyStatus(control, "exception")}
                                className="h-8 rounded-lg text-[11px] font-bold border-rose-200 text-rose-600 dark:border-rose-500/30 dark:text-rose-400"
                              >
                                Raise exception
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => applyStatus(control, "compliant")}
                                className="h-8 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                              >
                                Mark compliant
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
        <CardContent className="p-6 flex items-start gap-4">
          <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-zinc-900 dark:text-white text-sm">
              Local draft, on-chain evidence
            </p>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Assessment notes are drafted in this browser under the connected auditor key. Evidence
              references point at ledger transactions, so the attestation itself stays verifiable on
              the Stellar network.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
