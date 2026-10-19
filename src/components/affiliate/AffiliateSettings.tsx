import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useNotification } from "../../context/NotificationContext";
import {
  type SplitDestination,
  validateSplitPlan,
} from "../../lib/commissionSplit";
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  BellRing,
  DollarSign,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  Save,
  AlertCircle,
  PieChart,
  Plus,
  Trash2,
} from "lucide-react";

export type ThemeOption = "light" | "dark" | "system";
export type NotificationFrequency = "instant" | "muted";

export interface AffiliatePreferences {
  theme: ThemeOption;
  notificationFrequency: NotificationFrequency;
  notifyOnCommission: boolean;
  notifyOnClearingMaturity: boolean;
  notifyOnPayoutSettled: boolean;
  preferredAsset: "XLM" | "USDC" | "EURC";
  minClaimThreshold: string;
  autoSplitEnabled: boolean;
  autoSplitDestinations: SplitDestination[];
}

export const DEFAULT_PREFERENCES: AffiliatePreferences = {
  theme: "dark",
  notificationFrequency: "instant",
  notifyOnCommission: true,
  notifyOnClearingMaturity: true,
  notifyOnPayoutSettled: true,
  preferredAsset: "XLM",
  minClaimThreshold: "20.0",
  autoSplitEnabled: false,
  autoSplitDestinations: [],
};

export const SETTINGS_STORAGE_KEY = "stormsale_affiliate_settings";

/**
 * Coerces unknown persisted data into well-formed split destinations so a
 * corrupted payload can never crash the payout flow.
 */
export function sanitizeSplitDestinations(raw: unknown): SplitDestination[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (d): d is Record<string, unknown> => d !== null && typeof d === "object",
    )
    .map((d, i) => ({
      id:
        typeof d.id === "string" && d.id.length > 0
          ? d.id
          : `split-${i}-${Math.random().toString(36).slice(2, 9)}`,
      label: typeof d.label === "string" ? d.label.slice(0, 48) : "",
      address: typeof d.address === "string" ? d.address.trim().toUpperCase() : "",
      percentage:
        typeof d.percentage === "number" && Number.isFinite(d.percentage)
          ? Math.min(Math.max(d.percentage, 0), 100)
          : 0,
    }));
}

export function loadAffiliatePreferences(): AffiliatePreferences {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_PREFERENCES;
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      // Check legacy darkMode key if explicitly set
      const legacyDark = localStorage.getItem("darkMode");
      if (legacyDark !== null) {
        return {
          ...DEFAULT_PREFERENCES,
          theme: legacyDark === "true" ? "dark" : "light",
        };
      }
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw);
    const notificationFrequency: NotificationFrequency =
      parsed.notificationFrequency === "muted" ? "muted" : "instant";
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      notificationFrequency,
      autoSplitEnabled: parsed.autoSplitEnabled === true,
      autoSplitDestinations: sanitizeSplitDestinations(parsed.autoSplitDestinations),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export type NotificationTriggerEvent = "commission" | "clearing" | "payout";

export function shouldDeliverAffiliateNotification(
  event: NotificationTriggerEvent,
  prefs: AffiliatePreferences = loadAffiliatePreferences()
): boolean {
  if (prefs.notificationFrequency === "muted") return false;
  if (event === "commission" && !prefs.notifyOnCommission) return false;
  if (event === "clearing" && !prefs.notifyOnClearingMaturity) return false;
  if (event === "payout" && !prefs.notifyOnPayoutSettled) return false;
  return prefs.notificationFrequency === "instant";
}

export function syncSystemThemeListener(
  mediaQuery: {
    matches: boolean;
    addEventListener?: any;
    removeEventListener?: any;
    addListener?: any;
    removeListener?: any;
  },
  onThemeChange?: (isDark: boolean) => void
): () => void {
  const applySystemTheme = () => {
    const isDark = Boolean(mediaQuery.matches);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", isDark);
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("darkMode", isDark ? "true" : "false");
      }
    } catch {
      // Degrade gracefully if storage is blocked
    }
    if (onThemeChange) {
      onThemeChange(isDark);
    }
  };
  applySystemTheme();

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", applySystemTheme);
    return () => mediaQuery.removeEventListener("change", applySystemTheme);
  } else if (typeof (mediaQuery as any).addListener === "function") {
    (mediaQuery as any).addListener(applySystemTheme);
    return () => (mediaQuery as any).removeListener(applySystemTheme);
  }
  return () => {};
}

