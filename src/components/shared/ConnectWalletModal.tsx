import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Smartphone,
  Shield,
  Zap,
  Key,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ChevronDown,
  Cpu,
  Activity,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import type { WalletType } from "../../lib/stellar";

export const ConnectWalletModal: React.FC = () => {
  const { isWalletModalOpen, closeWalletModal, connectWallet } = useWeb3();
  const [connectingType, setConnectingType] = useState<WalletType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [showReadOnlyInput, setShowReadOnlyInput] = useState(false);
  const [showResourceDiagnostics, setShowResourceDiagnostics] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [resourceBudget, setResourceBudget] = useState<{
    minResourceFee: string;
    cpuInstructions: number;
    memoryBytes: number;
    ledgerReadBytes: number;
    ledgerWriteBytes: number;
    warnings: string[];
  } | null>(null);

  if (!isWalletModalOpen) return null;

  const handleSelectWallet = async (type: WalletType) => {
    if (type === "readonly" && !showReadOnlyInput) {
      setShowReadOnlyInput(true);
      return;
    }

    setConnectingType(type);
    setErrorMessage(null);

    try {
      // Simulate Soroban RPC resource budget profiling for dev mode
      if (devMode) {
        try {
          const simulated = {
            minResourceFee: "0.0012345 XLM",
            cpuInstructions: 1_250_000,
            memoryBytes: 524_288,
            ledgerReadBytes: 2_048,
            ledgerWriteBytes: 1_024,
            warnings: [] as string[],
          };

          // Heuristic warnings for unoptimized contract footprints
          if (simulated.cpuInstructions > 1_000_000) {
            simulated.warnings.push(
              "High CPU instruction count detected. Consider optimizing contract loops or storage access patterns.",
            );
          }
          if (simulated.memoryBytes > 400_000) {
            simulated.warnings.push(
              "Elevated memory footprint. Review large data structures or temporary allocations.",
            );
          }
          if (simulated.ledgerWriteBytes > 512) {
            simulated.warnings.push(
              "Significant ledger write bytes. Batch writes or reduce persistent storage updates.",
            );
          }

          setResourceBudget(simulated);
        } catch (simErr) {
          console.warn("Resource simulation failed:", simErr);
        }
      }

      if (type === "readonly") {
        const trimmed = customKey.trim();
        if (!trimmed.startsWith("G") || trimmed.length !== 56) {
          throw new Error(
            "Invalid Stellar public key format. Keys start with 'G' and are 56 characters.",
          );
        }
        await connectWallet("readonly", trimmed);
      } else {
        await connectWallet(type);
      }
      closeWalletModal();
    } catch (err: any) {
      console.error("Wallet connection error:", err);
      setErrorMessage(err.message || "Failed to connect wallet. Please try again.");
    } finally {
      setConnectingType(null);
    }
  };

  const walletOptions = [
    {
      id: "albedo" as WalletType,
      name: "Albedo",
      badge: "Mobile Recommended",
      badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      description:
        "Universal web wallet. Works on all iOS Safari, Android, & Desktop browsers with zero install.",
      icon: Smartphone,
      accent: "from-emerald-500 to-teal-600",
      borderHover:
        "hover:border-emerald-500/55 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
    },
    {
      id: "freighter" as WalletType,
      name: "Freighter",
      badge: "Browser Extension",
      badgeColor: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
      description:
        "Official Stellar Development Foundation wallet extension for Chrome, Brave, & Firefox.",
      icon: Shield,
      accent: "from-purple-500 to-indigo-600",
      borderHover: "hover:border-purple-500/50 hover:bg-purple-50/50 dark:hover:bg-purple-950/20",
    },
    {
      id: "xbull" as WalletType,
      name: "xBull Wallet",
      badge: "Extension & Web",
      badgeColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
      description: "Feature-rich multi-account Stellar ecosystem wallet with hardware key support.",
      icon: Zap,
      accent: "from-amber-500 to-orange-600",
      borderHover: "hover:border-amber-500/50 hover:bg-amber-50/50 dark:hover:bg-amber-950/20",
    },
    {
      id: "mock" as WalletType,
      name: "1-Tap Demo Account",
      badge: "Instant 10,000 XLM",
      badgeColor: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
      description:
        "Instant testnet account pre-loaded with XLM for immediate protocol & contract evaluation.",
      icon: CheckCircle2,
      accent: "from-sky-500 to-blue-600",
      borderHover: "hover:border-sky-500/50 hover:bg-sky-50/50 dark:hover:bg-sky-950/20",
    },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeWalletModal}
          className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-auto"
        >
          {/* Header */}
          <div className="p-6 pb-4 flex items-start justify-between border-b border-slate-100 dark:border-zinc-800/80">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Stellar Network
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight mt-1">
                Connect Stellar Wallet
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                Select your preferred wallet to access Soroban smart contracts.
              </p>
            </div>
            <button
              onClick={closeWalletModal}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-6 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex items-start space-x-3 text-rose-700 dark:text-rose-300 text-xs sm:text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1">
                <span className="font-semibold block">Connection Error</span>
                <span>{errorMessage}</span>
              </div>
            </motion.div>
          )}

          {/* Dev Mode Toggle & Resource Diagnostics */}
          <div className="px-6 pt-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Developer Mode
                </span>
              </div>
              <button
                onClick={() => setDevMode((v) => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  devMode ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
                aria-label="Toggle developer mode"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${devMode ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
