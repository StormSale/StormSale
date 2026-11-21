import { useEffect, useState } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { writeRaw, SCHEMA_VERSION } from "../../hooks/usePreference";
import "../../lib/i18n";

export type ThemeMode = "light" | "dark" | "high-contrast";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "high-contrast"];
export const THEME_MODE_STORAGE_KEY = "stormsale.theme.mode";
export const HIGH_CONTRAST_CLASS = "high-contrast";

/** Legacy keys kept in sync so older builds and the affiliate settings card keep working. */
const LEGACY_DARK_KEY = "stormsale.theme.dark";
const LEGACY_DARK_MODE_KEY = "darkMode";
const AFFILIATE_SETTINGS_KEY = "stormsale_affiliate_settings";

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

function readStoredMode(): ThemeMode | null {
  try {
    if (typeof localStorage === "undefined") return null;

    const raw = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === SCHEMA_VERSION && isThemeMode(parsed.value)) {
          return parsed.value;
        }
        if (isThemeMode(parsed)) return parsed;
      } catch {
        if (isThemeMode(raw)) return raw;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function readLegacyDark(): boolean | null {
  try {
    if (typeof localStorage === "undefined") return null;

    const versioned = localStorage.getItem(LEGACY_DARK_KEY);
    if (versioned) {
      try {
        const parsed = JSON.parse(versioned);
        if (parsed && parsed.v === SCHEMA_VERSION && typeof parsed.value === "boolean") {
          return parsed.value;
        }
      } catch {
        // fall through to the legacy key
      }
    }

    const legacy = localStorage.getItem(LEGACY_DARK_MODE_KEY);
    if (legacy !== null) return legacy === "true";

    const rawSettings = localStorage.getItem(AFFILIATE_SETTINGS_KEY);
    if (rawSettings) {
      try {
        const parsed = JSON.parse(rawSettings);
        if (parsed && typeof parsed.theme === "string") {
          if (parsed.theme === "high-contrast") return true;
          return parsed.theme === "dark";
        }
      } catch {
        // ignore malformed settings
      }
    }
  } catch {
    // Degrade gracefully if storage is blocked
  }
  return null;
}

/** Resolve the active theme mode, honoring the newest preference and legacy keys. */
export function resolveThemeMode(): ThemeMode {
  const stored = readStoredMode();
  if (stored) return stored;

  const legacyDark = readLegacyDark();
  if (legacyDark !== null) return legacyDark ? "dark" : "light";

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root.classList.contains(HIGH_CONTRAST_CLASS) || root.dataset?.theme === "high-contrast") {
      return "high-contrast";
    }
    if (root.classList.contains("dark")) return "dark";
  }

  return "light";
}

/** Backwards-compatible boolean helper: true when the effective theme is dark or high contrast. */
export function resolveEffectiveTheme(): boolean {
  return resolveThemeMode() !== "light";
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_MODES.indexOf(mode);
  return THEME_MODES[(index + 1) % THEME_MODES.length];
}

function syncAffiliateSettings(mode: ThemeMode): void {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(AFFILIATE_SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    // Affiliate settings only understands light/dark; high contrast keeps the
    // dark base palette while the theme mode key drives the contrast layer.
    parsed.theme = mode === "light" ? "light" : "dark";
    localStorage.setItem(AFFILIATE_SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    // Degrade gracefully
  }
}

/** Apply a theme mode to storage and the document root. */
export function applyThemeMode(mode: ThemeMode): void {
  const isDark = mode === "dark";
  const isHighContrast = mode === "high-contrast";

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LEGACY_DARK_MODE_KEY, isDark ? "true" : "false");
      writeRaw(LEGACY_DARK_KEY, isDark);
      writeRaw(THEME_MODE_STORAGE_KEY, mode);
      syncAffiliateSettings(mode);
    }
  } catch {
    // Degrade gracefully if storage is blocked
  }

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.classList.toggle(HIGH_CONTRAST_CLASS, isHighContrast);
    if (typeof root.setAttribute === "function") root.setAttribute("data-theme", mode);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("stormsale:themechange", { detail: mode }));
  }
}

/** Legacy boolean helper retained for callers that only know light/dark. */
export function applyTheme(newDarkMode: boolean): void {
  applyThemeMode(newDarkMode ? "dark" : "light");
}

const ICONS = {
  light: Sun,
  dark: Moon,
  "high-contrast": Contrast,
} as const;

export function ThemeToggle() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>(() => resolveThemeMode());

  useEffect(() => {
    applyThemeMode(mode);
    // Only run once on mount: the stored preference is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = resolveThemeMode();
      setMode(next);
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        root.classList.toggle("dark", next === "dark");
        root.classList.toggle(HIGH_CONTRAST_CLASS, next === "high-contrast");
        if (typeof root.setAttribute === "function") root.setAttribute("data-theme", next);
      }
    };

    window.addEventListener("storage", sync);
    window.addEventListener("stormsale:themechange", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("stormsale:themechange", sync as EventListener);
    };
  }, []);

  const toggle = () => {
    const next = nextThemeMode(mode);
    setMode(next);
    applyThemeMode(next);
  };

  const Icon = ICONS[mode];
  const currentLabel =
    mode === "light"
      ? t("common.light")
      : mode === "dark"
        ? t("common.dark")
        : t("common.highContrast");
  const nextLabel =
    nextThemeMode(mode) === "light"
      ? t("common.light")
      : nextThemeMode(mode) === "dark"
        ? t("common.dark")
        : t("common.highContrast");

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      data-theme-mode={mode}
      aria-label={t("theme.toggle", { current: currentLabel, next: nextLabel })}
      title={t("theme.switchTo", { theme: nextLabel })}
      className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 high-contrast:border-white hover:bg-slate-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 transition-colors shadow-sm bg-white dark:bg-zinc-900"
    >
      <Icon
        aria-hidden="true"
        className={`w-4 h-4 md:w-5 md:h-5 ${
          mode === "light"
            ? "text-indigo-500"
            : mode === "dark"
              ? "text-amber-500"
              : "text-yellow-300"
        }`}
      />
    </button>
  );
}
