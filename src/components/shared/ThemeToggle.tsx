import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { usePreference, SCHEMA_VERSION } from "../../hooks/usePreference";

export function resolveEffectiveTheme(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      const versioned = localStorage.getItem("stormsale.theme.dark");
      if (versioned) {
        try {
          const parsed = JSON.parse(versioned);
          if (parsed && parsed.v === SCHEMA_VERSION && typeof parsed.value === "boolean") {
            return parsed.value;
          }
        } catch {
          // fallback
        }
      }

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

  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark");
  }

  return false;
}

export function applyTheme(newDarkMode: boolean) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("darkMode", newDarkMode.toString());
      localStorage.setItem(
        "stormsale.theme.dark",
        JSON.stringify({ v: SCHEMA_VERSION, value: newDarkMode }),
      );

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
    false,
    (v) => typeof v === "boolean",
  );

  useEffect(() => {
    // Prioritize versioned preference; migrate legacy darkMode only when versioned key is absent
    try {
      if (typeof localStorage !== "undefined") {
        const versionedRaw = localStorage.getItem("stormsale.theme.dark");
        let hasValidVersioned = false;
        if (versionedRaw) {
          try {
            const parsed = JSON.parse(versionedRaw);
            if (parsed && parsed.v === SCHEMA_VERSION && typeof parsed.value === "boolean") {
              hasValidVersioned = true;
            }
          } catch {
            // ignore
          }
        }
        const legacy = localStorage.getItem("darkMode");
        if (!hasValidVersioned && legacy !== null) {
          const isLegacyDark = legacy === "true";
          setDarkMode(isLegacyDark);
          if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", isLegacyDark);
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