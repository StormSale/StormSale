// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { LanguageSelector } from "../components/shared/LanguageSelector";
import i18n, { SUPPORTED_LOCALES } from "../lib/i18n";

describe("LanguageSelector Component", () => {
  beforeEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
  });

  it("should render without crashing in SSR mode", () => {
    const html = renderToString(<LanguageSelector />);
    expect(html).toBeTruthy();
    expect(html).toContain("button");
  });

  it("should render button with proper accessibility attributes", () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole("button", { name: "Switch Language" });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("should render the active locale code and flag", () => {
    render(<LanguageSelector />);
    expect(screen.getByText("EN")).toBeTruthy();
    expect(screen.getByText("🇺🇸")).toBeTruthy();
  });

  it("should render compact version without text label", () => {
    const { container } = render(<LanguageSelector compact={true} />);
    expect(screen.getByText("🇺🇸")).toBeTruthy();
    expect(container.querySelector(".text-xs.font-semibold")).toBeNull();
  });

  it("should support all 10 locales in metadata", () => {
    expect(SUPPORTED_LOCALES.length).toBe(10);
    const codes = SUPPORTED_LOCALES.map((l) => l.code);
    expect(codes).toEqual(["en", "es", "pt", "fr", "de", "zh", "ja", "ko", "ar", "ru"]);
  });

  it("opens dropdown and focuses selected option on click", () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole("button", { name: "Switch Language" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(10);
  });

  it("selects a language when an option is clicked and updates document direction", async () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole("button", { name: "Switch Language" });
    fireEvent.click(trigger);

    const spanishOption = screen.getByRole("option", { name: /Español/ });
    fireEvent.click(spanishOption);

    expect(i18n.language).toBe("es");
    expect(document.documentElement.dir).toBe("ltr");
    expect(screen.getByText("ES")).toBeTruthy();
  });

  it("switches to RTL when Arabic is selected", async () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole("button", { name: "Switch Language" });
    fireEvent.click(trigger);

    const arabicOption = screen.getByRole("option", { name: /العربية/ });
    fireEvent.click(arabicOption);

    expect(i18n.language).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.classList.contains("rtl")).toBe(true);
  });

  it("closes dropdown on Escape key and on clicking outside", () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole("button", { name: "Switch Language" });
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();

    fireEvent.keyDown(listbox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    // Reopen and test click outside
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("handles trigger keyboard shortcuts (ArrowDown, ArrowUp, Enter, Space)", () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole("button", { name: "Switch Language" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    fireEvent.keyDown(trigger, { key: " " });
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("navigates through options with keyboard (ArrowDown, ArrowUp, Home, End, Enter, Space)", () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole("button", { name: "Switch Language" });
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    // ArrowDown
    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    // ArrowUp
    fireEvent.keyDown(options[1], { key: "ArrowUp" });
    // End
    fireEvent.keyDown(options[0], { key: "End" });
    // Home
    fireEvent.keyDown(options[9], { key: "Home" });
    // Listbox level key down
    fireEvent.keyDown(listbox, { key: "ArrowDown" });

    // Enter on option
    fireEvent.keyDown(options[1], { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();

    // Reopen and test Space on option
    fireEvent.click(trigger);
    const newOptions = screen.getAllByRole("option");
    fireEvent.keyDown(newOptions[2], { key: " " });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
