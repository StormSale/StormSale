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
        t
