/**
 * Regulatory sanctions screening (OFAC / Chainalysis) for connected wallet addresses.
 *
 * Sources, checked in order:
 *  1. Local deny-list: `VITE_SANCTIONED_ADDRESSES` (comma separated) plus runtime additions.
 *  2. Chainalysis public sanctions screening API when `VITE_CHAINALYSIS_API_KEY` is set.
 *
 * Every screening is recorded in a compliance log (timestamp + result).
 */

export type ScreeningResult = "clear" | "flagged" | "error";

export interface ComplianceLogEntry {
  address: string;
  result: ScreeningResult;
  source: "local-list" | "chainalysis";
  context: string;
  timestamp: string;
  detail?: string;
}

export const COMPLIANCE_LOG_KEY = "stormsale_compliance_log";
const MAX_LOG_ENTRIES = 500;
const CHAINALYSIS_URL = "https://public.chainalysis.com/api/v1/address";

export const COMPLIANCE_CONTACT: string =
  import.meta.env?.VITE_COMPLIANCE_CONTACT || "the StormSale compliance team";

const sanctionedAddresses = new Set<string>(
  String(import.meta.env?.VITE_SANCTIONED_ADDRESSES || "")
    .split(",")
    .map((a) => a.trim().toUpperCase())
    .filter(Boolean),
);

/** Adds addresses to the in-memory deny-list (e.g. from a refreshed OFAC feed). */
export function addSanctionedAddresses(addresses: string[]): void {
  for (const a of addresses) sanctionedAddresses.add(a.trim().toUpperCase());
}

export function clearSanctionedAddresses(): void {
  sanctionedAddresses.clear();
}

export class SanctionedAddressError extends Error {
  readonly address: string;
  constructor(address: string) {
    super(
      `Compliance warning: wallet ${address} matches a sanctioned entity (OFAC / Chainalysis) and cannot be used on StormSale. If you believe this is an error, contact ${COMPLIANCE_CONTACT}.`,
    );
    this.name = "SanctionedAddressError";
    this.address = address;
  }
}

export function getComplianceLog(): ComplianceLogEntry[] {
  try {
    const raw = localStorage.getItem(COMPLIANCE_LOG_KEY);
    return raw ? (JSON.parse(raw) as ComplianceLogEntry[]) : [];
  } catch {
    return [];
  }
}

function appendComplianceLog(entry: ComplianceLogEntry): void {
  console.info(
    `[Compliance] ${entry.timestamp} ${entry.address} -> ${entry.result} (${entry.source}, ${entry.context})`,
  );
  try {
    const log = [...getComplianceLog(), entry].slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(COMPLIANCE_LOG_KEY, JSON.stringify(log));
  } catch {
    // Storage unavailable; the console line above remains the record.
  }
}

async function queryChainalysis(address: string): Promise<boolean> {
  const res = await fetch(`${CHAINALYSIS_URL}/${encodeURIComponent(address)}`, {
    headers: { "X-API-Key": import.meta.env.VITE_CHAINALYSIS_API_KEY, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Chainalysis API responded ${res.status}`);
  const body = (await res.json()) as { identifications?: unknown[] };
  return Array.isArray(body.identifications) && body.identifications.length > 0;
}

/**
 * Screens an address and records the outcome in the compliance log.
 * Lookup failures are logged as "error" and do not block the user (fail-open),
 * since the local deny-list has already been applied.
 */
export async function screenAddress(
  address: string,
  context = "unspecified",
): Promise<ScreeningResult> {
  const timestamp = new Date().toISOString();
  const log = (result: ScreeningResult, source: ComplianceLogEntry["source"], detail?: string) =>
    appendComplianceLog({ address, result, source, context, timestamp, detail });

  if (sanctionedAddresses.has(address.trim().toUpperCase())) {
    log("flagged", "local-list");
    return "flagged";
  }

  if (import.meta.env?.VITE_CHAINALYSIS_API_KEY) {
    try {
      if (await queryChainalysis(address)) {
        log("flagged", "chainalysis");
        return "flagged";
      }
      log("clear", "chainalysis");
      return "clear";
    } catch (err) {
      log("error", "chainalysis", err instanceof Error ? err.message : String(err));
      return "error";
    }
  }

  log("clear", "local-list");
  return "clear";
}

/** Throws SanctionedAddressError when the address is flagged. */
export async function assertNotSanctioned(address: string, context: string): Promise<void> {
  if ((await screenAddress(address, context)) === "flagged") {
    throw new SanctionedAddressError(address);
  }
}
