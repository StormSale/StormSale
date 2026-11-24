export interface DisputeTicket {
  id: string;
  txHash: string;
  orderId?: string;
  reason: string;
  description: string;
  amount: string;
  status: "OPEN" | "RESOLVED" | "REJECTED";
  createdAt: number;
  slaDeadline: number; // 48h from createdAt
  resolvedAt?: number;
}

const STORAGE_KEY = "stormsale.disputes";

export function getDisputes(): DisputeTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveDisputes(disputes: DisputeTicket[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(disputes));
    window.dispatchEvent(new CustomEvent("stormsale:disputes:updated"));
  } catch {
    // ignore
  }
}

export function createDisputeTicket(input: {
  txHash: string;
  orderId?: string;
  reason: string;
  description: string;
  amount?: string;
}): DisputeTicket {
  const disputes = getDisputes();
  const now = Date.now();
  const newTicket: DisputeTicket = {
    id: `disp-${now}-${Math.random().toString(36).substring(2, 6)}`,
    txHash: input.txHash.trim(),
    orderId: input.orderId?.trim() || "101",
    reason: input.reason || "unpaid_commission",
    description: input.description.trim(),
    amount: input.amount || "120 XLM",
    status: "OPEN",
    createdAt: now,
    slaDeadline: now + 48 * 60 * 60 * 1000,
  };
  disputes.unshift(newTicket);
  saveDisputes(disputes);
  return newTicket;
}

export function acceptDisputeTicket(id: string): DisputeTicket | null {
  const disputes = getDisputes();
  const ticket = disputes.find((d) => d.id === id);
  if (!ticket) return null;
  ticket.status = "RESOLVED";
  ticket.resolvedAt = Date.now();
  saveDisputes(disputes);
  return ticket;
}
