export interface TransactionFlow {
  source: string;
  destination: string;
  amountXlm: number;
  timestamp: string;
  sourceRole?: string;
  destinationRole?: string;
  transactionHash?: string;
}

export interface NetworkNode {
  address: string;
  roles: string[];
  suspicious: boolean;
}

export interface NetworkEdge extends TransactionFlow {
  id: number;
  circular: boolean;
  sharedFunding: boolean;
  correlatedTiming: boolean;
}

export interface NetworkAnalysis {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  circularFlows: string[][];
  sharedFundingGroups: string[][];
  correlatedTimingGroups: number[][];
}

const MAX_TRANSACTIONS = 5000;
const MAX_CYCLE_LENGTH = 6;
const MAX_REPORTED_CYCLES = 250;
const CORRELATED_WINDOW_MS = 2 * 60 * 1000;

function normalizeFlow(value: unknown, index: number): TransactionFlow {
  if (!value || typeof value !== "object") {
    throw new Error(`Transaction ${index + 1} must be an object.`);
  }

  const row = value as Record<string, unknown>;
  const source = row.source ?? row.from ?? row.source_account;
  const destination = row.destination ?? row.to ?? row.destination_account;
  const amount = Number(row.amountXlm ?? row.amount ?? row.amount_xlm);
  const timestamp = row.timestamp ?? row.createdAt ?? row.created_at;

  if (typeof source !== "string" || source.trim().length === 0) {
    throw new Error(`Transaction ${index + 1} has no source account.`);
  }
  if (typeof destination !== "string" || destination.trim().length === 0) {
    throw new Error(`Transaction ${index + 1} has no destination account.`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Transaction ${index + 1} has an invalid XLM amount.`);
  }
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Transaction ${index + 1} has an invalid timestamp.`);
  }

  return {
    source: source.trim(),
    destination: destination.trim(),
    amountXlm: amount,
    timestamp: new Date(timestamp).toISOString(),
    sourceRole: typeof row.sourceRole === "string" ? row.sourceRole : undefined,
    destinationRole: typeof row.destinationRole === "string" ? row.destinationRole : undefined,
    transactionHash:
      typeof row.transactionHash === "string"
        ? row.transactionHash
        : typeof row.hash === "string"
          ? row.hash
          : undefined,
  };
}

export function parseTransactionFlows(payload: unknown): TransactionFlow[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "transactions" in payload
      ? (payload as { transactions: unknown }).transactions
      : null;

  if (!Array.isArray(rows)) {
    throw new Error("Expected a JSON array or an object with a transactions array.");
  }
  if (rows.length === 0 || rows.length > MAX_TRANSACTIONS) {
    throw new Error(`Import between 1 and ${MAX_TRANSACTIONS} transactions.`);
  }

  return rows.map(normalizeFlow);
}

