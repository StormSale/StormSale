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
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import type { WalletType } from "../../lib/stellar";

export const ConnectWalletModal: React.FC = () => {
  const { isWalletModalOpen, closeWalletModal, connectWallet } = useWeb3();
  const [connectingType, setConnectingType] = useState<WalletType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [showReadOnlyInput, setShowReadOnlyInput] = useState(false);

  if (!isWalletModalOpen) return null;

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
        "hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
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

          {/* Wallet List */}
          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
            {walletOptions.map((wallet) => {
              const Icon = wallet.icon;
              const isBusy = connectingType === wallet.id;

              return (
                <button
                  key={wallet.id}
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
              Non-custodial & secure
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
