import { Button } from "../../components/ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { useTelegram } from "../../hooks/useTelegram";
import { ThemeToggle } from "./ThemeToggle";
import { TerminologyTooltip, TerminologyGuideButton } from "../ui/tooltip";
import {
  Wallet,
  Menu,
  X,
  Coins,
  ShieldCheck,
  ShieldAlert,
  Send,
  Activity,
  Network,
  LoaderCircle,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "../../assets/logo2.png";
import { UserMenu } from "./UserMenu";
import { useOrganization } from "../../context/OrganizationContext";
import { verifyFreighterNetwork } from "../../lib/networkVerification";
import {
  checkContractIntegrity,
  subscribeToContractIntegrity,
  setContractAddressOverride,
  type ContractIntegrityResult,
} from "../../lib/contractIntegrity";
import { ContractIntegrityModal } from "../auditor/ContractIntegrityModal";
import { EventStreamStatusPill } from "./EventStreamStatusPill";

interface HeaderProps {
  onNavigate?: (page: string) => void;
}

/**
 * Resolves the connected wallet network verification details for Freighter or mock connectors.
 */
export const resolveWalletNetwork = async (
  connectorType: string | null,
  network: string,
): Promise<{ network: string; isStellarNetwork: boolean } | null> => {
  if (connectorType === "freighter") return verifyFreighterNetwork();
  if (connectorType === "mock") {
    const upper = network.toUpperCase();
    return {
      network,
      isStellarNetwork: upper === "TESTNET" || upper === "PUBLIC",
    };
  }
  return null;
};

/**
 * Application header with wallet navigation, status indicators, and network verification controls.
 */
export const Header = ({ onNavigate }: HeaderProps) => {
  const {
    userAddress,
    openWalletModal,
    disconnectWallet,
    isConnected,
    xlmBalance,
    isMultiSigAccount,
    multiSigInfo,
    openMultiSigModal,
    activeRpcEndpoint,
    openRpcModal,
    network,
    connectorType,
    txQueueStatus,
    isTxQueueBusy,
    isBlockdagNetwork,
    walletLabel,
    addBlockdagNetwork,
  } = useWeb3();
  const { organization, currentRole } = useOrganization();
  const { isTelegram, user, platform } = useTelegram();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [networkSwitchMessage, setNetworkSwitchMessage] = useState<string | null>(null);
  const [verifiedNetwork, setVerifiedNetwork] = useState<{
    network: string;
    isStellarNetwork: boolean;
  } | null>(null);
  const [contractIntegrity, setContractIntegrity] = useState<ContractIntegrityResult>(() =>
    checkContractIntegrity(undefined, network),
  );
  const [isContractIntegrityModalOpen, setIsContractIntegrityModalOpen] = useState(false);

  useEffect(() => {
    const evaluated = checkContractIntegrity(undefined, network);
    setContractIntegrity(evaluated);
    if (!evaluated.isVerified) {
      setIsContractIntegrityModalOpen(true);
    }
    const unsubscribe = subscribeToContractIntegrity((updated) => {
      setContractIntegrity(updated);
      if (!updated.isVerified) {
        setIsContractIntegrityModalOpen(true);
      }
    });
    return unsubscribe;
  }, [network]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!isConnected) {
      setVerifiedNetwork(null);
      return;
    }

    const verify = async () => {
      const result = await resolveWalletNetwork(connectorType, network);
      if (!cancelled) setVerifiedNetwork(result);
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [connectorType, isConnected, network]);

  const handleNetworkSwitch = async () => {
    if (isSwitchingNetwork) return;
    setIsSwitchingNetwork(true);
    setNetworkSwitchMessage(null);
    try {
      const result = await resolveWalletNetwork(connectorType, network);
      setVerifiedNetwork(result);
      if (!result) {
        setNetworkSwitchMessage(
          "This wallet's network could not be verified. Check it in your wallet.",
        );
      } else if (!result.isStellarNetwork) {
        setNetworkSwitchMessage(
          `Wallet is on ${result.network}. Switch to Stellar in your wallet, then verify again.`,
        );
      } else {
        setNetworkSwitchMessage(`Wallet network verified: ${result.network}.`);
      }
    } catch {
      setNetworkSwitchMessage(
        "Could not verify the wallet network. Check the wallet and try again.",
      );
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const formatAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;
  const walletText =
    walletLabel && walletLabel.includes(".")
      ? walletLabel
      : userAddress
        ? formatAddress(userAddress)
        : walletLabel;

  const handleAddBlockdag = async () => {
    setIsSwitchingNetwork(true);
    setNetworkSwitchMessage(null);
    try {
      const added = await addBlockdagNetwork();
      setNetworkSwitchMessage(
        added
          ? "BlockDAG network added. Status: Connected."
          : "BlockDAG was not selected. Status: Wrong Network.",
      );
    } catch {
      setNetworkSwitchMessage("Could not add the BlockDAG network in this wallet.");
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "About Us", href: "#about-us" },
    { label: "Features", href: "#features" },
    { label: "How it Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Stats", href: "#stats" },
    { label: "Community", href: "#community" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#community" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-sm tma-safe-top">
      <div className="container mx-auto px-4 py-3 sm:py-4 flex justify-between items-center">
        {/* Logo & TMA Badge */}
        <div className="flex items-center gap-3">
          <a href="/" className="block group">
            <img
              src={logo}
              alt="StormSale Logo"
              className="h-10 sm:h-12 md:h-14 w-auto object-contain group-hover:scale-105 transition-transform duration-300"
            />
          </a>
          {isTelegram && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800/50">
              <Send className="w-3 h-3 text-sky-500" />
              {user ? (user.username ? `@${user.username}` : user.first_name) : `TMA (${platform})`}
            </span>
          )}
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden lg:flex items-center space-x-5">
          {navLinks.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden sm:flex items-center space-x-3">
          <TerminologyGuideButton />
          <button
            type="button"
            onClick={() => void handleAddBlockdag()}
            disabled={isSwitchingNetwork}
            aria-label="Add BlockDAG network"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-2.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200"
          >
            <Network className="h-3.5 w-3.5" aria-hidden="true" />
            <span>BlockDAG</span>
            <span role="status" className={isBlockdagNetwork ? "text-emerald-600" : "text-amber-600"}>
              {isBlockdagNetwork ? "Connected" : "Wrong Network"}
            </span>
          </button>
          {isConnected && (
            <button
              type="button"
              onClick={() => void handleNetworkSwitch()}
              disabled={isSwitchingNetwork}
              aria-label={
                verifiedNetwork?.isStellarNetwork
                  ? `Verified Stellar ${verifiedNetwork.network} wallet network`
                  : "Verify wallet network"
              }
              title="Switch networks in your wallet, then verify the active network here"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-slate-100 disabled:cursor-default dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {isSwitchingNetwork ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Network
                  className={`h-3.5 w-3.5 ${verifiedNetwork?.isStellarNetwork ? "text-emerald-600" : "text-amber-600"}`}
                  aria-hidden="true"
                />
              )}
              <span>
                {verifiedNetwork ? `Wallet: ${verifiedNetwork.network}` : "Verify wallet network"}
              </span>
            </button>
          )}
          {/* RPC Status Indicator Pill */}
          <button
            type="button"
            onClick={openRpcModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-100/70 dark:bg-zinc-900/70 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold cursor-pointer"
            title={`Active Soroban & BlockDAG RPC: ${activeRpcEndpoint?.name || "Primary"} (${activeRpcEndpoint?.status || "healthy"}). Click to inspect fallbacks.`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                activeRpcEndpoint?.status === "healthy"
                  ? "bg-emerald-500 animate-pulse"
                  : activeRpcEndpoint?.status === "degraded"
                    ? "bg-amber-500"
                    : activeRpcEndpoint?.status === "unreachable"
                      ? "bg-rose-500"
                      : "bg-indigo-500"
              }`}
            />
            <Activity className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
              {activeRpcEndpoint?.type === "local"
                ? "Local Node"
                : activeRpcEndpoint?.type === "blockdag"
                  ? "BlockDAG"
                  : "RPC"}
            </span>
            {activeRpcEndpoint?.latencyMs !== null && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono hidden md:inline">
                {activeRpcEndpoint?.latencyMs}ms
              </span>
            )}
          </button>
          {/* Real-Time Soroban Events Status HUD Pill */}
          <EventStreamStatusPill className="hidden lg:inline-flex" />
          {/* Contract Integrity Indicator Pill */}
          <button
            type="button"
            onClick={() => setIsContractIntegrityModalOpen(true)}
            data-testid="contract-integrity-indicator"
            aria-label={
              contractIntegrity.isVerified
                ? "Contract Integrity: Verified"
                : "Contract Integrity: Warning Mismatch"
            }
            title={
              contractIntegrity.isVerified
                ? `Verified Soroban Contract: ${contractIntegrity.configuredAddress}`
                : "Security Alert: Contract Address Mismatch Detected"
            }
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-all cursor-pointer ${
              contractIntegrity.isVerified
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
                : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 animate-pulse font-bold"
            }`}
          >
            {contractIntegrity.isVerified ? (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            )}
            <span className="font-mono text-[11px]">
              {contractIntegrity.isVerified ? "Verified" : "Mismatch"}
            </span>
          </button>

          {/* In-Flight Transaction Queue Status Widget (#130) */}
          {(() => {
            const isProcessing = Boolean(txQueueStatus?.isProcessing);
            const inFlightDesc = txQueueStatus?.inFlight
              ? txQueueStatus.inFlight.description
              : "None";
            const currentSeq = txQueueStatus?.currentOptimisticSequence || "Synced";
            const resyncs = txQueueStatus?.resyncCount || 0;
            const pendingTotal =
              (txQueueStatus?.pendingCount || 0) + (txQueueStatus?.inFlight ? 1 : 0);
            const isBusy = Boolean(isTxQueueBusy || isProcessing || pendingTotal > 0);

            return (
              <div
                data-testid="tx-queue-status"
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-100/70 dark:bg-zinc-900/70 text-xs font-semibold"
                title={`Stellar Tx Queue: ${isProcessing ? "Processing" : "Idle"}. In-flight: ${inFlightDesc}. Sequence: ${currentSeq}. Resyncs: ${resyncs}.`}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono text-[11px]">
                      Queue: {pendingTotal} in-flight
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px] hidden sm:inline">
                      Queue: Idle
                    </span>
                  </>
                )}
                {resyncs > 0 && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-mono">
                    Resyncs: {resyncs}
                  </span>
                )}
              </div>
            );
          })()}

          <ThemeToggle />

          {isConnected ? (
            <div className="flex items-center space-x-2.5">
              {/* Organization Switcher (#489) */}
              <div
                data-testid="organization-switcher"
                className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 text-xs font-semibold cursor-pointer shadow-sm hover:border-indigo-500/40 transition-colors"
                title={`Active Enterprise Organization: ${organization?.name || "StormSale Enterprise"}`}
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]" data-testid="org-switcher-name">
                  {organization?.name || "Enterprise"}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase"
                  data-testid="org-switcher-role"
                >
                  {currentRole === "CAMPAIGN_MANAGER"
                    ? "Campaign Manager"
                    : currentRole === "ADMIN"
                      ? "Admin"
                      : currentRole || "Member"}
                </span>
              </div>

              <UserMenu onNavigate={onNavigate} />

              {isMultiSigAccount && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openMultiSigModal()}
                  className="h-9 px-3 rounded-xl border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-xs transition-all flex items-center space-x-1.5"
                  title="Stellar SEP-0030 Multi-Signature Escrow Coordination"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Multi-Sig ({multiSigInfo?.signers.length || 2})</span>
                </Button>
              )}
            </div>
          ) : (
            <Button
              onClick={openWalletModal}
              className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all"
            >
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </Button>
          )}
        </div>

        {/* Mobile / Tablet Controls (Right) */}
        <div className="flex sm:hidden items-center space-x-2">
          {/* Mobile RPC Status Button */}
          <button
            type="button"
            onClick={openRpcModal}
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 relative"
            title="Soroban & BlockDAG RPC Health"
            aria-label="RPC Status"
          >
            <span
              className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                activeRpcEndpoint?.status === "healthy"
                  ? "bg-emerald-500"
                  : activeRpcEndpoint?.status === "degraded"
                    ? "bg-amber-500"
                    : activeRpcEndpoint?.status === "unreachable"
                      ? "bg-rose-500"
                      : "bg-indigo-500"
              }`}
            />
            <Activity className="w-4 h-4" />
          </button>

          {isConnected && (
            <button
              type="button"
              onClick={() => void handleNetworkSwitch()}
              disabled={isSwitchingNetwork}
              aria-label={
                verifiedNetwork?.isStellarNetwork
                  ? `Verified Stellar ${verifiedNetwork.network} wallet network`
                  : "Verify wallet network"
              }
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:cursor-default"
            >
              {isSwitchingNetwork ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Network
                  className={`h-4 w-4 ${verifiedNetwork?.isStellarNetwork ? "text-emerald-600" : "text-amber-600"}`}
                  aria-hidden="true"
                />
              )}
            </button>
          )}

          {/* Mobile Contract Integrity Indicator Button */}
          <button
            type="button"
            onClick={() => setIsContractIntegrityModalOpen(true)}
            data-testid="mobile-contract-integrity-indicator"
            aria-label={
              contractIntegrity.isVerified
                ? "Contract Integrity: Verified"
                : "Contract Integrity: Warning Mismatch"
            }
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 relative cursor-pointer"
            title={
              contractIntegrity.isVerified
                ? `Verified Soroban Contract: ${contractIntegrity.configuredAddress}`
                : "Security Warning: Contract Address Mismatch Detected"
            }
          >
            <span
              className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                contractIntegrity.isVerified ? "bg-emerald-500" : "bg-rose-500 animate-ping"
              }`}
            />
            {contractIntegrity.isVerified ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            )}
          </button>

          <ThemeToggle />
          {!isConnected ? (
            <Button
              size="sm"
              onClick={openWalletModal}
              className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
            >
              <Wallet className="w-3.5 h-3.5 mr-1" />
              Connect
            </Button>
          ) : (
            <UserMenu compact onNavigate={onNavigate} />
          )}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {networkSwitchMessage && (
        <p
          role="status"
          className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-center text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {networkSwitchMessage}
        </p>
      )}

      {/* Mobile Dropdown Navigation Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <div
              data-testid="mobile-drawer-overlay"
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            />
            <motion.div
              data-testid="mobile-navigation-drawer"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="relative z-50 sm:hidden border-t border-slate-200 dark:border-zinc-800 bg-white/98 dark:bg-zinc-950/98 backdrop-blur-xl px-4 py-4 space-y-3"
            >
            {isConnected && (
              <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-zinc-400">CONNECTED WALLET</div>
                    <div className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                      {walletText}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-bold text-zinc-400">BALANCE</div>
                  <TerminologyTooltip term="xlm" side="bottom">
                    <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center cursor-help">
                      <Coins className="w-3 h-3 mr-1" />
                      {xlmBalance} XLM
                    </div>
                  </TerminologyTooltip>
                </div>
              </div>
            )}

            <div className="pb-1">
              <TerminologyGuideButton className="w-full justify-center" />
            </div>

            {isConnected && isMultiSigAccount && (
              <button
                onClick={() => {
                  openMultiSigModal();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold mb-2"
              >
                <span className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Multi-Sig Escrow Approvals</span>
                </span>
                <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                  SEP-0030
                </span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              {navLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
              {isConnected ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    disconnectWallet();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                >
                  Disconnect Wallet
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    openWalletModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  <Wallet className="w-3.5 h-3.5 mr-2" />
                  Select Stellar Wallet
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
      <ContractIntegrityModal
        isOpen={isContractIntegrityModalOpen}
        onClose={() => setIsContractIntegrityModalOpen(false)}
        integrity={contractIntegrity}
        onReset={() => setContractAddressOverride(null)}
      />
    </header>
  );
};
