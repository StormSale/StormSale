/**
 * StormSale Emergency Kill-Switch & Protocol Pause Manager
 * Governs platform-wide and granular Soroban contract pause states.
 */

export interface ContractPauseState {
  isGlobalPaused: boolean;
  pausedContracts: {
    CAMPAIGN_ESCROW: boolean;
    AFFILIATE_PAYOUTS: boolean;
    BATCH_LOGGING: boolean;
  };
  lastUpdated: string;
  updatedBy: string;
}

export interface EmergencyAuditLog {
  id: string;
  timestamp: string;
  adminAddress: string;
  action: "GLOBAL_PAUSE" | "GLOBAL_RESUME" | "CONTRACT_PAUSE" | "CONTRACT_RESUME";
  targetContract?: string;
  reason: string;
}

export const EMERGENCY_PAUSE_STORAGE_KEY = "stormsale.emergency_pause_state";
export const EMERGENCY_LOGS_STORAGE_KEY = "stormsale.emergency_audit_logs";

const DEFAULT_PAUSE_STATE: ContractPauseState = {
  isGlobalPaused: false,
  pausedContracts: {
    CAMPAIGN_ESCROW: false,
    AFFILIATE_PAYOUTS: false,
    BATCH_LOGGING: false,
  },
  lastUpdated: new Date().toISOString(),
  updatedBy: "System",
};

const listeners = new Set<(state: ContractPauseState) => void>();

function safeStorageGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeStorageSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to persist ${key}:`, err);
  }
}

export function getEmergencyPauseState(): ContractPauseState {
  const stored = safeStorageGet<ContractPauseState>(
    EMERGENCY_PAUSE_STORAGE_KEY,
    DEFAULT_PAUSE_STATE,
  );
  return {
    ...DEFAULT_PAUSE_STATE,
    ...stored,
    pausedContracts: {
      ...DEFAULT_PAUSE_STATE.pausedContracts,
      ...(stored.pausedContracts || {}),
    },
  };
}

export function getEmergencyAuditLogs(): EmergencyAuditLog[] {
  return safeStorageGet<EmergencyAuditLog[]>(EMERGENCY_LOGS_STORAGE_KEY, [
    {
      id: "log-init",
      timestamp: new Date().toISOString(),
      adminAddress: "GAADMIN...INITIAL",
      action: "GLOBAL_RESUME",
      targetContract: "ALL",
      reason: "Protocol initialized in active operating state",
    },
  ]);
}

export function subscribeToEmergencyPause(
  listener: (state: ContractPauseState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(state: ContractPauseState) {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (e) {
      console.error("Error in emergency pause listener:", e);
    }
  });
}

function recordAuditLog(
  adminAddress: string,
  action: EmergencyAuditLog["action"],
  reason: string,
  targetContract?: string,
) {
  const currentLogs = getEmergencyAuditLogs();
  const newLog: EmergencyAuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    adminAddress,
    action,
    reason,
    targetContract,
  };
  safeStorageSet(EMERGENCY_LOGS_STORAGE_KEY, [newLog, ...currentLogs.slice(0, 49)]);
}

export function setGlobalEmergencyPause(
  paused: boolean,
  adminAddress: string,
  reason: string,
): ContractPauseState {
  const current = getEmergencyPauseState();
  const next: ContractPauseState = {
    ...current,
    isGlobalPaused: paused,
    lastUpdated: new Date().toISOString(),
    updatedBy: adminAddress,
  };

  safeStorageSet(EMERGENCY_PAUSE_STORAGE_KEY, next);
  recordAuditLog(
    adminAddress,
    paused ? "GLOBAL_PAUSE" : "GLOBAL_RESUME",
    reason || (paused ? "Emergency Global Halt Triggered" : "Emergency Global Halt Lifted"),
    "ALL_CONTRACTS",
  );
  notifyListeners(next);
  return next;
}

export function setContractPause(
  contractKey: keyof ContractPauseState["pausedContracts"],
  paused: boolean,
  adminAddress: string,
  reason: string,
): ContractPauseState {
  const current = getEmergencyPauseState();
  const next: ContractPauseState = {
    ...current,
    pausedContracts: {
      ...current.pausedContracts,
      [contractKey]: paused,
    },
    lastUpdated: new Date().toISOString(),
    updatedBy: adminAddress,
  };

  safeStorageSet(EMERGENCY_PAUSE_STORAGE_KEY, next);
  recordAuditLog(
    adminAddress,
    paused ? "CONTRACT_PAUSE" : "CONTRACT_RESUME",
    reason || `${contractKey} paused by administrator`,
    contractKey,
  );
  notifyListeners(next);
  return next;
}

export function isProtocolPaused(): boolean {
  return getEmergencyPauseState().isGlobalPaused;
}

export function isContractPaused(
  contractKey: keyof ContractPauseState["pausedContracts"],
): boolean {
  const state = getEmergencyPauseState();
  return state.isGlobalPaused || Boolean(state.pausedContracts[contractKey]);
}
