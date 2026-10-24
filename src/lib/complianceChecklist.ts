/**
 * Enterprise compliance checklist — data catalog, persistence model and pure helpers.
 *
 * The auditor console renders this catalog as an interactive checklist. All logic that can be
 * reasoned about without React lives here so it stays unit-testable (see complianceChecklist.test.ts).
 */

export const CHECKLIST_SCHEMA_VERSION = 1;

export const CHECKLIST_STORAGE_PREFIX = "stormsale:compliance-checklist";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ControlStatus =
  "not-assessed" | "in-progress" | "compliant" | "exception" | "not-applicable";

export type ControlSeverity = "critical" | "high" | "medium";

export type FrameworkAccent = "indigo" | "emerald" | "sky" | "amber" | "violet" | "rose";

export type Readiness = "ready" | "in-review" | "at-risk";

export interface ComplianceFramework {
  id: string;
  name: string;
  shortName: string;
  revision: string;
  scope: string;
  accent: FrameworkAccent;
}

export interface ComplianceControl {
  id: string;
  frameworkId: string;
  ref: string;
  title: string;
  requirement: string;
  severity: ControlSeverity;
  owner: string;
  evidenceHint: string;
}

export interface ControlState {
  status: ControlStatus;
  notes: string;
  evidenceUrl: string;
  reviewer: string;
  updatedAt: string | null;
}

export type ChecklistState = Record<string, ControlState>;

export interface ProgressSummary {
  total: number;
  applicable: number;
  compliant: number;
  inProgress: number;
  exceptions: number;
  notAssessed: number;
  notApplicable: number;
  /** Compliant controls as a percentage of applicable controls (0-100). */
  compliantPercent: number;
  /** Assessed controls (compliant + in-progress + exception) as a percentage of applicable. */
  coveragePercent: number;
  readiness: Readiness;
}

export interface ChecklistFilters {
  frameworkId?: string;
  status?: ControlStatus | "all";
  severity?: ControlSeverity | "all";
  query?: string;
}

export interface ParseResult {
  state: ChecklistState;
  warnings: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

export const STATUS_ORDER: ControlStatus[] = [
  "not-assessed",
  "in-progress",
  "compliant",
  "exception",
  "not-applicable",
];

export const STATUS_META: Record<
  ControlStatus,
  { label: string; shortLabel: string; description: string; assessed: boolean }
> = {
  "not-assessed": {
    label: "Not Assessed",
    shortLabel: "Open",
    description: "No evidence has been reviewed for this control yet.",
    assessed: false,
  },
  "in-progress": {
    label: "In Progress",
    shortLabel: "WIP",
    description: "Remediation or evidence collection is underway.",
    assessed: true,
  },
  compliant: {
    label: "Compliant",
    shortLabel: "Pass",
    description: "Control design and operating evidence satisfy the requirement.",
    assessed: true,
  },
  exception: {
    label: "Exception",
    shortLabel: "Exception",
    description: "A gap or deviation exists and needs a documented remediation plan.",
    assessed: true,
  },
  "not-applicable": {
    label: "Not Applicable",
    shortLabel: "N/A",
    description: "The control is out of scope for this deployment.",
    assessed: true,
  },
};

export const SEVERITY_ORDER: ControlSeverity[] = ["critical", "high", "medium"];

export const SEVERITY_META: Record<ControlSeverity, { label: string; weight: number }> = {
  critical: { label: "Critical", weight: 3 },
  high: { label: "High", weight: 2 },
  medium: { label: "Medium", weight: 1 },
};

export const READINESS_META: Record<Readiness, { label: string; description: string }> = {
  ready: {
    label: "Audit Ready",
    description: "No open exceptions and compliant coverage is at or above the attestation bar.",
  },
  "in-review": {
    label: "In Review",
    description: "Controls are being assessed; some gaps remain before attestation.",
  },
  "at-risk": {
    label: "At Risk",
    description: "Open exceptions or low compliant coverage block an enterprise attestation.",
  },
};

/** Minimum share of applicable controls that must be compliant for an "Audit Ready" verdict. */
export const READY_THRESHOLD = 90;
/** Below this share of compliant controls the checklist is considered at risk. */
export const REVIEW_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
  {
    id: "nist-800-53",
    name: "NIST SP 800-53",
    shortName: "NIST",
    revision: "Rev. 5",
    scope: "Federal access control, audit and cryptography control families",
    accent: "indigo",
  },
  {
    id: "iso-27001",
    name: "ISO/IEC 27001",
    shortName: "ISO 27001",
    revision: "2022",
    scope: "Information security management system (Annex A controls)",
    accent: "emerald",
  },
  {
    id: "soc2",
    name: "SOC 2 Type II",
    shortName: "SOC 2",
    revision: "TSC 2017",
    scope: "Security, availability, confidentiality and privacy trust criteria",
    accent: "sky",
  },
  {
    id: "fips-140-2",
    name: "FIPS 140-2",
    shortName: "FIPS",
    revision: "CMVP",
    scope: "Cryptographic module validation for the encryption stack",
    accent: "violet",
  },
  {
    id: "gdpr-art32",
    name: "GDPR Article 32",
    shortName: "GDPR",
    revision: "2016/679",
    scope: "Security of processing and personal data breach obligations",
    accent: "amber",
  },
  {
    id: "pci-dss-4",
    name: "PCI DSS 4.0",
    shortName: "PCI DSS",
    revision: "v4.0.1",
    scope: "Payment channel cryptography, logging and access requirements",
    accent: "rose",
  },
];

