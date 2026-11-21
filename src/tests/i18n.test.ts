// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n, {
  FALLBACK_LOCALE,
  LANGUAGE_STORAGE_KEY,
  LOCALE_LABELS,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  applyDocumentLocale,
  detectBrowserLocale,
  detectLocale,
  isRtlLocale,
  normalizeLocale,
  resources,
} from "../lib/i18n";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  applyDocumentLocale("en");
});

afterEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  applyDocumentLocale("en");
});

describe("i18n framework (#213)", () => {
  it("ships ten locales with identical key sets and labels", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
    expect(new Set(SUPPORTED_LOCALES).size).toBe(10);
    const englishKeys = flattenKeys(resources.en.translation).sort();

    for (const locale of SUPPORTED_LOCALES) {
      expect(resources[locale]).toBeDefined();
      expect(LOCALE_LABELS[locale]).toBeTruthy();
      expect(flattenKeys(resources[locale].translation).sort()).toEqual(englishKeys);
    }

    expect(RTL_LOCALES).toEqual(["ar", "he"]);
  });

  it("normalizes browser, stored and legacy locale values", () => {
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("pt_BR")).toBe("pt");
    expect(normalizeLocale("zh-CN")).toBe("zh");
    expect(normalizeLocale("EN")).toBe("en");
    expect(normalizeLocale("ar-EG")).toBe("ar");
    expect(normalizeLocale("ru")).toBe(FALLBACK_LOCALE);
    expect(normalizeLocale(null)).toBe(FALLBACK_LOCALE);
    expect(normalizeLocale("")).toBe(FALLBACK_LOCALE);
  });

  it("detects the browser language and falls back to English", () => {
    expect(detectBrowserLocale({ language: "fr-CA", languages: ["fr-CA", "en"] })).toBe("fr");
    expect(detectBrowserLocale({ language: "ja-JP", languages: ["ja-JP"] })).toBe("ja");
    expect(detectBrowserLocale({ language: "xx-YY", languages: ["xx-YY"] })).toBe("en");
    expect(detectBrowserLocale({ language: "", languages: [] })).toBe("en");
  });

  it("prefers a stored language over browser detection", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ja");
    expect(detectLocale()).toBe("ja");
  });

  it("detects RTL locales and applies lang/dir to the document", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("he-IL")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);

    applyDocumentLocale("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.dataset.locale).toBe("ar");

    applyDocumentLocale("pt-BR");
    expect(document.documentElement.lang).toBe("pt");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("translates with interpolation across locales", () => {
    expect(i18n.getFixedT("es")("common.light")).toBe("Claro");
    expect(i18n.getFixedT("fr")("header.connectWallet")).toContain("Connecter");
    expect(i18n.getFixedT("en")("theme.toggle", { current: "Light", next: "Dark" })).toContain(
      "Light",
    );
  });

  it("persists language changes and switches document direction", async () => {
    await i18n.changeLanguage("ar");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.dataset.locale).toBe("ar");

    await i18n.changeLanguage("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