export function saveAffiliatePreferences(prefs: AffiliatePreferences): boolean {
  try {
    if (typeof localStorage === "undefined") return false;

    // Snapshot existing values before writing either key
    const prevSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const prevDarkMode = localStorage.getItem("darkMode");

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(prefs));
      // Sync with legacy theme toggle key
      const isDark =
        prefs.theme === "dark" ||
        (prefs.theme === "system" &&
          typeof window !== "undefined" &&
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      localStorage.setItem("darkMode", isDark ? "true" : "false");
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", Boolean(isDark));
      }
      return true;
    } catch (writeError) {
      // Rollback both keys if either write fails
      try {
        if (prevSettings !== null) {
          localStorage.setItem(SETTINGS_STORAGE_KEY, prevSettings);
        } else {
          localStorage.removeItem(SETTINGS_STORAGE_KEY);
        }
      } catch {
        // Keep rollback failures from replacing the original save failure
      }

      try {
        if (prevDarkMode !== null) {
          localStorage.setItem("darkMode", prevDarkMode);
        } else {
          localStorage.removeItem("darkMode");
        }
      } catch {
        // Keep rollback failures from replacing the original save failure
      }

      console.error("Failed to save affiliate preferences:", writeError);
      return false;
    }
  } catch (e) {
    console.error("Storage access failed for affiliate preferences:", e);
    return false;
  }
}