export function analyzeTransactionFlows(flows: TransactionFlow[]): NetworkAnalysis {
  const roles = new Map<string, Set<string>>();
  const fundedAccounts = new Map<string, Set<string>>();
  const adjacency = new Map<string, Map<string, number[]>>();

  const edges: NetworkEdge[] = flows.map((flow, id) => {
    const sourceRoles = roles.get(flow.source) ?? new Set<string>();
    const destinationRoles = roles.get(flow.destination) ?? new Set<string>();
    if (flow.sourceRole) sourceRoles.add(flow.sourceRole);
    if (flow.destinationRole) destinationRoles.add(flow.destinationRole);
    roles.set(flow.source, sourceRoles);
    roles.set(flow.destination, destinationRoles);

    const recipients = fundedAccounts.get(flow.source) ?? new Set<string>();
    recipients.add(flow.destination);
    fundedAccounts.set(flow.source, recipients);

    const destinations = adjacency.get(flow.source) ?? new Map<string, number[]>();
    const edgeIds = destinations.get(flow.destination) ?? [];
    edgeIds.push(id);
    destinations.set(flow.destination, edgeIds);
    adjacency.set(flow.source, destinations);

    return { ...flow, id, circular: false, sharedFunding: false, correlatedTiming: false };
  });

  const sharedFundingGroups: string[][] = [];
  const sharedFundingSources = new Set<string>();
  for (const [fundingSource, destinations] of fundedAccounts) {
    if (destinations.size < 2) continue;
    sharedFundingSources.add(fundingSource);
    const accounts = [fundingSource, ...destinations].sort();
    sharedFundingGroups.push(accounts);
  }
  edges.forEach((edge) => (edge.sharedFunding = sharedFundingSources.has(edge.source)));

  const circularFlows: string[][] = [];
  const seenCycles = new Set<string>();
  const accounts = [...roles.keys()].sort();

  accounts.forEach((start, startIndex) => {
    const visit = (current: string, path: string[]) => {
      const nextAccounts = [...(adjacency.get(current)?.keys() ?? [])].sort();
      for (const next of nextAccounts) {
        if (circularFlows.length >= MAX_REPORTED_CYCLES) return;
        if (next === start && path.length >= 3) {
          const cycleKey = path.join("\u0000");
          if (seenCycles.has(cycleKey)) continue;
          seenCycles.add(cycleKey);
          const cycle = [...path, start];
          circularFlows.push(cycle);
          for (let i = 0; i < cycle.length - 1; i++) {
            for (const edgeId of adjacency.get(cycle[i])?.get(cycle[i + 1]) ?? []) {
              edges[edgeId].circular = true;
            }
          }
        } else if (
          path.length < MAX_CYCLE_LENGTH &&
          !path.includes(next) &&
          accounts.indexOf(next) >= startIndex
        ) {
          visit(next, [...path, next]);
        }
      }
    };
    visit(start, [start]);
  });

  const sortedEdgeIds = edges
    .map((edge) => edge.id)
    .sort((left, right) => Date.parse(edges[left].timestamp) - Date.parse(edges[right].timestamp));
  const sourceCounts = new Map<string, number>();
  const correlatedRanges = new Int32Array(sortedEdgeIds.length + 1);
  let right = 0;

  for (let left = 0; left < sortedEdgeIds.length; left++) {
    while (
      right < sortedEdgeIds.length &&
      Date.parse(edges[sortedEdgeIds[right]].timestamp) -
        Date.parse(edges[sortedEdgeIds[left]].timestamp) <=
        CORRELATED_WINDOW_MS
    ) {
      const source = edges[sortedEdgeIds[right]].source;
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      right++;
    }

    if (sourceCounts.size > 1) {
      correlatedRanges[left]++;
      correlatedRanges[right]--;
    }

    const leftSource = edges[sortedEdgeIds[left]].source;
    const nextCount = (sourceCounts.get(leftSource) ?? 1) - 1;
    if (nextCount === 0) sourceCounts.delete(leftSource);
    else sourceCounts.set(leftSource, nextCount);
  }

  let activeCorrelatedRangeCount = 0;
  const correlatedIds: number[] = [];
  correlatedRanges.forEach((rangeDelta, index) => {
    activeCorrelatedRangeCount += rangeDelta;
    if (index < sortedEdgeIds.length && activeCorrelatedRangeCount > 0) {
      const edgeId = sortedEdgeIds[index];
      edges[edgeId].correlatedTiming = true;
      correlatedIds.push(edgeId);
    }
  });
  const correlatedTimingGroups = correlatedIds.length > 0 ? [correlatedIds] : [];

  const suspiciousAccounts = new Set<string>();
  for (const edge of edges) {
    if (edge.circular || edge.correlatedTiming) {
      suspiciousAccounts.add(edge.source);
      suspiciousAccounts.add(edge.destination);
    }
    if (edge.sharedFunding) suspiciousAccounts.add(edge.destination);
  }

  const nodes = accounts.map((address) => ({
    address,
    roles: [...(roles.get(address) ?? [])].sort(),
    suspicious: suspiciousAccounts.has(address),
  }));

  return { nodes, edges, circularFlows, sharedFundingGroups, correlatedTimingGroups };
}
