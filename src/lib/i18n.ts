import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";
import fr from "../locales/fr.json";
import de from "../locales/de.json";
import it from "../locales/it.json";
import ja from "../locales/ja.json";
import zh from "../locales/zh.json";
import ar from "../locales/ar.json";
import he from "../locales/he.json";

export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "ja",
  "zh",
  "ar",
  "he",
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: readonly SupportedLocale[] = ["ar", "he"];
export const LANGUAGE_STORAGE_KEY = "stormsale.i18n.language";
export const FALLBACK_LOCALE: SupportedLocale = "en";

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  ja: "日本語",
  zh: "中文",
  ar: "العربية",
  he: "עברית",
};

export const resources = {
  en: { translation: en },
  es: { translation: es },
  pt: { translation: pt },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
  ja: { translation: ja },
  zh: { translation: zh },
  ar: { translation: ar },
  he: { translation: he },
} as const;

export function normalizeLocale(value: unknown): SupportedLocale {
  if (typeof value !== "string") return FALLBACK_LOCALE;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : FALLBACK_LOCALE;
}

export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(normalizeLocale(locale));
}

/** Pick the first locale supported by the app from the browser preferences. */
export function detectBrowserLocale(navigatorLike?: {
  language?: string;
  languages?: readonly string[];
}): SupportedLocale {
  const nav = navigatorLike ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (!nav) return FALLBACK_LOCALE;

  const candidates = [nav.language, ...(nav.languages ?? [])].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized !== FALLBACK_LOCALE || candidate.toLowerCase().startsWith("en")) {
      return normalized;
    }
  }
  return FALLBACK_LOCALE;
}

/** Stored choice wins; otherwise auto-detect from the browser. */
export function detectLocale(): SupportedLocale {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored) return normalizeLocale(stored);
    }
  } catch {
    // Degrade gracefully if storage is blocked
  }
  return detectBrowserLocale();
}

export function applyDocumentLocale(locale: string): void {
  const normalized = normalizeLocale(locale);
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = normalized;
  root.dir = isRtlLocale(normalized) ? "rtl" : "ltr";
  root.dataset.locale = normalized;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: detectLocale(),
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    load: "languageOnly",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    initImmediate: false,
    returnNull: false,
  });
}

i18n.on("languageChanged", (language) => {
  const normalized = normalizeLocale(language);
  applyDocumentLocale(normalized);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    }
  } catch {
    // Degrade gracefully if storage is blocked
  }
});

applyDocumentLocale(normalizeLocale(i18n.language));

export default i18n;
