import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import i18n, {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  normalizeLocale,
  type SupportedLocale,
} from "../../lib/i18n";

export function LanguageSelector() {
  const { t, i18n: activeI18n } = useTranslation();
  const [locale, setLocale] = useState<SupportedLocale>(() =>
    normalizeLocale(activeI18n.resolvedLanguage || activeI18n.language),
  );

  useEffect(() => {
    const sync = (language: string) => setLocale(normalizeLocale(language));
    activeI18n.on("languageChanged", sync);
    return () => {
      activeI18n.off("languageChanged", sync);
    };
  }, [activeI18n]);

  const change = (next: string) => {
    const normalized = normalizeLocale(next);
    setLocale(normalized);
    void i18n.changeLanguage(normalized);
  };

  return (
    <label className="relative inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
      <Globe className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
      <span className="sr-only">{t("language.select")}</span>
      <select
        aria-label={t("language.select")}
        value={locale}
        onChange={(event) => change(event.target.value)}
        className="h-9 cursor-pointer appearance-none bg-transparent pr-1 text-xs font-semibold outline-none"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
