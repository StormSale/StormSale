// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HIGH_CONTRAST_CLASS,
  THEME_MODES,
  THEME_MODE_STORAGE_KEY,
  ThemeToggle,
  applyTheme,
  applyThemeMode,
  nextThemeMode,
  resolveEffectiveTheme,
  resolveThemeMode,
} from "../components/shared/ThemeToggle";
import { SCHEMA_VERSION } from "../hooks/usePreference";

const AFFILIATE_SETTINGS_KEY = "stormsale_affiliate_settings";

function clearThemeDom() {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
}

beforeEach(() => {
  localStorage.clear();
  clearThemeDom();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  clearThemeDom();
});

describe("Dark / Light / High-Contrast theme system (#212)", () => {
  it("cycles through all three modes", () => {
    expect(THEME_MODES).toEqual(["light", "dark", "high-contrast"]);
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("high-contrast");
    expect(nextThemeMode("high-contrast")).toBe("light");
  });

  it("applies high contrast, dark and light modes to storage and the document", () => {
    applyThemeMode("high-contrast");
    expect(document.documentElement.classList.contains(HIGH_CONTRAST_CLASS)).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("high-contrast");
    expect(localStorage.getItem("darkMode")).toBe("false");
    expect(JSON.parse(localStorage.getItem(THEME_MODE_STORAGE_KEY)!)).toEqual({
      v: SCHEMA_VERSION,
      value: "high-contrast",
    });
    expect(resolveThemeMode()).toBe("high-contrast");
    expect(resolveEffectiveTheme()).toBe(true);

    applyThemeMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains(HIGH_CONTRAST_CLASS)).toBe(false);
    expect(localStorage.getItem("darkMode")).toBe("true");
    expect(resolveEffectiveTheme()).toBe(true);

    applyThemeMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(resolveEffectiveTheme()).toBe(false);
  });

  it("migrates legacy darkMode and affiliate theme preferences", () => {
    localStorage.setItem("darkMode", "true");
    expect(resolveThemeMode()).toBe("dark");

    localStorage.clear();
    localStorage.setItem("stormsale.theme.dark", JSON.stringify({ v: 1, value: false }));
    expect(resolveThemeMode()).toBe("light");

    localStorage.clear();
    localStorage.setItem(AFFILIATE_SETTINGS_KEY, JSON.stringify({ theme: "dark" }));
    expect(resolveThemeMode()).toBe("dark");

    localStorage.clear();
    document.documentElement.classList.add(HIGH_CONTRAST_CLASS);
    expect(resolveThemeMode()).toBe("high-contrast");
  });

  it("keeps affiliate settings compatible while enabling high contrast", () => {
    localStorage.setItem(AFFILIATE_SETTINGS_KEY, JSON.stringify({ theme: "light" }));
    applyThemeMode("high-contrast");
    expect(JSON.parse(localStorage.getItem(AFFILIATE_SETTINGS_KEY)!).theme).toBe("dark");

    applyThemeMode("light");
    expect(JSON.parse(localStorage.getItem(AFFILIATE_SETTINGS_KEY)!).theme).toBe("light");
  });

  it("ignores corrupt mode storage and falls back to legacy defaults", () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, "{bad json");
    localStorage.setItem("darkMode", "false");
    expect(resolveThemeMode()).toBe("light");

    localStorage.setItem(THEME_MODE_STORAGE_KEY, JSON.stringify({ v: 99, value: "dark" }));
    expect(resolveThemeMode()).toBe("light");
  });

  it("supports the legacy applyTheme boolean helper", () => {
    applyTheme(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(resolveThemeMode()).toBe("dark");

    applyTheme(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(resolveThemeMode()).toBe("light");
  });

  it("lets the toggle button cycle light → dark → high contrast → light", () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, JSON.stringify({ v: 1, value: "light" }));
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");
    expect(button.getAttribute("data-theme-mode")).toBe("light");

    fireEvent.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(button.getAttribute("data-theme-mode")).toBe("dark");

    fireEvent.click(button);
    expect(document.documentElement.classList.contains(HIGH_CONTRAST_CLASS)).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(button.getAttribute("data-theme-mode")).toBe("high-contrast");

    fireEvent.click(button);
    expect(document.documentElement.classList.contains(HIGH_CONTRAST_CLASS)).toBe(false);
    expect(button.getAttribute("data-theme-mode")).toBe("light");
  });

  it("describes the current and next theme for assistive technology", () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, JSON.stringify({ v: 1, value: "dark" }));
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");
    expect(button.getAttribute("aria-label")).toContain("High Contrast");
    expect(button.getAttribute("aria-label")).toContain("Dark");
    expect(button.getAttribute("title")).toContain("High Contrast");
  });
});
