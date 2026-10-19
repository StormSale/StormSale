import React, { useState, useEffect, useCallback } from "react";
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
}

export const DEFAULT_PREFERENCES: AffiliatePreferences = {
  theme: "dark",
  notificationFrequency: "instant",
  notifyOnCommission: true,
  notifyOnClearingMaturity: true,
  notifyOnPayoutSettled: true,
  preferredAsset: "XLM",
  minClaimThreshold: "20.0",
};

export const SETTINGS_STORAGE_KEY = "stormsale_affiliate_settings";

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
      return DEFAULT_PREFERENCEE;
    }
    const parsed = JSON.parse(raw);
    const notificationFrequency: NotificationFrequency =
      parsed.notificationFrequency === "muted" ? "muted" : "instant";
    return { ...DEFAULT_PREFERENCES, ...parsed, notificationFrequency };
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
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
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
    return () => mediaQuery.removeEventListener?.("change", applySystemTheme);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(applySystemTheme);
    return () => mediaQuery.removeListener?.(applySystemTheme);
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
      let systemPrefersDark = false;
      try {
        systemPrefersDark =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
      } catch {
        systemPrefersDark = false;
      }
      const isDark =
        prefs.theme === "dark" ||
        (prefs.theme === "system" && systemPrefersDark);
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
    if (typeof window === "undefined") return;
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

  const handleThemeChange = useCallback((newTheme: ThemeOption) => {
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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
  }, [showNotification]);

  const handleFrequencyChange = useCallback((freq: NotificationFrequency) => {
    const updated = { ...preferences, notificationFrequency: freq };
    setPreferences(updated);
  }, [preferences]);

  const handleSave = useCallback(() => {
    const success = saveAffiliatePreferences(preferences);
    if (success) {
      setSaveFailed(false);
      setIsSaved(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage"));
      }
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
  }, [preferences, showNotification]);

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
              <div className="w-12 h-indigo-50 dark:bg-indigo-950/60 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
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
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border text-sm font-semibold transition-all ${preferences.theme === "light" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50"}`}
                >
                  <Sun className="w-5 h-text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange("dark")}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border text-sm font-semibold transition-all ${preferences.theme === "dark" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50"}`}
                >
                  <Moon className="w-5 h-5 text-indigo-400" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange("system")}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border text-sm font-semibold transition-all ${preferences.theme === "system" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50"}`}
                >
                  <Monitor className="w-5 h-5 text-slate-500" />
                  <span>System</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings Card */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="texxl font-bold text-zinc-900 dark:text-white">
                  Notifications
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Control alert frequency and delivery channels
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div>
              <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block mb-3">
                Alert Frequency
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleFrequencyChange("instant")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${preferences.notificationFrequency === "instant" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50"}`}
                >
                  <BellRing className="w-4 h-4" />
                  <span>Instant</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFrequencyChange("muted")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${preferences.notificationFrequency === "muted" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50"}`}
                >
                  <Bell className="w-4 h-4" />
                  <span>Muted</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span>Notify on Commission</span>
                <input
                  type="checkbox"
                  checked={preferences.notifyOnCommission}
                  onChange={(e) =>
                    setPreferences((prev) => ({ ...prev, notifyOnCommission: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span>Notify on Clearing Maturity</span>
                <input
                  type="checkbox"
                  checked={preferences.notifyOnClearingMaturity}
                  onChange={(e) =>
                    setPreferences((prev) => ({ ...prev, notifyOnClearingMaturity: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span>Notify on Payout Settled</span>
                <input
                  type="checkbox"
                  checked={preferences.notifyOnPayoutSettled}
                  onChange={(e) =>
                    setPreferences((prev) => ({ ...prev, notifyOnPayoutSettled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Payout Preferences Card */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl md:col-span-2">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/60 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                  Payout Preferences
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Define your preferred asset and minimum claim threshold
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div>
              <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block mb-3">
                Preferred Asset
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {(["XLM", "USDC", "EURC"] as const[name of AffiliatePreferences["preferredAsset"][]).map((asset) => (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => setPreferences((prev) => ({ ...prev, preferredAsset: asset }))}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all ${preferences.preferredAsset === asset ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" : "border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50"}`}
                  >
                    {asset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block mb-3">
                Minimum Claim Threshold
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={preferences.minClaimThreshold}
                onChange={(e) =>
                  setPreferences((prev) => ({ ...prev, minClaimThreshold: e.target.value }))
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saveFailed && (
          <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span>Save failed</span>
          </div>
        )}
        {isSaved && (
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2className="w-4 h-4" />
            <span>Saved</span>
          </div>
        )}
        <Button onClick={handleSave} className="gap-2">
          <Save className="w-4 h-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
};