export const COMPLIANCE_CONTROLS: ComplianceControl[] = [
  // --- NIST SP 800-53 -----------------------------------------------------
  {
    id: "nist-ac-3",
    frameworkId: "nist-800-53",
    ref: "AC-3",
    title: "Access enforcement on encrypted sale records",
    requirement:
      "Audit access to encrypted sale payloads is granted only after an on-chain key grant is verified for the auditor public key.",
    severity: "critical",
    owner: "Platform Security",
    evidenceHint: "Soroban grant transaction hash + access decision log",
  },
  {
    id: "nist-ac-6",
    frameworkId: "nist-800-53",
    ref: "AC-6",
    title: "Least privilege on audit sessions",
    requirement:
      "An auditor session can decrypt only the sale IDs explicitly delegated by the advertiser — no campaign-wide reads.",
    severity: "high",
    owner: "Platform Security",
    evidenceHint: "Delegation scope export per auditor key",
  },
  {
    id: "nist-au-12",
    frameworkId: "nist-800-53",
    ref: "AU-2 / AU-12",
    title: "Audit event generation and retention",
    requirement:
      "Verification, decryption and denial events are written to the immutable ledger with actor, target and timestamp.",
    severity: "critical",
    owner: "Compliance Officer",
    evidenceHint: "Ledger event IDs for a 30-day sample window",
  },
  {
    id: "nist-sc-8",
    frameworkId: "nist-800-53",
    ref: "SC-8",
    title: "Transmission confidentiality and integrity",
    requirement:
      "All RPC and Horizon traffic is TLS-only and bound to the enforced network passphrase to prevent cross-network replay.",
    severity: "high",
    owner: "Frontend Engineering",
    evidenceHint: "Endpoint configuration review + passphrase enforcement test",
  },
  {
    id: "nist-sc-13",
    frameworkId: "nist-800-53",
    ref: "SC-13",
    title: "Cryptographic protection of sale payloads",
    requirement:
      "Sale metadata is sealed with AES-256-GCM and authenticated before it is hashed to the ledger.",
    severity: "critical",
    owner: "Cryptography Lead",
    evidenceHint: "crypto.ts review + tamper-detection test result",
  },
  {
    id: "nist-ia-5",
    frameworkId: "nist-800-53",
    ref: "IA-5",
    title: "Auditor key lifecycle management",
    requirement:
      "Auditor public keys can be rotated and revoked, and revoked keys lose decryption ability immediately.",
    severity: "medium",
    owner: "Platform Security",
    evidenceHint: "Key rotation runbook + revocation drill record",
  },

  // --- ISO/IEC 27001 ------------------------------------------------------
  {
    id: "iso-a-5-15",
    frameworkId: "iso-27001",
    ref: "A.5.15",
    title: "Access control policy",
    requirement:
      "Role-based access rules for Advertiser, Affiliate and Auditor personas are documented, approved and reviewed annually.",
    severity: "high",
    owner: "Compliance Officer",
    evidenceHint: "Approved RBAC policy document with review date",
  },
  {
    id: "iso-a-8-24",
    frameworkId: "iso-27001",
    ref: "A.8.24",
    title: "Use of cryptography",
    requirement:
      "Cipher suites, key sizes and key encapsulation methods follow a documented cryptography standard.",
    severity: "critical",
    owner: "Cryptography Lead",
    evidenceHint: "Cryptography standard + ECDH encapsulation design note",
  },
  {
    id: "iso-a-5-34",
    frameworkId: "iso-27001",
    ref: "A.5.34",
    title: "Privacy and protection of PII",
    requirement:
      "Customer identifiers are pseudonymised before sealing; no raw PII is written on-chain or in analytics.",
    severity: "high",
    owner: "Data Protection Officer",
    evidenceHint: "Pseudonymisation mapping + on-chain payload sample",
  },
  {
    id: "iso-a-8-15",
    frameworkId: "iso-27001",
    ref: "A.8.15",
    title: "Logging and monitoring",
    requirement:
      "Denied access attempts and failed decryptions raise alerts that are triaged within the documented SLA.",
    severity: "high",
    owner: "DevOps / Release",
    evidenceHint: "Alert rule export + triage ticket sample",
  },
  {
    id: "iso-a-5-23",
    frameworkId: "iso-27001",
    ref: "A.5.23",
    title: "Security of cloud services",
    requirement:
      "Third-party infrastructure (RPC providers, hosting, database) is inventoried with an owner and security review.",
    severity: "medium",
    owner: "DevOps / Release",
    evidenceHint: "Vendor inventory with review dates",
  },
  {
    id: "iso-a-8-28",
    frameworkId: "iso-27001",
    ref: "A.8.28",
    title: "Secure coding principles",
    requirement:
      "Linting, type checks, dependency scanning and secret scanning gate every merge into the release branch.",
    severity: "medium",
    owner: "Frontend Engineering",
    evidenceHint: "CI workflow definitions + last green pipeline",
  },

  // --- SOC 2 Type II ------------------------------------------------------
  {
    id: "soc2-cc6-1",
    frameworkId: "soc2",
    ref: "CC6.1",
    title: "Logical access security",
    requirement:
      "Wallet authentication is the only credential path and session scope is re-evaluated on every privileged action.",
    severity: "critical",
    owner: "Platform Security",
    evidenceHint: "Access control test results across two audit periods",
  },
  {
    id: "soc2-cc6-7",
    frameworkId: "soc2",
    ref: "CC6.7",
    title: "Data transmission and disposal",
    requirement:
      "Confidential data is encrypted in transit and in rest, and disposal of test data is documented.",
    severity: "high",
    owner: "DevOps / Release",
    evidenceHint: "Encryption inventory + test data disposal procedure",
  },
  {
    id: "soc2-cc7-2",
    frameworkId: "soc2",
    ref: "CC7.2",
    title: "Security event monitoring",
    requirement:
      "Monitoring covers anomalous decryption volume and repeated denial attempts per auditor key.",
    severity: "high",
    owner: "DevOps / Release",
    evidenceHint: "Monitoring dashboard screenshot + threshold definition",
  },
  {
    id: "soc2-a1-2",
    frameworkId: "soc2",
    ref: "A1.2",
    title: "Availability commitments and resilience",
    requirement:
      "RPC outage handling degrades gracefully and documented recovery objectives are validated.",
    severity: "medium",
    owner: "DevOps / Release",
    evidenceHint: "Failover drill report + RTO/RPO statement",
  },
  {
    id: "soc2-cc8-1",
    frameworkId: "soc2",
    ref: "CC8.1",
    title: "Change management",
    requirement:
      "Every release is peer reviewed, tested in CI and traceable to an approved change record.",
    severity: "high",
    owner: "Frontend Engineering",
    evidenceHint: "Pull request template + CI check output",
  },
  {
    id: "soc2-p6-1",
    frameworkId: "soc2",
    ref: "P6.1",
    title: "Privacy notice and consent",
    requirement:
      "The privacy notice describes on-chain data handling and consent is recorded before each sale is sealed.",
    severity: "medium",
    owner: "Data Protection Officer",
    evidenceHint: "Published privacy notice URL + consent capture flow",
  },

  // --- FIPS 140-2 ---------------------------------------------------------
  {
    id: "fips-module-validation",
    frameworkId: "fips-140-2",
    ref: "CMVP-1",
    title: "Cryptographic module validation",
    requirement:
      "AES-256-GCM sealing is performed by a validated module (WebCrypto SubtleCrypto) rather than hand-rolled primitives.",
    severity: "critical",
    owner: "Cryptography Lead",
    evidenceHint: "Module certificate reference + API call inventory",
  },
  {
    id: "fips-key-derivation",
    frameworkId: "fips-140-2",
    ref: "CMVP-2",
    title: "Key derivation and encapsulation",
    requirement:
      "Auditor keys are wrapped using ECDH P-256 with a KDF that binds the sale ID and campaign contract.",
    severity: "critical",
    owner: "Cryptography Lead",
    evidenceHint: "KDF specification + known-answer test vector",
  },
  {
    id: "fips-rng-iv",
    frameworkId: "fips-140-2",
    ref: "CMVP-3",
    title: "Randomness and IV uniqueness",
    requirement:
      "Initialisation vectors are generated by a CSPRNG and never reused across payloads for the same key.",
    severity: "high",
    owner: "Cryptography Lead",
    evidenceHint: "IV generation code path + collision test result",
  },
  {
    id: "fips-self-test",
    frameworkId: "fips-140-2",
    ref: "CMVP-4",
    title: "Integrity and self-tests",
    requirement:
      "Integrity checks detect tampering with the encryption helper bundle before payload sealing.",
    severity: "medium",
    owner: "Frontend Engineering",
    evidenceHint: "Build integrity check + Subresource Integrity policy",
  },
  {
    id: "fips-key-zeroization",
    frameworkId: "fips-140-2",
    ref: "CMVP-5",
    title: "Key destruction and zeroization",
    requirement:
      "Derived plaintext keys are held only in memory for the duration of a decrypt and are not persisted to storage.",
    severity: "high",
    owner: "Frontend Engineering",
    evidenceHint: "Storage audit showing no key material at rest",
  },

  // --- GDPR Article 32 ----------------------------------------------------
  {
    id: "gdpr-32-1-a",
    frameworkId: "gdpr-art32",
    ref: "32(1)(a)",
    title: "Pseudonymisation and encryption",
    requirement:
      "Personal data in sale records is pseudonymised and encrypted, with keys only delegated to authorised auditors.",
    severity: "critical",
    owner: "Data Protection Officer",
    evidenceHint: "Records of processing + encryption design",
  },
  {
    id: "gdpr-32-1-b",
    frameworkId: "gdpr-art32",
    ref: "32(1)(b)",
    title: "Confidentiality, integrity and availability",
    requirement:
      "Controls keep processing systems resilient: signed transactions, replay protection and integrity checks on read.",
    severity: "high",
    owner: "Platform Security",
    evidenceHint: "Control matrix mapped to CIA objectives",
  },
  {
    id: "gdpr-32-1-d",
    frameworkId: "gdpr-art32",
    ref: "32(1)(d)",
    title: "Regular testing and evaluation",
    requirement:
      "The encryption and access flow is tested on a scheduled cadence and findings are tracked to closure.",
    severity: "medium",
    owner: "Compliance Officer",
    evidenceHint: "Test schedule + open findings register",
  },
  {
    id: "gdpr-33",
    frameworkId: "gdpr-art32",
    ref: "Art. 33",
    title: "Breach notification within 72 hours",
    requirement:
      "A documented breach playbook names the notifying party and the 72-hour supervisory authority deadline.",
    severity: "high",
    owner: "Data Protection Officer",
    evidenceHint: "Breach playbook + tabletop exercise notes",
  },
  {
    id: "gdpr-30",
    frameworkId: "gdpr-art32",
    ref: "Art. 30",
    title: "Records of processing activities",
    requirement:
      "Processing purposes, categories of data subjects and retention periods are recorded and kept current.",
    severity: "medium",
    owner: "Data Protection Officer",
    evidenceHint: "RoPA document with last-updated date",
  },
  {
    id: "gdpr-35",
    frameworkId: "gdpr-art32",
    ref: "Art. 35",
    title: "Data protection impact assessment",
    requirement:
      "A DPIA covers large-scale profiling of affiliate conversions and the on-chain publication of hashed records.",
    severity: "medium",
    owner: "Data Protection Officer",
    evidenceHint: "Signed DPIA with mitigation decisions",
  },

  // --- PCI DSS 4.0 --------------------------------------------------------
  {
    id: "pci-3-5",
    frameworkId: "pci-dss-4",
    ref: "Req 3.5",
    title: "No primary account numbers stored on-chain",
    requirement:
      "Card data never reaches the browser or the ledger; conversions carry only hashed, non-reversible references.",
    severity: "critical",
    owner: "Platform Security",
    evidenceHint: "Data-flow diagram + payload field inventory",
  },
  {
    id: "pci-4-2-1",
    frameworkId: "pci-dss-4",
    ref: "Req 4.2.1",
    title: "Strong cryptography for data in transit",
    requirement: "Only TLS 1.2+ with strong cipher suites is accepted by every outbound endpoint.",
    severity: "high",
    owner: "DevOps / Release",
    evidenceHint: "TLS scan report of configured endpoints",
  },
  {
    id: "pci-8-3",
    frameworkId: "pci-dss-4",
    ref: "Req 8.3",
    title: "Multi-factor authentication for administrative access",
    requirement:
      "Repository and infrastructure administration requires MFA and is limited to named maintainers.",
    severity: "high",
    owner: "DevOps / Release",
    evidenceHint: "Org MFA enforcement screenshot + admin roster",
  },
  {
    id: "pci-10-2",
    frameworkId: "pci-dss-4",
    ref: "Req 10.2",
    title: "Audit logging coverage",
    requirement:
      "All access to encrypted conversion records is logged with user identity, event type and outcome.",
    severity: "high",
    owner: "Compliance Officer",
    evidenceHint: "Log schema + sample entries for access and denial",
  },
  {
    id: "pci-12-3",
    frameworkId: "pci-dss-4",
    ref: "Req 12.3",
    title: "Targeted risk analysis",
    requirement:
      "Risks introduced by custom Web3 code are analysed at least annually and before each major release.",
    severity: "medium",
    owner: "Compliance Officer",
    evidenceHint: "Risk analysis record with residual risk statement",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getFramework(frameworkId: string): ComplianceFramework | undefined {
  return COMPLIANCE_FRAMEWORKS.find((framework) => framework.id === frameworkId);
}

export function controlsForFramework(frameworkId: string): ComplianceControl[] {
  return COMPLIANCE_CONTROLS.filter((control) => control.frameworkId === frameworkId);
}

export function getControl(controlId: string): ComplianceControl | undefined {
  return COMPLIANCE_CONTROLS.find((control) => control.id === controlId);
}

/** Default (untouched) state for a single control. */
export function emptyControlState(): ControlState {
  return { status: "not-assessed", notes: "", evidenceUrl: "", reviewer: "", updatedAt: null };
}

/** Full checklist where every control starts unassessed. */
export function createEmptyChecklist(): ChecklistState {
  return COMPLIANCE_CONTROLS.reduce<ChecklistState>((acc, control) => {
    acc[control.id] = emptyControlState();
    return acc;
  }, {});
}

export function getControlState(state: ChecklistState, controlId: string): ControlState {
  return state[controlId] ?? emptyControlState();
}

/**
 * Checklist seeded with the audit progress already described in the compliance report, so the
 * console has meaningful content on a first visit. Overwritten as soon as the auditor edits it.
 */
export function createInitialChecklist(): ChecklistState {
  const seeded: Array<[string, ControlStatus, string]> = [
    ["nist-ac-3", "compliant", "On-chain key grant verified for all 12 sampled sale records."],
    ["nist-au-12", "compliant", "Ledger events exported for the last 30 days."],
    ["nist-ac-6", "in-progress", "Delegation scope export still being reconciled."],
    ["iso-a-8-24", "compliant", "Cipher suite standard approved by the cryptography lead."],
    ["iso-a-8-15", "in-progress", "Alert rules drafted, triage SLA not yet signed off."],
    ["soc2-cc6-1", "compliant", "Wallet-only authentication confirmed across both audit periods."],
    ["soc2-p6-1", "exception", "Privacy notice still describes pre-migration on-chain fields."],
    ["fips-module-validation", "compliant", "SubtleCrypto AES-GCM path inventoried."],
    ["fips-rng-iv", "compliant", "IV collision test passed across 1M payloads."],
    ["gdpr-32-1-a", "compliant", "Pseudonymisation mapping reviewed by the DPO."],
    ["gdpr-30", "exception", "Processing register needs the new retention period."],
    ["pci-10-2", "in-progress", "Log schema review pending."],
  ];

  const state = createEmptyChecklist();
  seeded.forEach(([controlId, status, notes]) => {
    state[controlId] = {
      status,
      notes,
      evidenceUrl: "",
      reviewer: getControl(controlId)?.owner ?? "",
      updatedAt: "2026-05-16T09:00:00.000Z",
    };
  });
  return state;
}

// ---------------------------------------------------------------------------
// Mutations (immutable)
// ---------------------------------------------------------------------------

export function updateControl(
  state: ChecklistState,
  controlId: string,
  patch: Partial<Omit<ControlState, "updatedAt">>,
  now: string = new Date().toISOString(),
): ChecklistState {
  const current = getControlState(state, controlId);
  return {
    ...state,
    [controlId]: {
      ...current,
      ...patch,
      updatedAt: now,
    },
  };
}

/** Advance a status through the assessment lifecycle, wrapping back to the start. */
export function cycleStatus(status: ControlStatus): ControlStatus {
  const index = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
}

/**
 * Apply one status to every control of a framework. `not-applicable` controls are preserved
 * unless the target status is itself `not-applicable`, so scoping decisions are not overwritten.
 */
export function markFramework(
  state: ChecklistState,
  frameworkId: string,
  status: ControlStatus,
  now: string = new Date().toISOString(),
): ChecklistState {
  return controlsForFramework(frameworkId).reduce<ChecklistState>((acc, control) => {
    if (
      status !== "not-applicable" &&
      getControlState(acc, control.id).status === "not-applicable"
    ) {
      return acc;
    }
    return updateControl(acc, control.id, { status }, now);
  }, state);
}

export function resetChecklist(): ChecklistState {
  return createEmptyChecklist();
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function readinessFor(compliantPercent: number, exceptions: number): Readiness {
  if (exceptions > 0) return "at-risk";
  if (compliantPercent >= READY_THRESHOLD) return "ready";
  if (compliantPercent >= REVIEW_THRESHOLD) return "in-review";
  return "at-risk";
}

export function summarizeControls(
  controls: ComplianceControl[],
  state: ChecklistState,
): ProgressSummary {
  const counts = {
    compliant: 0,
    inProgress: 0,
    exceptions: 0,
    notAssessed: 0,
    notApplicable: 0,
  };

  controls.forEach((control) => {
    const status = getControlState(state, control.id).status;
    if (status === "compliant") counts.compliant += 1;
    else if (status === "in-progress") counts.inProgress += 1;
    else if (status === "exception") counts.exceptions += 1;
    else if (status === "not-applicable") counts.notApplicable += 1;
    else counts.notAssessed += 1;
  });

  const total = controls.length;
  const applicable = total - counts.notApplicable;
  const assessed = counts.compliant + counts.inProgress + counts.exceptions;
  const compliantPercent = applicable === 0 ? 0 : Math.round((counts.compliant / applicable) * 100);
  const coveragePercent = applicable === 0 ? 0 : Math.round((assessed / applicable) * 100);

  return {
    total,
    applicable,
    compliant: counts.compliant,
    inProgress: counts.inProgress,
    exceptions: counts.exceptions,
    notAssessed: counts.notAssessed,
    notApplicable: counts.notApplicable,
    compliantPercent,
    coveragePercent,
    readiness: readinessFor(compliantPercent, counts.exceptions),
  };
}

export function summarizeChecklist(state: ChecklistState): ProgressSummary {
  return summarizeControls(COMPLIANCE_CONTROLS, state);
}

/**
 * Severity-weighted compliance score: critical controls count three times, high twice.
 * Used for the headline gauge so a single open critical gap is visible.
 */
export function weightedScore(state: ChecklistState): number {
  let earned = 0;
  let possible = 0;
  COMPLIANCE_CONTROLS.forEach((control) => {
    const status = getControlState(state, control.id).status;
    if (status === "not-applicable") return;
    const weight = SEVERITY_META[control.severity].weight;
    possible += weight;
    if (status === "compliant") earned += weight;
    else if (status === "in-progress") earned += weight * 0.5;
  });
  return possible === 0 ? 0 : Math.round((earned / possible) * 100);
}

export interface FrameworkSummary {
  framework: ComplianceFramework;
  summary: ProgressSummary;
}

export function summarizeFrameworks(state: ChecklistState): FrameworkSummary[] {
  return COMPLIANCE_FRAMEWORKS.map((framework) => ({
    framework,
    summary: summarizeControls(controlsForFramework(framework.id), state),
  }));
}

export function openExceptions(state: ChecklistState): ComplianceControl[] {
  return COMPLIANCE_CONTROLS.filter(
    (control) => getControlState(state, control.id).status === "exception",
  );
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Case-insensitive search across reference, title, requirement, owner and notes. */
export function filterControls(
  controls: ComplianceControl[],
  filters: ChecklistFilters = {},
  state?: ChecklistState,
): ComplianceControl[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  return controls.filter((control) => {
    if (
      filters.frameworkId &&
      filters.frameworkId !== "all" &&
      control.frameworkId !== filters.frameworkId
    )
      return false;
    if (filters.severity && filters.severity !== "all" && control.severity !== filters.severity)
      return false;
    if (filters.status && filters.status !== "all") {
      const status = state ? getControlState(state, control.id).status : "not-assessed";
      if (status !== filters.status) return false;
    }
    if (!query) return true;
    const notes = state ? getControlState(state, control.id).notes : "";
    const haystack = [
      control.ref,
      control.title,
      control.requirement,
      control.owner,
      control.evidenceHint,
      getFramework(control.frameworkId)?.name ?? "",
      notes,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

// ---------------------------------------------------------------------------
// Persistence + export
// ---------------------------------------------------------------------------

export function storageKeyFor(actor: string | null | undefined): string {
  return `${CHECKLIST_STORAGE_PREFIX}:v${CHECKLIST_SCHEMA_VERSION}:${actor || "anonymous"}`;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isStatus(value: unknown): value is ControlStatus {
  return typeof value === "string" && (STATUS_ORDER as string[]).includes(value);
}

export function serializeChecklist(
  state: ChecklistState,
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(
    {
      schemaVersion: CHECKLIST_SCHEMA_VERSION,
      exportedAt,
      controls: state,
    },
    null,
    2,
  );
}

/**
 * Tolerant reader: unknown control ids are dropped, malformed fields fall back to defaults and
 * every issue is reported as a warning instead of throwing.
 */
export function parseChecklist(raw: string | null): ParseResult {
  const empty = createEmptyChecklist();
  if (!raw) return { state: empty, warnings: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      state: empty,
      warnings: ["Checklist payload is not valid JSON; starting from a blank slate."],
    };
  }

  const warnings: string[] = [];
  const container = parsed as { controls?: unknown; schemaVersion?: unknown } | null;
  const source = (
    container && typeof container === "object" && container.controls
      ? container.controls
      : container
  ) as Record<string, unknown> | null;

  if (!source || typeof source !== "object") {
    return {
      state: empty,
      warnings: ["Checklist payload has no control map; starting from a blank slate."],
    };
  }

  if (
    typeof container?.schemaVersion === "number" &&
    container.schemaVersion !== CHECKLIST_SCHEMA_VERSION
  ) {
    warnings.push(
      `Saved checklist used schema v${container.schemaVersion}; migrated to v${CHECKLIST_SCHEMA_VERSION}.`,
    );
  }

  const state: ChecklistState = { ...empty };
  let applied = 0;
  Object.entries(source).forEach(([controlId, value]) => {
    if (!getControl(controlId)) {
      warnings.push(`Ignored unknown control "${controlId}".`);
      return;
    }
    if (!value || typeof value !== "object") {
      warnings.push(`Ignored malformed entry for "${controlId}".`);
      return;
    }
    const entry = value as Partial<ControlState>;
    state[controlId] = {
      status: isStatus(entry.status) ? entry.status : "not-assessed",
      notes: typeof entry.notes === "string" ? entry.notes : "",
      evidenceUrl: typeof entry.evidenceUrl === "string" ? entry.evidenceUrl : "",
      reviewer: typeof entry.reviewer === "string" ? entry.reviewer : "",
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : null,
    };
    applied += 1;
  });

  if (applied === 0)
    warnings.push("No recognisable control entries found; starting from a blank slate.");
  return { state, warnings };
}

export function loadChecklist(
  key: string,
  storage: StorageLike | null = defaultStorage(),
): ChecklistState {
  if (!storage) return createInitialChecklist();
  try {
    const raw = storage.getItem(key);
    if (!raw) return createInitialChecklist();
    return parseChecklist(raw).state;
  } catch {
    return createInitialChecklist();
  }
}

export function persistChecklist(
  key: string,
  state: ChecklistState,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, serializeChecklist(state));
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedChecklist(
  key: string,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function escapeCsvField(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export const CSV_HEADERS = [
  "framework",
  "control_ref",
  "control_title",
  "severity",
  "status",
  "owner",
  "reviewer",
  "evidence",
  "notes",
  "updated_at",
];

export function toCsv(state: ChecklistState): string {
  const rows = COMPLIANCE_CONTROLS.map((control) => {
    const entry = getControlState(state, control.id);
    const framework = getFramework(control.frameworkId);
    return [
      framework ? `${framework.name} ${framework.revision}` : control.frameworkId,
      control.ref,
      control.title,
      SEVERITY_META[control.severity].label,
      STATUS_META[entry.status].label,
      control.owner,
      entry.reviewer,
      entry.evidenceUrl,
      entry.notes,
      entry.updatedAt ?? "",
    ]
      .map(escapeCsvField)
      .join(",");
  });
  return [CSV_HEADERS.join(","), ...rows].join("\n");
}

export function toMarkdownSummary(state: ChecklistState): string {
  const overall = summarizeChecklist(state);
  const lines = [
    "# StormSale Enterprise Audit Checklist",
    "",
    `- Overall readiness: **${READINESS_META[overall.readiness].label}** (${overall.compliantPercent}% of applicable controls compliant)`,
    `- Weighted severity score: **${weightedScore(state)}%**`,
    `- Compliant ${overall.compliant} · In progress ${overall.inProgress} · Exceptions ${overall.exceptions} · Not assessed ${overall.notAssessed} · N/A ${overall.notApplicable}`,
    "",
    "| Framework | Compliant | Exceptions | Open | Coverage |",
    "| :-------- | :-------- | :--------- | :--- | :------- |",
  ];

  summarizeFrameworks(state).forEach(({ framework, summary }) => {
    lines.push(
      `| ${framework.name} ${framework.revision} | ${summary.compliant}/${summary.applicable} | ${summary.exceptions} | ${summary.notAssessed} | ${summary.coveragePercent}% |`,
    );
  });

  const exceptions = openExceptions(state);
  if (exceptions.length > 0) {
    lines.push("", "## Open exceptions", "");
    exceptions.forEach((control) => {
      const entry = getControlState(state, control.id);
      lines.push(
        `- **${control.ref}** ${control.title} — ${entry.notes || "no remediation note recorded"} (${control.owner})`,
      );
    });
  }

  return lines.join("\n");
}
