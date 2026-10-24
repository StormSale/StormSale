import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Pencil,
  UserRound,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";

const ROLE_OPTIONS = [
  { value: "ADVERTISER", label: "Advertiser", page: "advertiser" },
  { value: "AFFILIATE", label: "Affiliate", page: "affiliate" },
  { value: "AUDITOR", label: "Auditor", page: "auditor" },
] as const;

interface UserMenuProps {
  onNavigate?: (page: string) => void;
  compact?: boolean;
}

export function UserMenu({ onNavigate, compact = false }: UserMenuProps) {
  const { userAddress } = useWeb3();
  if (!userAddress) return null;

  return (
    <WalletUserMenu
      key={userAddress}
      userAddress={userAddress}
      onNavigate={onNavigate}
      compact={compact}
    />
  );
}

function WalletUserMenu({
  userAddress,
  onNavigate,
  compact = false,
}: UserMenuProps & { userAddress: string }) {
  const { userRole, xlmBalance, updateUserRole, disconnectWallet } = useWeb3();
  const profileKey = userAddress ? `stormsale.profile.displayName.${userAddress}` : null;
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(() => {
    if (!profileKey) return "";
    try {
      return window.localStorage.getItem(profileKey) ?? "";
    } catch {
      return "";
    }
  });
  const [editingName, setEditingName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingRoleRef = useRef<string | null>(null);
  const roleUpdateResolverRef = useRef<((updated: boolean) => void) | null>(null);

  useEffect(() => {
    if (pendingRoleRef.current !== userRole) return;
    pendingRoleRef.current = null;
    roleUpdateResolverRef.current?.(true);
    roleUpdateResolverRef.current = null;
  }, [userRole]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const role = ROLE_OPTIONS.find((option) => option.value === userRole);
  const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

  const saveDisplayName = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = editingName.trim();
    setDisplayName(nextName);
    try {
      if (profileKey) {
        if (nextName) window.localStorage.setItem(profileKey, nextName);
        else window.localStorage.removeItem(profileKey);
      }
    } catch {
      // Keep the current name in memory when browser storage is unavailable.
    }
    setIsEditingName(false);
  };

  const switchRole = async (nextRole: (typeof ROLE_OPTIONS)[number]) => {
    setRoleError(null);
    if (nextRole.value !== userRole) {
      setIsUpdatingRole(true);
      try {
        const updated = await new Promise<boolean>((resolve) => {
          pendingRoleRef.current = nextRole.value;
          roleUpdateResolverRef.current = resolve;
          void updateUserRole(nextRole.value)
            .then(() => {
              window.setTimeout(() => {
                if (pendingRoleRef.current !== nextRole.value) return;
                pendingRoleRef.current = null;
                roleUpdateResolverRef.current = null;
                resolve(false);
              }, 500);
            })
            .catch(() => {
              if (pendingRoleRef.current !== nextRole.value) return;
              pendingRoleRef.current = null;
              roleUpdateResolverRef.current = null;
              resolve(false);
            });
        });
        if (!updated) {
          setRoleError("Your role could not be updated. Check your connection and try again.");
          return;
        }
      } catch {
        setRoleError("Your role could not be updated. Check your connection and try again.");
        return;
      } finally {
        setIsUpdatingRole(false);
      }
    }
    setIsOpen(false);
    onNavigate?.(nextRole.page);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Account menu for ${displayName || shortAddress}`}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex h-10 max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-left text-zinc-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="block max-w-32 truncate text-xs font-semibold">
              {displayName || shortAddress}
            </span>
            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
              {role?.label ?? "Choose a role"}
            </span>
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          aria-label="Account options"
        >
          <div className="border-b border-slate-100 px-3 py-2.5 dark:border-zinc-800">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {displayName || "Wallet profile"}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {shortAddress}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{xlmBalance} XLM</p>
          </div>

          {isEditingName ? (
            <form onSubmit={saveDisplayName} className="space-y-2 p-2">
              <label htmlFor="profile-display-name" className="sr-only">
                Display name
              </label>
              <input
                id="profile-display-name"
                name="displayName"
                autoFocus
                maxLength={40}
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
                placeholder="Display name"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-base sm:text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="rounded-md px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Save
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingName(displayName);
                setIsEditingName(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit local profile name
            </button>
          )}

          <div className="mt-1 border-t border-slate-100 pt-1 dark:border-zinc-800">
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-500">
              Switch role
            </p>
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => void switchRole(option)}
                disabled={isUpdatingRole}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <span className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
                  {option.label}
                </span>
                {option.value === userRole && <Check className="h-4 w-4 text-emerald-600" />}
              </button>
            ))}
          </div>

          {roleError && (
            <p
              role="alert"
              className="mx-2 mt-1 rounded-md bg-rose-50 px-2.5 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {roleError}
            </p>
          )}

          <div className="mt-1 border-t border-slate-100 pt-1 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigate?.("dashboard");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Role selection
            </button>
            {role && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onNavigate?.(role.page);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
                {role.label} dashboard
              </button>
            )}
          </div>

          <div className="mt-1 border-t border-slate-100 pt-1 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                disconnectWallet();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Disconnect wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
