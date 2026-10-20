import React, { useState } from "react";
import { useWeb3 } from "../../hooks/useWeb3";
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Wallet,
  ArrowRight,
  RefreshCw,
  Megaphone,
  Users,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../ui/button";

export type ProtocolRole = "ADVERTISER" | "AFFILIATE" | "AUDITOR";

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole: ProtocolRole | ProtocolRole[];
  onNavigate?: (page: string) => void;
  fallback?: React.ReactNode;
}

const ROLE_METADATA: Record<
  ProtocolRole,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    badgeClass: string;
  }
> = {
  ADVERTISER: {
    title: "Advertiser",
    description: "Deploy Soroban escrow contracts, fund campaign budgets, and verify sales.",
    icon: Megaphone,
    accentColor: "indigo",
    badgeClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
  },
  AFFILIATE: {
    title: "Affiliate",
    description: "Join campaigns, promote tracked links, and claim automated XLM payouts.",
    icon: Users,
    accentColor: "emerald",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  },
  AUDITOR: {
    title: "Auditor",
    description: "Inspect cryptographic conversion hashes, Merkle trees, and regulatory audits.",
    icon: Eye,
    accentColor: "slate",
    badgeClass:
      "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border-slate-200 dark:border-zinc-700",
  },
};

/**
 * Format 56-character Stellar address for compact display.
 */
function formatStellarAddress(address: string): string {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Role-Based Access Control (RBAC) Route Guard.
 *
 * Enforces:
 * 1. Connected Stellar wallet session verification.
 * 2. Onboarding flow for new/unregistered wallets without a role.
 * 3. Strict unauthorized banner & redirection for direct page bypass attempts.
 * 4. Transparent pass-through for matching authorized roles.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  onNavigate,
  fallback,
}) => {
  const { userAddress, userRole, isConnected, openWalletModal, updateUserRole } = useWeb3();
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedOnboardingRole, setSelectedOnboardingRole] = useState<ProtocolRole>(
    Array.isArray(requiredRole) ? requiredRole[0] : requiredRole,
  );

  const allowedRoles = Array.isArray(requiredRole)
    ? requiredRole.map((r) => r.toUpperCase())
    : [requiredRole.toUpperCase()];

  const isAuthorized =
    isConnected && userRole !== null && allowedRoles.includes(userRole.toUpperCase());

  // 1. Unauthenticated State: Wallet not connected
  if (!isConnected) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-xl space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white">
              Authentication Required
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Access to this dashboard requires an authenticated Stellar wallet connection.
            </p>
          </div>

          <div className="pt-2">
            <Button
              onClick={openWalletModal}
              className="w-full h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              Connect Stellar Wallet
            </Button>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("dashboard")}
              className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            >
              Back to Overview
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. Unregistered / New Wallet: Guide to select and register primary role first
  if (!userRole) {
    const handleRegisterPrimaryRole = async () => {
      setIsRegistering(true);
      try {
        await updateUserRole(selectedOnboardingRole);
      } catch (err) {
        console.error("Failed to register primary role:", err);
      } finally {
        setIsRegistering(false);
      }
    };

    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div
          data-testid="role-onboarding-card"
          className="max-w-xl w-full p-6 sm:p-8 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl space-y-6"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
                Select Your Primary Role
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                Connected:{" "}
                <span className="font-mono font-bold">
                  {formatStellarAddress(userAddress || "")}
                </span>
              </p>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            Welcome to StormSale. Your Stellar wallet does not have a registered primary role yet.
            Please select and register your persona below to proceed to your dashboard.
          </p>

          {/* Role Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["ADVERTISER", "AFFILIATE", "AUDITOR"] as ProtocolRole[]).map((role) => {
              const meta = ROLE_METADATA[role];
              const Icon = meta.icon;
              const isSelected = selectedOnboardingRole === role;

              return (
                <div
                  key={role}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedOnboardingRole(role)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between select-none ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 shadow-md"
                      : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-transparent"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="font-bold text-sm text-zinc-900 dark:text-white">
                      {meta.title}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                      {meta.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-slate-100 dark:bg-zinc-800 text-zinc-500 border-transparent"
                      }`}
                    >
                      {isSelected ? "Selected" : "Choose"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <Button
              onClick={handleRegisterPrimaryRole}
              disabled={isRegistering}
              className="w-full sm:flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
              {isRegistering ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Registering Role...</span>
                </>
              ) : (
                <>
                  <span>{`Register as ${ROLE_METADATA[selectedOnboardingRole].title}`}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            {onNavigate && (
              <Button
                variant="outline"
                onClick={() => onNavigate("dashboard")}
                className="w-full sm:w-auto h-12 px-5 rounded-xl border-slate-200 dark:border-zinc-800 font-semibold text-xs"
              >
                Back to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Unauthorized State: Direct Page Bypass attempted by mismatched role
  if (!isAuthorized) {
    const primaryRequired = allowedRoles[0];
    const userRoleDisplay = userRole ? userRole.toUpperCase() : "UNKNOWN";

    const handleSwitchRole = async () => {
      setIsRegistering(true);
      try {
        await updateUserRole(primaryRequired);
      } catch (err) {
        console.error("Failed to switch role:", err);
      } finally {
        setIsRegistering(false);
      }
    };

    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div
          role="alert"
          data-testid="unauthorized-banner"
          className="max-w-xl w-full p-6 sm:p-8 bg-white dark:bg-zinc-900 border-2 border-rose-500/30 dark:border-rose-500/40 rounded-3xl shadow-2xl space-y-6"
        >
          {/* Warning Banner Header */}
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-black text-rose-950 dark:text-rose-200">
                Access Restricted: Direct Page Bypass Detected
              </h3>
              <p className="text-xs sm:text-sm text-rose-800 dark:text-rose-300/80 leading-relaxed">
                Your connected wallet is registered as{" "}
                <span className="font-bold underline decoration-rose-400">{userRoleDisplay}</span>.
                Direct navigation to the private{" "}
                <span className="font-bold uppercase">{primaryRequired}</span> dashboard is
                restricted under Role-Based Access Control policies.
              </p>
            </div>
          </div>

          {/* Wallet and Role Status Details */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">Connected Wallet</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {formatStellarAddress(userAddress || "")}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                Active Session Role
              </span>
              <span className="font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 uppercase text-[10px]">
                {userRoleDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                Required Authorization
              </span>
              <span className="font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40 uppercase text-[10px]">
                {allowedRoles.join(" OR ")}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Button
              onClick={() => onNavigate && onNavigate(userRole.toLowerCase())}
              className="w-full sm:flex-1 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-white font-bold text-xs sm:text-sm shadow-md"
            >
              <span>{`Go to My ${userRoleDisplay} Dashboard`}</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleSwitchRole}
              disabled={isRegistering}
              className="w-full sm:flex-1 h-12 rounded-xl border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 font-bold text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-2"
            >
              {isRegistering ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
              <span>{`Switch Role to ${primaryRequired}`}</span>
            </Button>

            {onNavigate && (
              <Button
                variant="ghost"
                onClick={() => onNavigate("dashboard")}
                className="w-full sm:w-auto h-12 px-4 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                Back to Home
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized State: Pass-through
  return <>{children}</>;
};
