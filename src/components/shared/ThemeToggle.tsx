import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { readRaw, usePreference, writeRaw } from "../../hooks/usePreference";

export function resolveEffectiveTheme(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      const versioned = readRaw<boolean | null>(
        "stormsale.theme.dark",
        null,
        (value) => typeof value === "boolean",
      );
      if (versioned !== null) return versioned;

      const stored = localStorage.getItem("darkMode");
      if (stored !== null) {
        return stored === "true";
      }

      const raw = localStorage.getItem("stormsale_affiliate_settings");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.theme === "string") {
            return parsed.theme === "dark";
          }
        } catch {
          // fallback
        }
      }
    }
  } catch {
    // Degrade gracefully if storage is blocked
  }

  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return true;
  }

  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return true;
  }

  return false;
}

export function applyTheme(newDarkMode: boolean) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("darkMode", newDarkMode.toString());
      writeRaw("stormsale.theme.dark", newDarkMode, (value) => typeof value === "boolean");

      const raw = localStorage.getItem("stormsale_affiliate_settings");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          parsed.theme = newDarkMode ? "dark" : "light";
          localStorage.setItem("stormsale_affiliate_settings", JSON.stringify(parsed));
        } catch {
          // Degrade gracefully
        }
      }
    }
  } catch {
    // Degrade gracefully if storage is blocked
  }

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", newDarkMode);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

export function ThemeToggle() {
  const [darkMode, setDarkMode] = usePreference<boolean>(
    "stormsale.theme.dark",
    resolveEffectiveTheme(),
    (v) => typeof v === "boolean",
  );

  useEffect(() => {
    // Prioritize versioned preference; migrate legacy darkMode only when versioned key is absent
    try {
      if (typeof localStorage !== "undefined") {
        const versioned = readRaw<boolean | null>(
          "stormsale.theme.dark",
          null,
          (value) => typeof value === "boolean",
        );
        const legacy = localStorage.getItem("darkMode");
        if (versioned === null && legacy !== null) {
          const isLegacyDark = legacy === "true";
          setDarkMode(isLegacyDark);
          if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", isLegacyDark);
          }
          return;
        } else if (versioned === null && legacy === null) {
          const systemDark = resolveEffectiveTheme();
          setDarkMode(systemDark);
          if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", systemDark);
          }
          return;
        }
      }
    } catch {
      // Degrade gracefully
    }

    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", darkMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      try {
        const versioned = readRaw<boolean | null>(
          "stormsale.theme.dark",
          null,
          (v) => typeof v === "boolean",
        );
        const legacy = localStorage?.getItem("darkMode");
        if (versioned === null && legacy === null) {
          setDarkMode(e.matches);
          if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", e.matches);
          }
        }
      } catch {
        // Degrade gracefully
      }
    };
    mediaQuery.addEventListener?.("change", handler);
    return () => mediaQuery.removeEventListener?.("change", handler);
  }, [setDarkMode]);

  useEffect(() => {
    const handleStorage = () => {
      const isDark = resolveEffectiveTheme();
      setDarkMode(isDark);
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", isDark);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [setDarkMode]);

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    applyTheme(newDarkMode);
  };

  return (
    <button
      onClick={toggleDarkMode}
      data-testid="theme-toggle"
      className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 transition-colors shadow-sm bg-white dark:bg-zinc-900"
      aria-label="Toggle dark mode"
      title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {darkMode ? (
        <Sun className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
      ) : (
        <Moon className="w-4 h-4 md:w-5 md:h-5 text-indigo-500" />
      )}
    </button>
  );
}
