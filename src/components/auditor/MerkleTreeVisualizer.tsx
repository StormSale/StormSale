import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useNotification } from "../../context/NotificationContext";
import {
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProofStepByStep,
  findLeafByTxHash,
  parseTransactionHashFromReceipt,
  calculateCommissionPercentage,
  filterBatchesForOrg,
  type MerkleTree,
  type MerkleNode,
  type MerkleProof,
  type MerkleProofStep,
} from "../../utils/merkle";
import {
  GitFork,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Search,
  Upload,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  FileText,
  AlertTriangle,
  Clock,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface NodePosition {
  node: MerkleNode;
  x: number;
  y: number;
}

export interface MerkleTreeVisualizerProps {
  initialSaleId?: string;
  initialTxHash?: string;
  initialBatchIndex?: number;
  organizationId?: string;
}

export const MerkleTreeVisualizer: React.FC<MerkleTreeVisualizerProps> = ({
  initialSaleId,
  initialTxHash,
  initialBatchIndex,
  organizationId,
}) => {
  const { showNotification } = useNotification();

  const batches = useMemo(() => {
    return filterBatchesForOrg(organizationId);
  }, [organizationId]);

  // Match initial batch and leaf from props with exact normalized comparison
  const initialMatch = useMemo<{
    batchIndex: number;
    leafIndex: number;
    isUnmatched: boolean;
    unmatchedIdentifier?: string;
  }>(() => {
    if (
      typeof initialBatchIndex === "number" &&
      initialBatchIndex >= 0 &&
      initialBatchIndex < batches.length
    ) {
      return { batchIndex: initialBatchIndex, leafIndex: 0, isUnmatched: false };
    }
    if (initialSaleId) {
      const cleanSaleId = initialSaleId.trim().toLowerCase();
      const strippedOrderNum = cleanSaleId.replace(/^ord-/, "");

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        // 1. Exact orderId match
        const orderIdx = batch.orders.findIndex(
          (o) =>
            o.orderId.toLowerCase() === cleanSaleId ||
            o.orderId.toLowerCase().replace(/^ord-/, "") === strippedOrderNum,
        );
        if (orderIdx >= 0) {
          return { batchIndex: bIdx, leafIndex: orderIdx, isUnmatched: false };
        }
        // 2. Exact campaignId / campaignName match (selects first leaf of that batch)
        if (
          batch.campaignName.toLowerCase() === cleanSaleId ||
          batch.orders.some((o) => {
            const cid = o.campaignId.toLowerCase();
            return cid === cleanSaleId || cid.replace(/^camp-/, "") === cleanSaleId;
          })
        ) {
          return { batchIndex: bIdx, leafIndex: 0, isUnmatched: false };
        }
      }
      return { batchIndex: -1, leafIndex: -1, isUnmatched: true, unmatchedIdentifier: initialSaleId };
    }
    if (initialTxHash) {
      const cleanTx = initialTxHash.trim().toLowerCase().replace(/^0x/, "");
      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        const orderIdx = batch.orders.findIndex(
          (o) => o.txHash.toLowerCase().replace(/^0x/, "") === cleanTx,
        );
        if (orderIdx >= 0) {
          return { batchIndex: bIdx, leafIndex: orderIdx, isUnmatched: false };
        }
      }
      return { batchIndex: -1, leafIndex: -1, isUnmatched: true, unmatchedIdentifier: initialTxHash };
    }
    return { batchIndex: 0, leafIndex: 0, isUnmatched: false };
  }, [initialBatchIndex, initialSaleId, initialTxHash, batches]);

  const [unmatchedError, setUnmatchedError] = useState<{
    isUnmatched: boolean;
    identifier?: string;
  }>({
    isUnmatched: initialMatch.isUnmatched,
    identifier: initialMatch.unmatchedIdentifier,
  });

  // Batch state
  const [selectedBatchIndex, setSelectedBatchIndex] = useState<number>(
    initialMatch.isUnmatched ? 0 : initialMatch.batchIndex,
  );
  const currentBatch = batches[selectedBatchIndex] || batches[0];

  useEffect(() => {
    setSelectedBatchIndex(0);
    setUnmatchedError({ isUnmatched: false });
    setSearchTxHash("");
    setSearchStatus({ type: "idle", message: "" });
  }, [organizationId]);

  // Tree state
  const [tree, setTree] = useState<MerkleTree | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(true);

  // Selection & proof state
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number>(0);
  const [activeProof, setActiveProof] = useState<MerkleProof | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    computedRoot: string;
    expectedRoot: string;
    verifiedSteps: MerkleProofStep[];
  } | null>(null);

  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1); // -1 = show all steps
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isTampered, setIsTampered] = useState<boolean>(false);
  const [tamperedHash, setTamperedHash] = useState<string>("");

  // Search & Upload state
  const [searchTxHash, setSearchTxHash] = useState<string>(initialTxHash || "");
  const [searchStatus, setSearchStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  // Tooltip & details state
  const [hoveredNode, setHoveredNode] = useState<{
    node: MerkleNode;
    x: number;
    y: number;
  } | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Canvas zoom & pan
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [treeOrientation, setTreeOrientation] = useState<"top-down" | "bottom-up">("top-down");
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // 1. Build Merkle tree when batch changes (Reads independent precomputed contractRootHash)
  useEffect(() => {
    let isMounted = true;
    if (unmatchedError.isUnmatched) {
      setIsLoadingTree(false);
      return;
    }

    setIsLoadingTree(true);
    setTree(null);
    setActiveProof(null);
    setVerificationResult(null);

    buildMerkleTree(currentBatch.orders)
      .then((newTree) => {
        if (!isMounted) return;
        setTree(newTree);

        let initialLeaf = 0;
        if (initialMatch.batchIndex === selectedBatchIndex && initialMatch.leafIndex >= 0) {
          initialLeaf = initialMatch.leafIndex;
        }

        setSelectedLeafIndex(initialLeaf);
        setIsTampered(false);
        setTamperedHash("");
        setActiveStepIndex(-1);
        setIsPlaying(false);
        setIsLoadingTree(false);
      })
      .catch((err) => {
        console.error("Failed to build tree:", err);
        if (isMounted) setIsLoadingTree(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBatchIndex, currentBatch.orders, unmatchedError.isUnmatched, initialMatch]);

  // 2. Generate proof when selected leaf changes against trusted on-chain root
  useEffect(() => {
    let isMounted = true;
    if (!tree || selectedLeafIndex < 0 || selectedLeafIndex >= tree.leaves.length) {
      setActiveProof(null);
      setVerificationResult(null);
      return;
    }

    generateMerkleProof(tree, selectedLeafIndex, currentBatch.contractRootHash)
      .then((proof) => {
        if (isMounted) setActiveProof(proof);
      })
      .catch((err) => {
        console.error("Proof generation error:", err);
        if (isMounted) {
          setActiveProof(null);
          setVerificationResult(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [tree, selectedLeafIndex, currentBatch.contractRootHash]);

  // 3. Dynamic cryptographic verification computation for console
  useEffect(() => {
    let isMounted = true;
    if (!activeProof) {
      setVerificationResult(null);
      return;
    }

    verifyMerkleProofStepByStep(
      activeProof,
      currentBatch.contractRootHash,
      isTampered ? tamperedHash : undefined,
    )
      .then((result) => {
        if (isMounted) setVerificationResult(result);
      })
      .catch((err) => {
        console.error("Verification execution error:", err);
        if (isMounted) {
          setVerificationResult(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeProof, isTampered, tamperedHash, currentBatch.contractRootHash]);

  // 4. Step-by-step autoplay timer
  useEffect(() => {
    if (!isPlaying || !activeProof) return;

    const interval = setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev >= activeProof.steps.length - 1) {
          setIsPlaying(false);
          return activeProof.steps.length - 1;
        }
        return prev + 1;
      });
    }, 1400);

    return () => clearInterval(interval);
  }, [isPlaying, activeProof]);

  // Copy helper with robust error handling and user toast feedback
  const handleCopy = async (text: string, label = "Item") => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedHash(text);
      showNotification({
        type: "success",
        title: "Copied to Clipboard",
        message: `${label} copied successfully.`,
      });
      setTimeout(() => setCopiedHash(null), 2000);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Clipboard access denied";
      showNotification({
        type: "error",
        title: "Copy Failed",
        message: errMsg,
      });
    }
  };

  // Search transaction hash
  const handleSearchTx = useCallback(
    (inputTx: string) => {
      if (!tree) return;
      const trimmed = inputTx.trim();
      if (!trimmed) {
        setSearchStatus({ type: "idle", message: "" });
        return;
      }

      const match = findLeafByTxHash(tree, trimmed);
      if (match) {
        setSelectedLeafIndex(match.index);
        setIsTampered(false);
        setActiveStepIndex(-1);
        setSearchStatus({
          type: "success",
          message: `Matched Leaf #${match.index} (${match.node.order?.orderId})`,
        });
      } else {
        setSearchStatus({
          type: "error",
          message: "Transaction hash not found in this settlement batch.",
        });
      }
    },
    [tree],
  );

  // File upload handler
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const candidateTx = parseTransactionHashFromReceipt(text, file.name.endsWith(".json"));

        if (candidateTx) {
          setSearchTxHash(candidateTx);
          handleSearchTx(candidateTx);
        } else {
          setSearchStatus({
            type: "error",
            message: "No valid 64-character transaction hash found in the uploaded file.",
          });
        }
      } catch {
        setSearchStatus({
          type: "error",
          message: "Failed to parse file. Ensure it is valid JSON or plain text.",
        });
      }
    };
    reader.readAsText(file);
  };

  // Toggle simulate tamper test
  const handleToggleTamper = () => {
    if (!activeProof) return;
    if (isTampered) {
      setIsTampered(false);
      setTamperedHash("");
    } else {
      setIsTampered(true);
      const original = activeProof.leafHash;
      const flipped = original[0] === "a" ? `b${original.slice(1)}` : `a${original.slice(1)}`;
      setTamperedHash(flipped);
    }
  };

  // Compute node roles for visual styling
  const nodeRoles = useMemo(() => {
    const roles: Record<string, "selected" | "sibling" | "ancestor" | "normal"> = {};
    if (!tree || !activeProof) return roles;

    // Selected leaf
    const selectedLeaf = tree.leaves[selectedLeafIndex];
    if (selectedLeaf) roles[selectedLeaf.id] = "selected";

    // Trace path and siblings
    let curIdx = selectedLeafIndex;
    for (let lvl = 0; lvl < tree.height; lvl++) {
      const isOddPromoted =
        tree.levels[lvl].length % 2 !== 0 && curIdx === tree.levels[lvl].length - 1;

      if (!isOddPromoted) {
        const isEven = curIdx % 2 === 0;
        const sibIdx = isEven ? curIdx + 1 : curIdx - 1;
        const levelNodes = tree.levels[lvl];

        if (sibIdx < levelNodes.length) {
          roles[levelNodes[sibIdx].id] = "sibling";
        }
      }

      const parentIdx = Math.floor(curIdx / 2);
      if (tree.levels[lvl + 1] && tree.levels[lvl + 1][parentIdx]) {
        roles[tree.levels[lvl + 1][parentIdx].id] = "ancestor";
      }

      curIdx = parentIdx;
    }

    return roles;
  }, [tree, selectedLeafIndex, activeProof]);

  // Layout node coordinates for SVG
  const { nodePositions, svgWidth, svgHeight } = useMemo(() => {
    if (!tree)
      return { nodePositions: new Map<string, NodePosition>(), svgWidth: 900, svgHeight: 500 };

    const positions = new Map<string, NodePosition>();
    const totalLevels = tree.levels.length;
    const leafCount = tree.leaves.length;

    const horizontalSpacing = Math.max(140, Math.min(180, 850 / leafCount));
    const calculatedWidth = Math.max(900, leafCount * horizontalSpacing + 120);
    const verticalSpacing = 130;
    const calculatedHeight = totalLevels * verticalSpacing + 80;

    tree.levels.forEach((nodes, levelIdx) => {
      const y =
        treeOrientation === "top-down"
          ? (totalLevels - 1 - levelIdx) * verticalSpacing + 70
          : levelIdx * verticalSpacing + 70;

      const levelWidth = calculatedWidth - 160;
      const stepX = levelWidth / nodes.length;

      nodes.forEach((node, idx) => {
        let x = 80 + stepX * (idx + 0.5);
        if (node.left && node.right) {
          const leftPos = positions.get(node.left.id);
          const rightPos = positions.get(node.right.id);
          if (leftPos && rightPos) {
            x = (leftPos.x + rightPos.x) / 2;
          }
        }

        positions.set(node.id, { node, x, y });
      });
    });

    return { nodePositions: positions, svgWidth: calculatedWidth, svgHeight: calculatedHeight };
  }, [tree, treeOrientation]);

  return (
    <div className="space-y-8 pb-12 font-sans">
      {/* 1. Header Banner & Batch Selector */}
      <div className="bg-white dark:bg-zinc-900/60 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-indigo-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 flex items-center gap-1.5">
                <GitFork className="w-3.5 h-3.5 text-indigo-500" />
                Auditor Enterprise
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Soroban Verified
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Interactive Merkle Tree Proof Visualizer
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 text-sm md:text-base font-medium">
              Explore batch-settled conversion ledger logs, highlight cryptographic verification
              paths in green, and audit inclusion proofs against on-chain roots.
            </p>
          </div>

          {/* Batch Selector Dropdown */}
          <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-slate-50 dark:bg-zinc-800/80 p-2 rounded-2xl border border-slate-200 dark:border-zinc-700/60 shadow-inner">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-2 block mb-1">
                Select Settlement Batch
              </label>
              <select
                aria-label="Select Settlement Batch"
                value={selectedBatchIndex}
                onChange={(e) => {
                  setSelectedBatchIndex(Number(e.target.value));
                  setUnmatchedError({ isUnmatched: false });
                  setSearchTxHash("");
                  setSearchStatus({ type: "idle", message: "" });
                }}
                className="w-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold text-sm rounded-xl px-3 py-2 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
              >
                {batches.map((b, idx) => (
                  <option key={b.batchId} value={idx}>
                    {b.batchId} — {b.campaignName} ({b.orders.length} Conversions)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Batch Metadata Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-zinc-800/60">
          <div className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800">
            <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Settlement Ledger
            </p>
            <p className="text-base font-extrabold text-zinc-900 dark:text-white mt-1">
              {`#${currentBatch.ledgerSequence.toLocaleString()}`}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {currentBatch.settledAt}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800">
            <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Batch Volume & Size
            </p>
            <p className="text-base font-extrabold text-zinc-900 dark:text-white mt-1">
              {currentBatch.orders.reduce((sum, o) => sum + o.amountXlm, 0).toLocaleString()} XLM
            </p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
              {currentBatch.orders.length} Leaves (Binary Tree)
            </p>
          </div>

          <div className="col-span-2 p-3.5 rounded-2xl bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                On-Chain Merkle Root (Soroban Escrow State)
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(currentBatch.contractRootHash, "On-Chain Merkle Root")}
                className="h-6 px-2 text-xs text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                {copiedHash === currentBatch.contractRootHash ? (
                  <Check className="w-3 h-3 text-emerald-500 mr-1" />
                ) : (
                  <Copy className="w-3 h-3 mr-1" />
                )}
                Copy Root
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate bg-indigo-50/80 dark:bg-indigo-950/50 px-2 py-1 rounded-lg border border-indigo-200/60 dark:border-indigo-800/50">
                0x{currentBatch.contractRootHash}
              </span>
            </div>
          </div>
        </div>
      </div>

      {unmatchedError.isUnmatched ? (
        <Card className="bg-white dark:bg-zinc-900/60 border border-amber-200 dark:border-amber-800/80 rounded-3xl p-8 md:p-12 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">
            No Settlement Batch Found for Identifier: "{unmatchedError.identifier}"
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto mt-2.5 leading-relaxed">
            This audit record has not yet been committed to an on-chain settlement Merkle Tree batch on the Soroban contract (or represents an external audit export).
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              onClick={() => {
                setUnmatchedError({ isUnmatched: false });
                setSelectedBatchIndex(0);
              }}
              className="rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold text-xs h-10 px-5 shadow-sm"
            >
              Browse Batch 0 ({batches[0]?.campaignName || "Default Batch"})
            </Button>
          </div>
        </Card>
      ) : (
        <>

      {/* 2. Transaction Search & Upload Bar */}
      <Card className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Enter or paste Transaction Hash (0x...) to locate exact tree leaf..."
                value={searchTxHash}
                onChange={(e) => {
                  setSearchTxHash(e.target.value);
                  handleSearchTx(e.target.value);
                }}
                className="pl-10 pr-24 py-2.5 h-11 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border-slate-200 dark:border-zinc-700 text-sm font-mono placeholder:font-sans"
              />
              {searchTxHash && (
                <button
                  onClick={() => {
                    setSearchTxHash("");
                    setSearchStatus({ type: "idle", message: "" });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                  e.target.value = ""; // Reset value so re-selecting same file triggers change
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border-slate-200 dark:border-zinc-700 h-11 px-4 font-semibold text-xs gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-500" />
                Upload Tx Hash / Receipt
              </Button>

              <Button
                variant={isTampered ? "destructive" : "outline"}
                onClick={handleToggleTamper}
                className={`rounded-2xl h-11 px-4 font-semibold text-xs gap-1.5 transition-all ${
                  isTampered
                    ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
                    : "border-slate-200 dark:border-zinc-700 hover:border-amber-500 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${isTampered ? "text-white" : "text-amber-500"}`}
                />
                {isTampered ? "Tampered Mode Active (Audit Fail)" : "Simulate Tamper Test"}
              </Button>
            </div>
          </div>

          {/* Search feedback alert */}
          <AnimatePresence>
            {searchStatus.message && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`mt-4 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  searchStatus.type === "success"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20"
                    : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20"
                }`}
              >
                {searchStatus.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span>{searchStatus.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Select Leaf Badges */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800/60 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
              Select Leaf:
            </span>
            {currentBatch.orders.map((order, i) => (
              <button
                key={order.orderId}
                onClick={() => {
                  setSelectedLeafIndex(i);
                  setIsTampered(false);
                  setActiveStepIndex(-1);
                  setSearchTxHash(order.txHash);
                  setSearchStatus({
                    type: "success",
                    message: `Selected Leaf #${i} (${order.orderId})`,
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedLeafIndex === i
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20 font-bold"
                    : "bg-slate-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700/60 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
              >
                #{i} {order.orderId} ({order.amountXlm} XLM)
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Interactive Visual Merkle Tree Graph */}
      <Card className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden relative">
        <CardHeader className="p-6 border-b border-slate-100 dark:border-zinc-800/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <GitFork className="w-5 h-5 text-indigo-500" />
                Animated Merkle Tree Structure
              </CardTitle>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                Height: {tree?.height ?? 0} Levels
              </span>
            </div>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Click any individual conversion leaf below to calculate and highlight its verification
              path (Merkle siblings in{" "}
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">green</span>).
            </CardDescription>
          </div>

          {/* Tree Controls & Legend */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Legend Pills */}
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" />
                Target Leaf
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                Merkle Sibling (Path)
              </span>
              <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-sm" />
                Path Ancestor
              </span>
            </div>

            {/* Orientation Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setTreeOrientation((prev) => (prev === "top-down" ? "bottom-up" : "top-down"))
              }
              className="rounded-xl border-slate-200 dark:border-zinc-700 text-xs h-9 px-3"
              title="Flip tree orientation"
            >
              <Layers className="w-3.5 h-3.5 mr-1 text-zinc-500" />
              {treeOrientation === "top-down" ? "Root Top" : "Leaves Top"}
            </Button>

            {/* Zoom controls */}
            <div className="flex items-center border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-zinc-800/60">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.1))}
                className="w-8 h-8 rounded-none hover:bg-slate-200 dark:hover:bg-zinc-700"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </Button>
              <span className="px-2 text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
                className="w-8 h-8 rounded-none hover:bg-slate-200 dark:hover:bg-zinc-700"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomLevel(1)}
                className="w-8 h-8 rounded-none hover:bg-slate-200 dark:hover:bg-zinc-700 border-l border-slate-200 dark:border-zinc-700"
                title="Reset Zoom"
              >
                <Maximize2 className="w-3 h-3 text-zinc-600 dark:text-zinc-400" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Tree SVG Rendering Canvas */}
        <div
          ref={containerRef}
          className="p-4 md:p-8 overflow-x-auto overflow-y-hidden bg-slate-50/50 dark:bg-zinc-950/40 min-h-[460px] flex items-center justify-center relative select-none"
        >
          {isLoadingTree ? (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold">
                Generating Merkle Tree & Cryptographic Proofs...
              </p>
            </div>
          ) : (
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease-out",
              }}
              className="relative"
            >
              <svg width={svgWidth} height={svgHeight} className="overflow-visible">
                <defs>
                  <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow
                      dx="0"
                      dy="0"
                      stdDeviation="4"
                      floodColor="#10b981"
                      floodOpacity="0.8"
                    />
                  </filter>
                  <filter id="glow-indigo" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow
                      dx="0"
                      dy="0"
                      stdDeviation="4"
                      floodColor="#6366f1"
                      floodOpacity="0.8"
                    />
                  </filter>
                </defs>

                {/* Draw Connecting Branches (Curved Bezier Paths) */}
                {tree?.levels.map((levelNodes, lvl) => {
                  if (lvl === 0) return null;

                  return levelNodes.map((parent) => {
                    const parentPos = nodePositions.get(parent.id);
                    if (!parentPos) return null;

                    const children = [parent.left, parent.right].filter(Boolean) as MerkleNode[];

                    return children.map((child) => {
                      const childPos = nodePositions.get(child.id);
                      if (!childPos) return null;

                      const childRole = nodeRoles[child.id];
                      const parentRole = nodeRoles[parent.id];

                      const isSiblingBranch = childRole === "sibling";
                      const isAncestorBranch =
                        (childRole === "selected" || childRole === "ancestor") &&
                        (parentRole === "ancestor" || parentRole === "selected");

                      let strokeColor = "#94a3b8";
                      let strokeWidth = 1.75;
                      const strokeDasharray = "none";
                      let filter = "none";

                      if (isSiblingBranch) {
                        strokeColor = "#10b981";
                        strokeWidth = 3;
                        filter = "url(#glow-green)";
                      } else if (isAncestorBranch) {
                        strokeColor = "#6366f1";
                        strokeWidth = 3;
                        filter = "url(#glow-indigo)";
                      }

                      const midY = (parentPos.y + childPos.y) / 2;
                      const pathData = `M ${parentPos.x} ${parentPos.y} C ${parentPos.x} ${midY}, ${childPos.x} ${midY}, ${childPos.x} ${childPos.y}`;

                      return (
                        <g key={`${parent.id}-${child.id}`}>
                          <path
                            d={pathData}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeDasharray={strokeDasharray}
                            filter={filter}
                            className="transition-all duration-500 opacity-80 hover:opacity-100"
                          />
                        </g>
                      );
                    });
                  });
                })}

                {/* Draw Nodes */}
                {Array.from(nodePositions.values()).map(({ node, x, y }) => {
                  const role = nodeRoles[node.id] || "normal";
                  const isSelected = role === "selected";
                  const isSibling = role === "sibling";
                  const isAncestor = role === "ancestor";

                  const nodeWidth = node.isLeaf ? 130 : node.isRoot ? 170 : 120;
                  const nodeHeight = node.isLeaf ? 54 : node.isRoot ? 50 : 44;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${x - nodeWidth / 2}, ${y - nodeHeight / 2})`}
                      className="cursor-pointer group"
                      onClick={() => {
                        if (node.isLeaf) {
                          setSelectedLeafIndex(node.index);
                          setIsTampered(false);
                          setActiveStepIndex(-1);
                          if (node.order) setSearchTxHash(node.order.txHash);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (hoverTimeoutRef.current) {
                          clearTimeout(hoverTimeoutRef.current);
                          hoverTimeoutRef.current = null;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredNode({
                          node,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      onMouseLeave={() => {
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = setTimeout(() => {
                          setHoveredNode(null);
                        }, 200);
                      }}
                    >
                      <rect
                        width={nodeWidth}
                        height={nodeHeight}
                        rx={16}
                        className={`transition-all duration-300 ${
                          isSelected
                            ? "fill-indigo-600 stroke-indigo-400 stroke-2 drop-shadow-lg"
                            : isSibling
                              ? "fill-emerald-500/15 stroke-emerald-500 stroke-2 dark:fill-emerald-950/60 drop-shadow-md"
                              : isAncestor
                                ? "fill-sky-50 dark:fill-sky-950/40 stroke-sky-500 stroke-2 drop-shadow-sm"
                                : node.isRoot
                                  ? "fill-purple-50 dark:fill-purple-950/40 stroke-purple-500 stroke-2 shadow-md"
                                  : "fill-white dark:fill-zinc-900 stroke-slate-200 dark:stroke-zinc-700/80 hover:stroke-indigo-400"
                        }`}
                      />

                      {/* Green glowing border pulse for Merkle Sibling */}
                      {isSibling && (
                        <rect
                          width={nodeWidth + 6}
                          height={nodeHeight + 6}
                          x={-3}
                          y={-3}
                          rx={19}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="1.5"
                          strokeDasharray="4 4"
                          className="animate-spin-slow opacity-80"
                        />
                      )}

                      {/* Node Text Content */}
                      {node.isLeaf ? (
                        <>
                          <text
                            x={nodeWidth / 2}
                            y={20}
                            textAnchor="middle"
                            className={`text-[11px] font-bold ${
                              isSelected
                                ? "fill-white font-extrabold"
                                : isSibling
                                  ? "fill-emerald-700 dark:fill-emerald-300"
                                  : "fill-zinc-900 dark:fill-zinc-100"
                            }`}
                          >
                            {isSelected ? "🎯 " : isSibling ? "🌿 " : ""}
                            {node.order?.orderId}
                          </text>

                          <text
                            x={nodeWidth / 2}
                            y={38}
                            textAnchor="middle"
                            className={`font-mono text-[9px] ${
                              isSelected
                                ? "fill-indigo-100"
                                : isSibling
                                  ? "fill-emerald-600 dark:fill-emerald-400 font-bold"
                                  : "fill-zinc-500 dark:fill-zinc-400"
                            }`}
                          >
                            {isSelected && isTampered
                              ? `tampered:${tamperedHash.slice(0, 6)}...`
                              : `${node.hash.slice(0, 6)}...${node.hash.slice(-4)}`}
                          </text>
                        </>
                      ) : node.isRoot ? (
                        <>
                          <text
                            x={nodeWidth / 2}
                            y={20}
                            textAnchor="middle"
                            className="text-[11px] font-extrabold fill-purple-700 dark:fill-purple-300 uppercase tracking-wider"
                          >
                            👑 Merkle Root
                          </text>
                          <text
                            x={nodeWidth / 2}
                            y={36}
                            textAnchor="middle"
                            className="font-mono text-[10px] font-bold fill-zinc-700 dark:fill-zinc-300"
                          >
                            {node.hash.slice(0, 6)}...{node.hash.slice(-4)}
                          </text>
                        </>
                      ) : (
                        <>
                          <text
                            x={nodeWidth / 2}
                            y={18}
                            textAnchor="middle"
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isSibling
                                ? "fill-emerald-700 dark:fill-emerald-300"
                                : isAncestor
                                  ? "fill-sky-700 dark:fill-sky-300"
                                  : "fill-zinc-500 dark:fill-zinc-400"
                            }`}
                          >
                            {isSibling ? "🌿 Sibling" : `Level ${node.level} [${node.index}]`}
                          </text>
                          <text
                            x={nodeWidth / 2}
                            y={33}
                            textAnchor="middle"
                            className={`font-mono text-[9px] ${
                              isSibling
                                ? "fill-emerald-600 dark:fill-emerald-400 font-bold"
                                : "fill-zinc-600 dark:fill-zinc-400"
                            }`}
                          >
                            {node.hash.slice(0, 6)}...{node.hash.slice(-4)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Floating Tooltip Component (Displaying raw hex bytes and order metadata) */}
        <AnimatePresence>
          {hoveredNode && (
            <div
              key="merkle-tooltip"
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }
              }}
              onMouseLeave={() => {
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = setTimeout(() => {
                  setHoveredNode(null);
                }, 150);
              }}
              style={{
                position: "fixed",
                left: `${Math.min(window.innerWidth - 320, Math.max(20, hoveredNode.x - 150))}px`,
                top: `${hoveredNode.y - 10}px`,
                transform: "translateY(-100%)",
                zIndex: 60,
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 5, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="w-80 p-4 rounded-2xl bg-zinc-900/95 dark:bg-black/95 text-white shadow-2xl backdrop-blur-md border border-zinc-700/80 pointer-events-auto"
              >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2.5">
                <div className="flex items-center gap-1.5">
                  {hoveredNode.node.isLeaf ? (
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      Leaf #{hoveredNode.node.index}: {hoveredNode.node.order?.orderId}
                    </span>
                  ) : hoveredNode.node.isRoot ? (
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      On-Chain Merkle Root
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-1">
                      <GitFork className="w-3.5 h-3.5" />
                      Intermediate Branch (L{hoveredNode.node.level})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleCopy(hoveredNode.node.hash, "Node Hash")}
                  className="text-[11px] font-semibold text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded-md"
                >
                  {copiedHash === hoveredNode.node.hash ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy
                </button>
              </div>

              {/* Raw Hex Bytes */}
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Raw Hex Bytes (SHA-256 / 32 Bytes):
                </p>
                <div className="p-2 rounded-xl bg-black/60 font-mono text-[10px] text-emerald-400 break-all leading-relaxed border border-zinc-800 select-all">
                  0x{hoveredNode.node.hash}
                </div>
              </div>

              {/* Order Metadata (for leaves) */}
              {hoveredNode.node.order && (
                <div className="space-y-1.5 pt-2 border-t border-zinc-800 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Tx Hash:</span>
                    <span className="font-mono text-zinc-200">
                      {hoveredNode.node.order.txHash.slice(0, 10)}...
                      {hoveredNode.node.order.txHash.slice(-6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Affiliate:</span>
                    <span className="font-mono text-indigo-300">
                      {hoveredNode.node.order.affiliateAddress.slice(0, 6)}...
                      {hoveredNode.node.order.affiliateAddress.slice(-4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Sale Amount:</span>
                    <span className="font-bold text-white">
                      {hoveredNode.node.order.amountXlm} XLM
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Commission:</span>
                    <span className="font-bold text-emerald-400">
                      {hoveredNode.node.order.commissionXlm} XLM (
                      {calculateCommissionPercentage(
                        hoveredNode.node.order.amountXlm,
                        hoveredNode.node.order.commissionXlm,
                      )}
                      %)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Timestamp:</span>
                    <span className="text-zinc-300">{hoveredNode.node.order.timestamp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Status:</span>
                    <span className="text-emerald-400 font-semibold">
                      {hoveredNode.node.order.clearingStatus}
                    </span>
                  </div>
                </div>
              )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Card>

      {/* 4. Step-by-Step Cryptographic Validation Console */}
      <Card className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
        <CardHeader className="p-6 border-b border-slate-100 dark:border-zinc-800/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Step-by-Step SHA-256 Inclusion Proof Validation
              </CardTitle>
              {verificationResult === null ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                  Select a Leaf
                </span>
              ) : verificationResult.isValid ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                  Proof Verified ✅
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-300 dark:border-red-500/30">
                  Tamper / Mismatch Detected ❌
                </span>
              )}
            </div>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Computes SHA-256 hashes sequentially up the tree with Merkle siblings highlighted in
              green, matching against the on-chain root.
            </CardDescription>
          </div>

          {/* Stepper Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={activeStepIndex <= 0}
              onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
              className="rounded-xl border-slate-200 dark:border-zinc-700 text-xs h-9 px-3"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />
              Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={!activeProof || activeStepIndex >= activeProof.steps.length - 1}
              onClick={() =>
                setActiveStepIndex((prev) =>
                  prev === -1 ? 0 : Math.min((activeProof?.steps.length ?? 1) - 1, prev + 1),
                )
              }
              className="rounded-xl border-slate-200 dark:border-zinc-700 text-xs h-9 px-3"
            >
              Next Step
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>

            <Button
              variant={isPlaying ? "destructive" : "default"}
              size="sm"
              onClick={() => {
                if (isPlaying) {
                  setIsPlaying(false);
                } else {
                  setActiveStepIndex(0);
                  setIsPlaying(true);
                }
              }}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-3 font-semibold shadow-sm"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 mr-1" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1" />
                  Auto-Play
                </>
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveStepIndex(-1);
                setIsPlaying(false);
              }}
              className="rounded-xl text-xs h-9 px-3"
              title="Show All Steps"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1 text-zinc-500" />
              Show All
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {/* Target Leaf Verification Header */}
          {activeProof && (
            <div className="mb-6 p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  Target Inclusion Leaf #{activeProof.leafIndex}: {activeProof.leafOrder?.orderId}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white break-all">
                    H(Leaf) = 0x{isTampered ? tamperedHash : activeProof.leafHash}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Proof Depth:
                </span>
                <span className="ml-2 px-2.5 py-1 rounded-xl bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-zinc-700 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {activeProof.steps.length} Levels
                </span>
              </div>
            </div>
          )}

          {/* Sequential Cryptographic Calculation Cards */}
          <div className="space-y-4">
            {verificationResult?.verifiedSteps.map((step, idx) => {
              const isCurrentStep = activeStepIndex === idx;
              const isDimmed = activeStepIndex !== -1 && activeStepIndex !== idx;

              return (
                <motion.div
                  key={step.level}
                  animate={{
                    opacity: isDimmed ? 0.45 : 1,
                    scale: isCurrentStep ? 1.01 : 1,
                  }}
                  className={`p-5 rounded-2xl border transition-all duration-300 ${
                    isCurrentStep
                      ? "bg-slate-50 dark:bg-zinc-800/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-md"
                      : "bg-white dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800/80 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-mono text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-sm text-zinc-900 dark:text-white">
                        Level {step.level} Hash Combination ➔ Level {step.level + 1} Parent
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {step.siblingPosition === "none" ? (
                        <span className="text-xs px-2.5 py-1 rounded-lg font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30">
                          Promoted Odd Node
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-1 rounded-lg font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Merkle Sibling: {step.siblingPosition === "left" ? "Left" : "Right"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cryptographic Pair Visualizer */}
                  {step.siblingPosition !== "none" && step.siblingHash && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      <div
                        className={`p-3 rounded-xl border ${
                          step.siblingPosition === "left"
                            ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-600/50 text-emerald-900 dark:text-emerald-200"
                            : "bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold block mb-1">
                          Left Input{" "}
                          {step.siblingPosition === "left"
                            ? "(🌿 Merkle Sibling)"
                            : "(Current Branch)"}
                          :
                        </span>
                        <span className="break-all font-semibold">
                          0x{step.siblingPosition === "left" ? step.siblingHash : step.currentHash}
                        </span>
                      </div>

                      <div
                        className={`p-3 rounded-xl border ${
                          step.siblingPosition === "right"
                            ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-600/50 text-emerald-900 dark:text-emerald-200"
                            : "bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold block mb-1">
                          Right Input{" "}
                          {step.siblingPosition === "right"
                            ? "(🌿 Merkle Sibling)"
                            : "(Current Branch)"}
                          :
                        </span>
                        <span className="break-all font-semibold">
                          0x{step.siblingPosition === "right" ? step.siblingHash : step.currentHash}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* SHA-256 Output Result */}
                  <div className="mt-3 p-3 rounded-xl bg-slate-100/70 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="font-mono text-xs">
                      <span className="text-zinc-500 font-bold mr-2">
                        {step.siblingPosition === "none"
                          ? "Promoted Hash ="
                          : "SHA-256(Left || Right) ="}
                      </span>
                      <span
                        className={`font-bold break-all ${
                          step.isVerified
                            ? "text-indigo-700 dark:text-indigo-300"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        0x{step.computedHash}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold flex items-center gap-1 shrink-0 ${
                        step.isVerified
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {step.isVerified ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Step Verified
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          Hash Mismatch
                        </>
                      )}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Root Match Comparison Footer */}
          <div
            className={`mt-6 p-5 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
              verificationResult === null
                ? "bg-slate-50 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                : !verificationResult.isValid
                  ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200"
                  : "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                {verificationResult === null ? (
                  <Clock className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                ) : !verificationResult.isValid ? (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                )}
                <span className="font-extrabold text-base">
                  {verificationResult === null
                    ? "Select a Leaf to Verify Inclusion Proof"
                    : !verificationResult.isValid
                      ? "Inclusion Proof Fails: Computed Root Mismatches On-Chain State"
                      : "Cryptographic Inclusion Proof Confirmed Against Soroban Root"}
                </span>
              </div>
              <p className="text-xs opacity-90 mt-1">
                {verificationResult === null
                  ? "Select a conversion transaction leaf in the tree above to calculate its cryptographic SHA-256 inclusion proof against the Soroban contract root."
                  : !verificationResult.isValid
                    ? "Audit Alert: Transaction data tampering detected! The reconstructed Merkle root differs from the immutable on-chain root published in ledger sequence #" +
                      currentBatch.ledgerSequence
                    : "All intermediary SHA-256 hashes resolve deterministically to the Soroban contract Merkle root. Conversion leaf is authentic and untampered."}
              </p>
            </div>

            <Button
              variant="outline"
              disabled={!verificationResult}
              onClick={() => {
                if (!verificationResult) return;
                const proofPayload = {
                  batchId: currentBatch.batchId,
                  ledgerSequence: currentBatch.ledgerSequence,
                  contractRootHash: currentBatch.contractRootHash,
                  leafIndex: activeProof?.leafIndex,
                  leafHash: isTampered ? tamperedHash : activeProof?.leafHash,
                  orderMetadata: activeProof?.leafOrder,
                  computedRoot: verificationResult.computedRoot,
                  isValid: verificationResult.isValid,
                  siblings: activeProof?.steps.map((s) => ({
                    level: s.level,
                    position: s.siblingPosition,
                    siblingHash: s.siblingHash,
                  })),
                  verifiedAt: new Date().toISOString(),
                };
                handleCopy(JSON.stringify(proofPayload, null, 2), "Audit Proof JSON");
              }}
              className="rounded-xl border-emerald-300 dark:border-emerald-600 text-xs font-bold h-10 px-4 shrink-0 bg-white/60 dark:bg-zinc-900/60 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copiedHash?.startsWith("{") ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 mr-1.5" />
              ) : (
                <Copy className="w-3.5 h-3.5 mr-1.5" />
              )}
              Export Audit Proof JSON
            </Button>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
};
