import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "../locales/en.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";
import fr from "../locales/fr.json";
import de from "../locales/de.json";
import zh from "../locales/zh.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import ar from "../locales/ar.json";
import ru from "../locales/ru.json";

export interface LocaleMeta {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  dir: "ltr" | "rtl";
}

export const SUPPORTED_LOCALES: LocaleMeta[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇧🇷", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪", dir: "ltr" },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文", flag: "🇨🇳", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺", dir: "ltr" },
];

export const RTL_LOCALES = ["ar", "he"];

/**
 * Determines whether a given locale string corresponds to a Right-to-Left (RTL) script.
 * Supports language subtag strings (e.g., 'ar', 'ar-SA', 'he').
 *
 * @param locale - BCP-47 or ISO language tag to test
 * @returns True if the locale is an RTL language, false otherwise
 */
export function isRTL(locale: string): boolean {
  if (!locale) return false;
  const baseLocale = locale.toLowerCase().split("-")[0];
  return RTL_LOCALES.includes(baseLocale);
}

/**
 * Updates the HTML document root direction ('dir' attribute), language ('lang' attribute),
 * and dynamic 'rtl' class to adapt the layout for RTL or LTR presentation.
 *
 * @param locale - Active language code (e.g. 'ar', 'en', 'es')
 */
export function updateDocumentDirection(locale: string) {
  if (typeof document !== "undefined") {
    const rtl = isRTL(locale);
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    if (rtl) {
      document.documentElement.classList.add("rtl");
    } else {
      document.documentElement.classList.remove("rtl");
    }
  }
}

export const resources = {
  en: { translation: en },
  es: { translation: es },
  pt: { translation: pt },
  fr: { translation: fr },
  de: { translation: de },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
  ar: { translation: ar },
  ru: { translation: ru },
};

// Initialize i18next instance if not already initialized
if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: "en",
      supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
      load: "languageOnly",
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        lookupLocalStorage: "stormsale_i18n_lng",
        caches: ["localStorage"],
      },
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });

  // Listen for language changes to update RTL and lang attributes
  i18n.on("languageChanged", (lng: string) => {
    updateDocumentDirection(lng);
  });

  // Initial update
  if (typeof window !== "undefined") {
    updateDocumentDirection(i18n.language || "en");
  }
}

export default i18n;