export const AffiliateSettings: React.FC = () => {
  const { showNotification } = useNotification();
  const [preferences, setPreferences] = useState<AffiliatePreferences>(loadAffiliatePreferences);
  const [isSaved, setIsSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (preferences.theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      return syncSystemThemeListener(mediaQuery);
    } else {
      const isDark = preferences.theme === "dark";
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", isDark);
      }
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("darkMode", isDark ? "true" : "false");
        }
      } catch {
        // Degrade gracefully if storage is blocked
      }
    }
  }, [preferences.theme]);

  // Synchronize state when theme is changed via external ThemeToggle
  useEffect(() => {
    const handleStorage = () => {
      const latest = loadAffiliatePreferences();
      setPreferences((prev) => {
        if (prev.theme !== latest.theme) {
          return { ...prev, theme: latest.theme };
        }
        return prev;
      });
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const handleThemeChange = (newTheme: ThemeOption) => {
    setPreferences((prev) => ({ ...prev, theme: newTheme }));
    const saved = loadAffiliatePreferences();
    if (!saveAffiliatePreferences({ ...saved, theme: newTheme })) {
      showNotification({
        type: "error",
        title: "Theme Not Saved",
        message: "Browser storage is unavailable. The theme resets after reload.",
      });
      return;
    }
    window.dispatchEvent(new Event("storage"));
  };

  const handleFrequencyChange = (freq: NotificationFrequency) => {
    const updated = { ...preferences, notificationFrequency: freq };
    setPreferences(updated);
  };

  // Commission Auto-Split plan editing (Issue #167)
  const splitValidation = validateSplitPlan({
    enabled: preferences.autoSplitEnabled,
    destinations: preferences.autoSplitDestinations,
  });

  const handleAutoSplitToggle = () => {
    setPreferences((prev) => {
      const enabled = !prev.autoSplitEnabled;
      const destinations =
        enabled && prev.autoSplitDestinations.length === 0
          ? [
              {
                id: `split-main-${Math.random().toString(36).slice(2, 9)}`,
                label: "Main Wallet",
                address: "",
                percentage: 70,
              },
              {
                id: `split-vault-${Math.random().toString(36).slice(2, 9)}`,
                label: "Cold Storage Vault",
                address: "",
                percentage: 30,
              },
            ]
          : prev.autoSplitDestinations;
      return { ...prev, autoSplitEnabled: enabled, autoSplitDestinations: destinations };
    });
  };

  const handleSplitDestinationChange = (
    id: string,
    patch: Partial<Omit<SplitDestination, "id">>,
  ) => {
    setPreferences((prev) => ({
      ...prev,
      autoSplitDestinations: prev.autoSplitDestinations.map((d) =>
        d.id === id ? { ...d, ...patch } : d,
      ),
    }));
  };

  const handleAddSplitDestination = () => {
    setPreferences((prev) => {
      const used = prev.autoSplitDestinations.reduce((acc, d) => acc + d.percentage, 0);
      return {
        ...prev,
        autoSplitDestinations: [
          ...prev.autoSplitDestinations,
          {
            id: `split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            label: "",
            address: "",
            percentage: Math.max(100 - used, 0),
          },
        ],
      };
    });
  };

  const handleRemoveSplitDestination = (id: string) => {
    setPreferences((prev) => ({
      ...prev,
      autoSplitDestinations: prev.autoSplitDestinations.filter((d) => d.id !== id),
    }));
  };

  const handleSave = () => {
    if (preferences.autoSplitEnabled && !splitValidation.valid) {
      setIsSaved(false);
      setSaveFailed(true);
      showNotification({
        type: "error",
        title: "Split Plan Incomplete",
        message: splitValidation.errors[0] || "Auto-split destinations must be valid and total 100%.",
      });
      setTimeout(() => setSaveFailed(false), 3500);
      return;
    }
    const success = saveAffiliatePreferences(preferences);
    if (success) {
      setSaveFailed(false);
      setIsSaved(true);
      window.dispatchEvent(new Event("storage"));
      showNotification({
        type: "success",
        title: "Settings Saved",
        message: "Your affiliate preferences & notification schedule have been updated.",
      });
      setTimeout(() => setIsSaved(false), 3000);
    } else {
      setIsSaved(false);
      setSaveFailed(true);
      showNotification({
        type: "error",
        title: "Save Failed",
        message: "Unable to save preferences to storage. Please check browser permissions.",
      });
      setTimeout(() => setSaveFailed(false), 3500);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Personalized Payout & UI Settings
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Configure interface theme persistence, alert frequencies, and payout preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Theme Settings Card */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Theme & Display
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Persist your appearance preference across sessions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div>
              <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block mb-3">
                Interface Color Mode
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleThemeChange("light")}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border text-sm font-semibold transition-all ${
                    preferences.theme === "light"
                      ? "border-indigo-600 bg-indigo-50/60 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <Sun className="w-5 h-5 text-amber-500" />
                  <span>Light</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeChange("dark")}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border text-sm font-semibold transition-all ${
                    preferences.theme === "dark"
                      ? "border-indigo-600 bg-indigo-50/60 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <Moon className="w-5 h-5 text-indigo-400" />
                  <span>Dark</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeChange("system")}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border text-sm font-semibold transition-all ${
                    preferences.theme === "system"
                      ? "border-indigo-600 bg-indigo-50/60 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <Monitor className="w-5 h-5 text-zinc-400" />
                  <span>System</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Theme choices are immediately synchronized with the Stellar Web3 shell and stored
                locally in browser storage.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Notification Frequency Controls */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/60 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
                <BellRing className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Notification Frequency
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Control the rhythm and delivery cadence of platform alerts
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div>
              <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block mb-3">
                Frequency Cadence
              </Label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    id: "instant" as const,
                    label: "Instant",
                    desc: "Real-time alerts",
                  },
                  {
                    id: "muted" as const,
                    label: "Muted",
                    desc: "No popup alerts",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleFrequencyChange(item.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      preferences.notificationFrequency === item.id
                        ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-bold"
                        : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 font-medium"
                    }`}
                  >
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[11px] opacity-75">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-2">
                Trigger Channels
              </Label>

              <label className="flex items-center justify-between text-sm cursor-pointer">
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                  New sale commission attributed
                </span>
                <input
                  type="checkbox"
                  checked={preferences.notifyOnCommission}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      notifyOnCommission: e.target.checked,
                    })
                  }
                  className="rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-sm cursor-pointer">
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                  Clearing period matured (ready to claim)
                </span>
                <input
                  type="checkbox"
                  checked={preferences.notifyOnClearingMaturity}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      notifyOnClearingMaturity: e.target.checked,
                    })
                  }
                  className="rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-sm cursor-pointer">
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                  Payout settled on Stellar ledger
                </span>
                <input
                  type="checkbox"
                  checked={preferences.notifyOnPayoutSettled}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      notifyOnPayoutSettled: e.target.checked,
                    })
                  }
                  className="rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Payout Preferences Card */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl md:col-span-2">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Payout Automation & Asset Preferences
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Customize preferred settlement assets and withdrawal thresholds
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block mb-2">
                  Preferred Settlement Currency
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  {(["XLM", "USDC", "EURC"] as const).map((asset) => (
                    <button
                      key={asset}
                      type="button"
                      onClick={() =>
                        setPreferences({
                          ...preferences,
                          preferredAsset: asset,
                        })
                      }
                      className={`p-3 rounded-xl border text-center font-bold text-sm transition-all ${
                        preferences.preferredAsset === asset
                          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                          : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {asset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block mb-2">
                  Minimum Notification / Claim Threshold
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={preferences.minClaimThreshold}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        minClaimThreshold: e.target.value,
                      })
                    }
                    className="rounded-xl pr-16 font-mono"
                    placeholder="20.0"
                  />
                  <div className="absolute right-3 top-2.5 text-xs font-bold text-zinc-400 uppercase">
                    {preferences.preferredAsset}
                  </div>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5">
                  Only trigger payout ready alerts when cumulative balance exceeds this threshold.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-zinc-800/60">
              <span className="text-xs text-zinc-400 flex items-center gap-1.5 font-medium">
                <Bell className="w-3.5 h-3.5 text-zinc-400" />
                Saved preferences are automatically retained across page reloads.
              </span>
              <Button
                onClick={handleSave}
                className={`h-10 px-6 rounded-xl font-bold transition-all flex items-center gap-2 ${
                  saveFailed
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-500/25"
                    : isSaved
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md hover:shadow-indigo-500/25"
                }`}
              >
                {saveFailed ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-200" />
                    Failed to Save
                  </>
                ) : isSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Preferences
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Commission Auto-Split Destinations (Issue #167) */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl md:col-span-2">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-sky-50 dark:bg-sky-950/60 rounded-xl flex items-center justify-center text-sky-600 dark:text-sky-400">
                <PieChart className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Instant Commission Auto-Split
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Route claimed payouts across your main wallet and vault accounts in one atomic
                  transaction (SEP-0007 style)
                </CardDescription>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.autoSplitEnabled}
                onClick={handleAutoSplitToggle}
                className={`relative h-7 w-[52px] shrink-0 rounded-full border transition-colors ${
                  preferences.autoSplitEnabled
                    ? "bg-sky-600 border-sky-600"
                    : "bg-slate-200 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    preferences.autoSplitEnabled ? "translate-x-7" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-5">
            {preferences.autoSplitEnabled ? (
              <>
                <div className="space-y-3">
                  {preferences.autoSplitDestinations.map((dest, index) => (
                    <div
                      key={dest.id}
                      className="grid grid-cols-1 md:grid-cols-[1fr_2fr_120px_auto] gap-3 items-end p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40"
                    >
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1.5">
                          Destination {index + 1} Name
                        </Label>
                        <Input
                          value={dest.label}
                          onChange={(e) => handleSplitDestinationChange(dest.id, { label: e.target.value })}
                          placeholder="e.g. Cold Storage Vault"
                          className="rounded-xl h-10 bg-white dark:bg-zinc-900 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1.5">
                          Stellar Public Key
                        </Label>
                        <Input
                          value={dest.address}
                          onChange={(e) =>
                            handleSplitDestinationChange(dest.id, {
                              address: e.target.value.trim().toUpperCase(),
                            })
                          }
                          placeholder="G... 56-character account key"
                          className="rounded-xl h-10 bg-white dark:bg-zinc-900 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1.5">
                          Share (%)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={dest.percentage}
                          onChange={(e) =>
                            handleSplitDestinationChange(dest.id, {
                              percentage: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="rounded-xl h-10 bg-white dark:bg-zinc-900 font-mono text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSplitDestination(dest.id)}
                        aria-label={`Remove destination ${index + 1}`}
                        className="h-10 w-10 mb-0 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-400 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Button
                    variant="outline"
                    onClick={handleAddSplitDestination}
                    className="h-9 rounded-xl border-dashed border-slate-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Secondary Destination
                  </Button>
                  <span
                    className={`text-xs font-bold font-mono px-3 py-1.5 rounded-full border ${
                      splitValidation.totalPercentage === 100
                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
                        : "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    Total Allocation: {splitValidation.totalPercentage.toFixed(2)}% / 100%
                  </span>
                </div>

                {!splitValidation.valid && preferences.autoSplitDestinations.length > 0 && (
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 space-y-1.5">
                    {splitValidation.errors.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs font-medium text-rose-700 dark:text-rose-300"
                      >
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-3">
                <PieChart className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <span>
                  Auto-split is off — payouts land in full in your connected wallet. Enable it to
                  add secondary destination addresses (e.g. a vault) with percentage splits applied
                  at claim time.
                </span>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Splits are executed as extra payment operations inside the same claim transaction.
                If the total does not sum to exactly 100% the plan cannot be saved, and the ledger
                rejects the whole envelope atomically — no partial routing.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
