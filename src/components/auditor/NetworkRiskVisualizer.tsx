import { useRef, useState } from "react";
import { AlertTriangle, Download, FileUp, Network, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  analyzeTransactionFlows,
  parseTransactionFlows,
  type NetworkAnalysis,
} from "../../lib/networkAnalysis";

const formatAddress = (address: string) => `${address.slice(0, 5)}...${address.slice(-4)}`;

export const NetworkRiskVisualizer: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analysis, setAnalysis] = useState<NetworkAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const importTransactions = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      const flows = parseTransactionFlows(JSON.parse(await file.text()));
      setAnalysis(analyzeTransactionFlows(flows));
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read transaction data.");
      setAnalysis(null);
      setFileName("");
    }
  };

  const exportAnalysis = () => {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stormsale-network-analysis.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const suspiciousAccounts = analysis?.nodes.filter((node) => node.suspicious).length ?? 0;
  const nodePositions = analysis?.nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / analysis.nodes.length - Math.PI / 2;
    return {
      ...node,
      x: 400 + Math.cos(angle) * Math.min(270, 80 + analysis.nodes.length * 12),
      y: 245 + Math.sin(angle) * Math.min(170, 50 + analysis.nodes.length * 8),
    };
  });
  const positionByAddress = new Map(nodePositions?.map((node) => [node.address, node]) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Transaction Network</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {fileName || "No transaction data loaded"}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import transaction data as JSON"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void importTransactions(file);
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" />
            Import JSON
          </Button>
          <Button onClick={exportAnalysis} disabled={!analysis}>
            <Download className="mr-2 h-4 w-4" />
            Export graph
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {analysis ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Network className="h-5 w-5 text-zinc-500" />
                <div>
                  <div className="text-xl font-bold text-zinc-900 dark:text-white">
                    {analysis.nodes.length}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Accounts · {analysis.edges.length} transfers
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <div className="text-xl font-bold text-amber-700">
                    {analysis.circularFlows.length}
                  </div>
                  <div className="text-xs text-zinc-500">Circular flow patterns</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <ShieldAlert className="h-5 w-5 text-red-600" />
                <div>
                  <div className="text-xl font-bold text-red-700">{suspiciousAccounts}</div>
                  <div className="text-xs text-zinc-500">Flagged accounts</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(analysis.circularFlows.length > 0 ||
            analysis.sharedFundingGroups.length > 0 ||
            analysis.correlatedTimingGroups.length > 0) && (
            <div
              role="status"
              className="border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30"
            >
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Suspicious activity detected
              </div>
              <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300">
                {analysis.circularFlows.map((cycle) => (
                  <li key={cycle.join("-")}>
                    Circular flow: {cycle.map(formatAddress).join(" → ")}
                  </li>
                ))}
                {analysis.sharedFundingGroups.map((group) => (
                  <li key={group.join("-")}>
                    Shared funding source: {group.map(formatAddress).join(", ")}
                  </li>
                ))}
                {analysis.correlatedTimingGroups.map((group, index) => (
                  <li key={index}>
                    Correlated transaction timing: {group.length} transfers participate in one or
                    more two-minute windows
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Fund flows</CardTitle>
              <CardDescription>
                Amber edges are circular; red nodes participate in detected patterns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <svg
                  viewBox="0 0 800 500"
                  role="img"
                  aria-label="Transaction flow network graph"
                  className="mx-auto min-w-[640px] w-full max-w-5xl"
                >
                  <defs>
                    <marker
                      id="flow-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="4"
                      orient="auto"
                    >
                      <path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
                    </marker>
                  </defs>
                  {analysis.edges.map((edge) => {
                    const source = positionByAddress.get(edge.source);
                    const destination = positionByAddress.get(edge.destination);
                    if (!source || !destination) return null;
                    const dx = destination.x - source.x;
                    const dy = destination.y - source.y;
                    const length = Math.hypot(dx, dy) || 1;
                    return (
                      <g key={edge.id}>
                        <line
                          x1={source.x}
                          y1={source.y}
                          x2={destination.x - (dx / length) * 31}
                          y2={destination.y - (dy / length) * 31}
                          stroke={
                            edge.circular
                              ? "#f59e0b"
                              : edge.sharedFunding
                                ? "#ef4444"
                                : edge.correlatedTiming
                                  ? "#f97316"
                                  : "#94a3b8"
                          }
                          strokeWidth={edge.circular || edge.sharedFunding ? 3 : 1.5}
                          markerEnd="url(#flow-arrow)"
                        >
                          <title>{`${edge.source} → ${edge.destination}: ${edge.amountXlm} XLM`}</title>
                        </line>
                      </g>
                    );
                  })}
                  {nodePositions?.map((node) => (
                    <g key={node.address}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="27"
                        fill={node.suspicious ? "#fee2e2" : "#e0f2fe"}
                        stroke={node.suspicious ? "#dc2626" : "#0284c7"}
                        strokeWidth="2"
                      />
                      <text
                        x={node.x}
                        y={node.y + 4}
                        textAnchor="middle"
                        className="fill-zinc-900 text-[11px] font-semibold"
                      >
                        {formatAddress(node.address)}
                      </text>
                      <title>{`${node.address}${node.roles.length ? ` (${node.roles.join(", ")})` : ""}`}</title>
                    </g>
                  ))}
                </svg>
              </div>
              <div className="mt-3 flex flex-wrap gap-5 text-xs text-zinc-500">
                <span>
                  <i className="mr-2 inline-block h-2 w-2 rounded-full bg-sky-600" />
                  Account
                </span>
                <span>
                  <i className="mr-2 inline-block h-2 w-2 rounded-full bg-red-600" />
                  Flagged account
                </span>
                <span>
                  <i className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Circular transfer
                </span>
                <span>
                  <i className="mr-2 inline-block h-2 w-2 rounded-full bg-orange-500" />
                  Correlated timing
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Load transaction records</CardTitle>
            <CardDescription>
              Import a JSON export of Stellar transfers to inspect account flows.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
};
