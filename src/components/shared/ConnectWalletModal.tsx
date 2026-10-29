import React, { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
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
  ArrowLeft,
  Fingerprint,
  Usb,
  ChevronDown,
  Cpu,
  Activity,
  RefreshCw,
  QrCode,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import { useWalletConnect } from "../../context/WalletConnectContext";
import { CopyButton } from "../ui/copy-button";
import { FederatedAddressInput } from "./FederatedAddressInput";
import { resolveRecipient } from "../../lib/stellar";
import type { WalletType } from "../../lib/stellar";

export interface SorobanSimulationResult {
  minResourceFee: number;
  cpuInstructions: number;
  memoryBytes: number;
  ledgerReadBytes: number;
  ledgerWriteBytes: number;
}

export interface ResourceDiagnostic {
  minResourceFee: number;
  cpuInstructions: number;
  memoryBytes: number;
  ledgerReadBytes: number;
  ledgerWriteBytes: number;
  ratio: number;
  warnings: string[];
}

const CPU_LIMIT = 100_000_000;
const MEMORY_LIMIT = 40 * 1024 * 1024;
const LEDGER_WRITE_LIMIT = 100_000;
const LEDGER_READ_LIMIT = 500_000;

export const buildResourceDiagnostic = (
  simulationData: SorobanSimulationResult | null,
): ResourceDiagnostic | null => {
  if (!simulationData) return null;
  const { minResourceFee, cpuInstructions, memoryBytes, ledgerReadBytes, ledgerWriteBytes } =
    simulationData;
  const warnings: string[] = [];
  if (cpuInstructions > CPU_LIMIT) {
    warnings.push("High CPU instruction count — contract footprint may be unoptimized.");
  }
  if (memoryBytes > MEMORY_LIMIT) {
    warnings.push("Memory usage exceeds 40MB — consider reducing contract state size.");
  }
  if (ledgerWriteBytes > LEDGER_WRITE_LIMIT) {
    warnings.push("Large ledger write footprint — batch or minimize storage writes.");
  }
  if (ledgerReadBytes > LEDGER_READ_LIMIT) {
    warnings.push("Heavy ledger read footprint — cache or reduce cross-contract calls.");
  }
  return {
    minResourceFee,
    cpuInstructions,
    memoryBytes,
    ledgerReadBytes,
    ledgerWriteBytes,
    ratio: cpuInstructions / CPU_LIMIT,
    warnings,
  };
};

export const ConnectWalletModal: React.FC = () => {
  const { isWalletModalOpen, closeWalletModal, connectWallet } = useWeb3();
  const { connect: connectWalletConnect } = useWalletConnect();
  const [connectingType, setConnectingType] = useState<WalletType | "walletconnect" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [showReadOnlyInput, setShowReadOnlyInput] = useState(false);

  // WalletConnect QR State
  const [showQrView, setShowQrView] = useState(false);
  const [wcUri, setWcUri] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("u");
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);

  // Ledger hardware path state
  const [showLedgerSettings, setShowLedgerSettings] = useState(false);
  const [ledgerAccountIndex, setLedgerAccountIndex] = useState(0);
  const [customBipPath, setCustomBipPath] = useState("m/44'/148'/0'");
  const [useCustomPath, setUseCustomPath] = useState(false);

  // Soroban resource diagnostic state
  const [showResourceDiagnostic, setShowResourceDiagnostic] = useState(false);
  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const [simulationData, setSimulationData] = useState<SorobanSimulationResult | null>(null);

  // Generate dynamic WalletConnect pairing URI and QR Code
  const generateWalletConnectUri = useCallback(async () => {
    setIsGeneratingQr(true);
    setErrorMessage(null);
    try {
      const topic = "wc_" + Math.random().toString(36).substring(2, 12);
      const symKey = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0"),
      ).join("");
      const uri = `wc:${topic}@2?relay-protocol=irn&symKey=${symKey}`;
      setWcUri(uri);

      const dataUrl = await QRCode.toDataURL(uri, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 256,
        color: {
          dark: "#09090b", // zinc-950
          light: "#ffffff",
        },
      });
      setQrDataUrl(dataUrl);
    } catch (err: unknown) {
      console.error("Failed to generate QR code:", err);
      setErrorMessage("Failed to generate WalletConnect QR code. Please try again.");
    } finally {
      setIsGeneratingQr(false);
    }
  }, []);

  // Reset modal sub-views on close
  const handleClose = useCallback(() => {
    setShowQrView(false);
    setShowReadOnlyInput(false);
    setErrorMessage(null);
    setConnectingType(null);
    closeWalletModal();
  }, [closeWalletModal]);

  const resourceDiagnostic = useMemo(() => buildResourceDiagnostic(simulationData), [simulationData]);

  if (!isWalletModalOpen) return null;

  const getActiveBipPath = () => {
    if (useCustomPath) {
      return customBipPath.trim() || "m/44'/148'/0'";
    }
    return `m/44'/148'/${ledgerAccountIndex}'`;
  };

  const handleSelectWallet = async (type: WalletType | "walletconnect") => {
    if (type === "readonly" && !showReadOnlyInput) {
      setShowReadOnlyInput(true);
      return;
    }

    if (type === "walletconnect") {
      setShowQrView(true);
      await generateWalletConnectUri();
      return;
    }

    setConnectingType(type);
    setErrorMessage(null);

    try {
      if (type === "readonly") {
        // Accept either a raw G... key or a name*domain.com federation address,
        // re-resolving on submit so an unresolved string never reaches the wallet.
        const resolution = await resolveRecipient(customKey);
        if (
          (resolution.status !== "raw" && resolution.status !== "federated") ||
          !resolution.address
        ) {
          throw new Error(
            resolution.error ||
              "Invalid Stellar public key format. Keys start with 'G' and are 56 characters.",
          );
        }
        await connectWallet("readonly", resolution.address);
      } else if (type === "ledger") {
        const bipPath = getActiveBipPath();
        await connectWallet("ledger", undefined, bipPath);
      } else {
        await connectWallet(type);
      }
      handleClose();
    } catch (err: any) {
      console.error("Wallet connection error:", err);
      setErrorMessage(
        err.message ||
          "Failed to connect wallet. Please ensure your device is ready and try again.",
      );
    } finally {
      setConnectingType(null);
    }
  };

  const handleCompleteWalletConnect = async () => {
    setConnectingType("walletconnect");
    setErrorMessage(null);
    try {
      await connectWalletConnect();
      handleClose();
    } catch (err: any) {
      console.error("WalletConnect completion error:", err);
      setErrorMessage(err.message || "Failed to finalize WalletConnect session.");
    } finally {
      setConnectingType(null);
    }
  };

  const walletOptions = [
    {
      id: "passkey" as WalletType,
      name: "Continue with Passkey",
      badge: "FaceID/ Fingerprint",
      badgeColor: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
      description:
        "Zero-install smart wallet. Sign instantly using Apple FaceID, TouchID, or Android biometrics with sponsored platform gas.",
      icon: Fingerprint,
      accent: "from-blue-600 to-indigo-600",
      borderHover:
        "hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/10",
      featured: true,
    },
    {
      id: "ledger" as WalletType,
      name: "Ledger Hardware Wallet",
      badge: "Direct USB / WebHID",
      badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      description:
        "Sign high-value campaign escrows & contracts directly on your Ledger Nano S/X/Plus hardware screen.",
      icon: Usb,
      accent: "from-emerald-600 to-teal-700",
      borderHover:
        "hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
      hasSettings: true,
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
      borderHover: "hover:border-purple-500/55 hover:bg-purple-50/50 dark:hover:bg-purple-950/20",
    },
    {
      id: "albedo" as WalletType,
      name: "Albedo",
      badge: "Universal Web Wallet",
      badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      description:
        "Universal web wallet. Works on all iOS Safari, Android, & Desktop browsers with zero install.",
      icon: Smartphone,
      accent: "from-emerald-500 to-teal-600",
      borderHover:
        "hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
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
    {
      id: "walletconnect" as any,
      name: "WalletConnect",
      badge: "Mobile & QR",
      badgeColor: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      description:
        "Scan QR code with MetaMask, TrustWallet, LOBSTR, or any WalletConnect mobile app.",
      icon: QrCode,
      accent: "from-indigo-600 to-blue-600",
      borderHover: "hover:border-indigo-500/55 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20",
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
          onClick={handleClose}
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
            <div className="flex items-start space-x-3">
              {showQrView && (
                <button
                  type="button"
                  onClick={() => setShowQrView(false)}
                  aria-label="Back to wallet selection"
                  className="mt-0.5 p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Stellar Network — Soroban Smart Accounts
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight mt-1">
                  {showQrView ? "Scan WalletConnect QR" : "Connect Stellar Wallet"}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close wallet modal"
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
                <span className="font-semibold block">Connection Notice</span>
                <span>{errorMessage}</span>
              </div>
            </motion.div>
          )}

          {/* Connecting State Prompt for Ledger / Passkey */}
          {connectingType === "ledger" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mx-6 mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 space-y-1.5"
            >
              <div className="flex items-center space-x-2 font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Connecting to Ledger Hardware Wallet...</span>
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-emerald-700 dark:text-emerald-400 pl-1">
                <li>Connect Ledger via USB or Bluetooth.</li>
                <li>Enter your PIN to unlock the device.</li>
                <li>Open the official Stellar app on your device screen.</li>
                <li>
                  Derivation Path: <span className="font-mono font-bold">{getActiveBipPath()}</span>
                </li>
              </ol>
            </motion.div>
          )}

          {connectingType === "passkey" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mx-6 mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-2xl text-xs text-blue-800 dark:text-blue-300 space-y-1.5"
            >
              <div className="flex items-center space-x-2 font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Awaiting Biometric Authentication...</span>
              </div>
              <p className="text-[11px] text-blue-700 dark:text-blue-400">
                Please complete FaceID, TouchID, or fingerprint verification on your browser prompt.
              </p>
            </motion.div>
          )}

          {/* VIEW 1: WalletConnect QR View */}
          {showQrView ? (
            <div className="p-6 space-y-5">
              <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-zinc-950/60 rounded-3xl border border-slate-200/80 dark:border-zinc-800 relative">
                {/* Scanner Bracket Accents */}
                <div className="relative p-3.5 bg-white rounded-2xl shadow-xl border border-slate-200 dark:border-zinc-700">
                  <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-2 border-l-2 border-indigo-600 rounded-tl-md pointer-events-none" />
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-2 border-r-2 border-indigo-600 rounded-tr-md pointer-events-none" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-2 border-l-2 border-indigo-600 rounded-bl-md pointer-events-none" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-2 border-r-2 border-indigo-600 rounded-br-md pointer-events-none" />

                  {isGeneratingQr ? (
                    <div className="w-56 h-56 flex flex-col items-center justify-center space-y-2 text-zinc-400">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                      <span className="text-xs font-semibold">Generating QR Code...</span>
                    </div>
                  ) : qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="WalletConnect QR Code"
                      data-testid="walletconnect-qr-code"
                      className="w-56 h-56 rounded-xl object-contain block"
                    />
                  ) : (
                    <div className="w-56 h-56 flex flex-col items-center justify-center text-zinc-400 text-xs">
                      <span>No QR Available</span>
                    </div>
                  )}
                </div>

                {/* Connection Status Indicator */}
                <div className="mt-4 flex items-center space-x-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600" />
                  </span>
                  <span>Awaiting mobile wallet connection...</span>
                </div>
              </div>

              {/* Copy URI Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">Connection URI</span>
                  <button
                    type="button"
                    onClick={generateWalletConnectUri}
                    disabled={isGeneratingQr}
                    className="inline-flex items-center space-x-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingQr ? "animate-spin" : ""}`} />
                    <span>Refresh Code</span>
                  </button>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between gap-2">
                  <span
                    data-testid="walletconnect-uri-display"
                    className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate pl-2"
                  >
                    {wcUri || "Generating connection URI..."}
                  </span>
                  <CopyButton
                    text={wcUri}
                    label="Copy URI"
                    copiedLabel="Copied!"
                    variant="indigo"
                    size="sm"
                    showToast={true}
                    className="shrink-0"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowQrView(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Other Wallets
                </button>
                <button
                  type="button"
                  disabled={connectingType !== null}
                  onClick={handleCompleteWalletConnect}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-2"
                >
                  {connectingType === "walletconnect" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <span>Open Desktop Session</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto">
            {showQrView ? (
              <div className="flex flex-col items-center space-y-4">
                {isGeneratingQr ? (
                  <div className="flex flex-col items-center space-y-3 py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Generating secure pairing code…
                    </p>
                  </div>
                ) : (
                  <>
                    {qrDataUrl && (
                      <img
                        src={qrDataUrl}
                        alt="WalletConnect pairing QR code"
                        className="h-64 w-64 rounded-xl border border-slate-200 dark:border-zinc-700"
                      />
                    )}
                    <div className="w-full space-y-2">
                      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                        Open your WalletConnect-compatible app and scan this code.
                      </p>
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 p-2">
                        <code className="flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300">
                          {wcUri}
                        </code>
                        <CopyButton value={wcUri} />
                      </div>
                    </div>
                    <div className="flex w-full gap-2">
                      <button
                        type="button"
                        onClick={generateWalletConnectUri}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                      </button>
                      <button
                        type="button"
                        onClick={handleCompleteWalletConnect}
                        disabled={connectingType === "walletconnect"}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {connectingType === "walletconnect" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        I Connected
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {walletOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = connectingType === option.id;
                  return (
                    <div key={String(option.id)}>
                      <button
                        type="button"
                        onClick={() => handleSelectWallet(option.id)}
                        disabled={connectingType !== null}
                        className={`w-full text-left rounded-2xl border p-4 transition-all ${option.borderHover} disabled:opacity-60`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 aitems-center justify-center rounded-xl bg-gradient-to-br ${option.accent} text-white`}
                          >
                            {isActive ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Icon className="h-5 w-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-2">
                              <span className="text-sm font-bold text-zinc-900 dark:text-white">
                                {option.name}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${option.badgeColor}`}>
                                {option.badge}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                              {option.description}
                            </p>
                          </div>
                          {option.hasSettings && (
                            <button
                              type="button"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                setShowLedgerSettings((prev) => !prev);
                              }}
                              aria-label="Toggle Ledger advanced settings"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                            >
                              <ChevronDown
                                className={`transition-transform ${showLedgerSettings ? "rotate-180" : ""}`}
                              />
                            </button>
                          )}
                        </div>
                      </button>

                      {option.id === "ledger" && showLedgerSettings && (
                        <div className="mt-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-850/50 p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                              Account Index
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setLedgerAccountIndex((prev) => Math.max(0, prev - 1))}
                                className="h-7 w-7 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm font-bold text-zinc-700 dark:text-zinc-200"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-mono text-zinc-900 dark:text-white">
                                {ledgerAccountIndex}
                              </span>
                              <button
                                type="button"
                                onClick={() => setLedgerAccountIndex((prev) => prev + 1)}
                                className="h-7 w-7 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm font-bold text-zinc-700 dark:text-zinc-200"
                              >
                                +

                              </button>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={useCustomPath}
                              onChange={(e) => setUseCustomPath(e.target.checked)}
                            />
                            Use custom BIP 44' path
                          </label>
                          {useCustomPath && (
                            <input
                              type="text"
                              value={customBipPath}
                              onChange={(e) => setCustomBipPath(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-xs font-mono text-zinc-900 dark:text-white"
                            />
                          )}
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Active path: <span className="font-mono">{getActiveBipPath()}</span>
                          </p>
                        </div>
                      )}

                      {option.id === "readonly" && showReadOnlyInput && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={customKey}
                            onChange={(e) => setCustomKey(e.target.value)}
                            placeholder="G... 56-character public key"
                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-sm font-mono text-zinc-900 dark:text-white"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Soroban Resource Diagnostic */}
          <div className="border-t border-slate-100 dark:border-zinc-800/80 p-4">
            <button
              type="button"
              onClick={() => setShowResourceDiagnostic((prev) => !prev)}
              className="flex w-full items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400"
            >
              <span className="inline-flex items-center gap-2">
                <Cpu className="h-4 w_4" />
                Soroban Resource Profiler
              </span>
              <ChevronDown
                className={`transition-transform ${showResourceDiagnostic ? "rotate-180" : ""}`}
              />
            </button>

            {showResourceDiagnostic && (
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={devModeEnabled}
                    onChange={(e) => setDevModeEnabled(e.target.checked)}
                  />
                  Enable dev mode resource simulation
                </label>

                {devModeEnabled && (
                  <div className="space-y-2">
                    {resourceDiagnostic ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 p-2">
                            <div className="text-zinc-500 dark:text-zinc-400">Min Resource Fee</div>
                            <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                              {resourceDiagnostic.minResourceFee}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 p-2">
                            <div className="text-zinc-500 dark:text-zinc-400">CPU Instructions</div>
                            <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                              {resourceDiagnostic.cpuInstructions.toLocaleString()}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 p-2">
                            <div className="text-zinc-500 dark:text-zinc-400">Memory Bytes</div>
                            <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                              {resourceDiagnostic.memoryBytes.toLocaleString()}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 p-2">
                            <div className="text-zinc-500 dark:text-zinc-400">Ledger Read / Write</div>
                            <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                              {resourceDiagnostic.ledgerReadBytes.toLocaleString()} /
                              {resourceDiagnostic.ledgerWriteBytes.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>CPU budget usage</span>
                            <span>{Math.round(resourceDiagnostic.ratio * 100)}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700">
                            <div
                              className={`h-full rounded-full ${resourceDiagnostic.ratio > 1 ? "bg-red-500" : resourceDiagnostic.ratio > 0.8 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(100, Math.round(resourceDiagnostic.ratio * 100))}%` }}
                            />
                          </div>
                        </div>
                        {resourceDiagnostic.warnings.length > 0 && (
                          <ul className="space-y-1">
                            {resourceDiagnostic.warnings.map((warning) => (
                              <li
                                key={warning}
                                className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"
                              >
                                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                {warning}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        No simulation data yet. Run a contract simulation to profile gas and Soroban resource budgets.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ConnectWalletModal;