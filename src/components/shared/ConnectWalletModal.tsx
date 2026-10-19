import React, { useState, useEffect } from "react";
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
  Fingerprint,
  Usb,
  ChevronDown,
  QrCode,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import { useWalletConnect } from "../../context/WalletConnectContext";
import type { WalletType } from "../../lib/stellar";

export const ConnectWalletModal: React.FC = () => {
  const { isWalletModalOpen, closeWalletModal, connectWallet } = useWeb3();
  const { connect: connectWalletConnect } = useWalletConnect();
  const [connectingType, setConnectingType] = useState<WalletType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [showReadOnlyInput, setShowReadOnlyInput] = useState(false);

  // Ledger hardware path state
  const [showLedgerSettings, setShowLedgerSettings] = useState(false);
  const [ledgerAccountIndex, setLedgerAccountIndex] = useState(0);
  const [customBipPath, setCustomBipPath] = useState("m/44'/148'/0'");
  const [useCustomPath, setUseCustomPath] = useState(false);

  // SEP-0007 mobile wallet state
  const [sep7Uri, setSep7Uri] = useState<string | null>(null);
  const [sep7Polling, setSep7Polling] = useState(false);
  const [sep7Confirmed, setSep7Confirmed] = useState(false);
  const [sep7Hash, setSep7Hash] = useState<string | null>(null);

  // Poll Horizon for transaction inclusion while SEP-0007 is pending
  useEffect(() => {
    if (!sep7Polling || !sep7Uri) return;
    let cancelled = false;
    let streaker: { close?: () => void } | null = null;

    (async () => {
      try {
        const { watchSep7Transaction } = await import("../../lib/stellar");
        streaker = await watchSep7Transaction(sep7Uri, (hash) => {
          if (cancelled) return;
          setSep7Hash(hash);
          setSep7Confirmed(true);
          setSep7Polling(false);
        });
      } catch (err) {
        if (!cancelled) {
          console.error("SEP-0007 streaming error:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        streaker?.close?.();
      } catch {
        // ignore close errors
      }
    };
  }, [sep7Polling, sep7Uri]);

  if (!isWalletModalOpen) return null;

  const getActiveBipPath = () => {
    if (useCustomPath) {
      return customBipPath.trim() || "m/44'/148'/0'";
    }
    return `m/44'/148'/${ledgerAccountIndex}'`;
  };

  const handleSelectWallet = async (type: WalletType) => {
    if (type === "readonly" && !showReadOnlyInput) {
      setShowReadOnlyInput(true);
      return;
    }

    setConnectingType(type);
    setErrorMessage(null);

    try {
      if (type === "readonly") {
        const trimmed = customKey.trim();
        if (!trimmed.startsWith("G") || trimmed.length !== 56) {
          throw new Error(
            "Invalid Stellar public key format. Keys start with 'G' and are 56 characters.",
          );
        }
        await connectWallet("readonly", trimmed);
      } else if ((type as string) === "walletconnect") {
        await connectWalletConnect();
      } else if ((type as string) === "sep7") {
        const { buildSep7TxUri } = await import("../../lib/stellar");
        const uri = await buildSep7TxUri();
        setSep7Uri(uri);
        setSep7Polling(true);
        setSep7Confirmed(false);
        setSep7Hash(null);
        // Trigger the installed mobile wallet deep-link
        try {
          window.location.href = uri;
        } catch (deepLinkErr) {
          console.warn("Unable to open deep-link automatically:", deepLinkErr);
        }
        return;
      } else {
        await connectWallet(type);
      }
      closeWalletModal();
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

  const walletOptions = [
    {
      id: "passkey" as WalletType,
      name: "Continue with Passkey",
      badge: "FaceID / Fingerprint",
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
      badgeColor: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
      description:
        "Connect via WalletConnect protocol with mobile wallets or desktop apps.",
      icon: Smartphone,
      accent: "from-blue-600 to-cyan-600",
      borderHover: "hover:border-blue-500/55 hover:bg-blue-50/50 dark:hover:bg-blue-950/20",
    },
    {
      id: "sep7" as any,
      name: "Sign with SEP-0007 Mobile Wallet",
      badge: "web+stellar:tx",
      badgeColor: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      description:
        "Open your installed mobile wallet (LOBSTR, Solar, etc.) via the standard Stellar SEP-0007 URI scheme to sign the transaction.",
      icon: QrCode,
      accent: "from-indigo-600 to-violet-600",
      borderHover:
        "hover:border-indigo-500/55 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20",
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
                  Stellar Network • Soroban Smart Accounts
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight mt-1">
                Connect Stellar Wallet
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                Select your preferred hardware, biometric passkey, or extension wallet.
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
                <span className="font-semibold block">Connection Notice</span>
                <span>{errorMessage}</span>
              </div>
            </motion.div>
          )}

          {/* Connecting State Prompt */}
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

          {/* SEP-0007 Mobile Wallet Panel */}
          {sep7Uri && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mx-6 mt-4 p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl text-xs text-indigo-800 dark:text-indigo-300 space-y-3"
            >
              <div className="flex items-center space-x-2 font-bold">
                {sep7Confirmed ? (
                  <CheckCircle2 className="w-4 h-4  text-emerald-600" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                )}
                <span>
                  {sep7Confirmed
                    ? "Transaction confirmed on the Stellar ledger"
                    : "Awaiting confirmation on the Stellar ledger..."}
                </span>
              </div>

              {!sep7Confirmed && (
                <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
                  Open the transaction in your mobile wallet (LOBSTR, Solar, etc.) and approve the signature. This screen will poll Horizon until the transaction is included.
                </p>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="bg-white dark:bg-white p-2 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <img
                    alt="SEP-0007 transaction QR code"
                    width={144}
                    height={144}
                    src={`https://api.qrserver.com/v1/create-qr-code?size=144x144&data=${encodeURIComponent(sep7Uri)}`}
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="text-[11px] font-mono break-all bg-white/40 dark:bg-black/30 rounded-lg p-2 max-h-24 overflow-auto">
                    {sep7Uri}
                  </div>
                  <a
                    href={sep7Uri}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Mobile Wallet</span>
                  </a>
                  {sep7Hash && (
                    <div className="text-[11px] font-mono break-all text-emerald-700 dark:text-emerald-400">
                      Tx hash: {sep7Hash}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Wallet Options List */}
          <div className="p-6 space-y-2.5 max-h-[60vh] overflow-y-auto">
            {walletOptions.map((option) => {
              const Icon = option.icon;
              const isConnecting = connectingType === option.id;
              return (
                <div key={String(option.id)}>
                  <button
                    onClick={() => handleSelectWallet(option.id)}
                    disabled={connectingType !== null}
                    className={`text-left w-full flex items-start space-x-3 p-3.5 rounded-2xl border transition-all ${option.borderHover} ${option.featured ? "border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/10" : "border-slate-200 dark:border-zinc-800"} disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <div
                      className={`h-10 w-10 rounded-xl bg-gradient-to-br ${option.accent} flex items-center justify-center text-white shrink-0`}
                    >
                      {isConnecting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">
                          {option.name}
                        </span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${option.badgeColor}`}>
                          {option.badge}
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {option.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {option.hasSettings && (
                        <button
                          type="button"
                          onClick={(e)=> {
                            e.stopPropagation();
                            setShowLedgerSettings((v) => !v);
                          }}
                          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                        >
                          <ChevronDown
                            className={`w-4 h-4 rounded transition-transform ${showLedgerSettings ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                      <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                    </div>
                  </button>

                  {option.hasSettings && showLedgerSettings && (
                    <div className="mt-2 p-3 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded-xl space-y-2 text-xs">
                      <label className="flex items-center space-x-2 text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={useCustomPath}
                          onChange={(e) => setUseCustomPath(e.target.checked)}
                        />
                        <span>Use custom BIP-44 derivation path</span>
                      </label>
                      {useCustomPath ? (
                        <input
                          type="text"
                          value={customBipPath}
                          onChange={(e) => setCustomBipPath(e.target.value)}
                          className="w-full p-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-xs"
                        />
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="text-zinc-600 dark:text-zinc-400">Account index</span>
                          <input
                            type="number"
                            min={0}
                            value={ledgerAccountIndex}
                            onChange={(e) => setLedgerAccountIndex(Math.max(0, Number(e.target.value) || 0))}
                            className="w-20 p-1.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                          />
                        </div>
                      )}
                      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                        Active path: {getActiveBipPath()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ReadOnly input */}
            {showReadOnlyInput && (
              <div className="mt-2 p-3.5 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded-xl space-y-2">
                <label className="flex items-center space-x-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  <Key className="w-4 h-4" />
                  <span>Watch-only public key</span>
                </label>
                <input
                  type="text"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="G356..."
                  className="w-full p-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-xs"
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
