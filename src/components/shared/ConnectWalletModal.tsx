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
  Fingerprint,
  Usb,
  ChevronDown,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import type { WalletType } from "../../lib/stellar";

export const ConnectWalletModal: React.FC = () => {
  const { isWalletModalOpen, closeWalletModal, connectWallet } = useWeb3();
  const [connectingType, setConnectingType] = useState<WalletType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [showReadOnlyInput, setShowReadOnlyInput] = useState(false);

  // Ledger hardware path state
  const [showLedgerSettings, setShowLedgerSettings] = useState(false);
  const [ledgerAccountIndex, setLedgerAccountIndex] = useState(0);
  const [customBipPath, setCustomBipPath] = useState("m/44'/148'/0'");
  const [useCustomPath, setUseCustomPath] = useState(false);

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
      } else if (type === "ledger") {
        const bipPath = getActiveBipPath();
        await connectWallet("ledger", undefined, bipPath);
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
      borderHover: "hover:border-purple-500/50 hover:bg-purple-50/50 dark:hover:bg-purple-950/20",
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

          {/* Wallet List */}
          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
            {walletOptions.map((wallet) => {
              const Icon = wallet.icon;
              const isBusy = connectingType === wallet.id;

              return (
                <div key={wallet.id} className="space-y-2">
                  <button
                    disabled={connectingType !== null}
                    onClick={() => handleSelectWallet(wallet.id)}
                    className={`w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40 transition-all group flex items-center space-x-4 ${wallet.borderHover} ${
                      isBusy ? "opacity-70 pointer-events-none" : ""
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${wallet.accent} flex items-center justify-center text-white shadow-md shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      {isBusy ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm sm:text-base text-zinc-900 dark:text-white truncate">
                          {wallet.name}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${wallet.badgeColor}`}
                        >
                          {wallet.badge}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {wallet.description}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
                  </button>

                  {/* Ledger Derivation Path Customizer Accordion */}
                  {wallet.id === "ledger" && (
                    <div className="px-2">
                      <button
                        type="button"
                        onClick={() => setShowLedgerSettings(!showLedgerSettings)}
                        className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center space-x-1 transition-colors"
                      >
                        <span>Derivation Path: {getActiveBipPath()}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${showLedgerSettings ? "rotate-180" : ""}`}
                        />
                      </button>

                      {showLedgerSettings && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-2 p-3.5 bg-slate-100/70 dark:bg-zinc-800/60 rounded-xl border border-slate-200 dark:border-zinc-700/60 space-y-2 text-xs"
                        >
                          <div className="font-bold text-zinc-800 dark:text-zinc-200">
                            BIP-44 Derivation Path Selection
                          </div>
                          <div className="flex items-center space-x-2">
                            {[0, 1, 2].map((idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setLedgerAccountIndex(idx);
                                  setUseCustomPath(false);
                                }}
                                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-colors ${
                                  !useCustomPath && ledgerAccountIndex === idx
                                    ? "bg-emerald-600 text-white"
                                    : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
                                }`}
                              >
                                Account #{idx} (m/44'/148'/{idx}')
                              </button>
                            ))}
                          </div>

                          <div className="pt-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                              Or Custom BIP-44 Path
                            </label>
                            <input
                              type="text"
                              value={customBipPath}
                              onChange={(e) => {
                                setCustomBipPath(e.target.value);
                                setUseCustomPath(true);
                              }}
                              placeholder="m/44'/148'/0'"
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-mono text-zinc-900 dark:text-white"
                            />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Read-Only Stellar Address Option */}
            <div className="pt-2">
              {!showReadOnlyInput ? (
                <button
                  onClick={() => setShowReadOnlyInput(true)}
                  className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 flex items-center justify-center space-x-2 transition-colors"
                >
                  <Key className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Or enter Stellar Public Key (Read-Only Watch Mode)</span>
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-4 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-2.5"
                >
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Stellar Public Key (G...)
                  </label>
                  <input
                    type="text"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setShowReadOnlyInput(false)}
                      className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSelectWallet("readonly")}
                      className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold rounded-xl"
                    >
                      Connect Watch Key
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Footer Note */}
          <div className="p-4 bg-slate-50 dark:bg-zinc-950/60 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center">
              <Shield className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
              Non-custodial, WebHID & WebAuthn P-256
            </span>
            <a
              href="https://stellar.org/soroban"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center font-medium transition-colors"
            >
              Powered by Soroban
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
