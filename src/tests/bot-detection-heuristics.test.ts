import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateBotHeuristics,
  detectWebdriver,
  detectAnomalousPlugins,
  detectUserAgentAnomalies,
  detectMissingPermissionsApi,
  getSecurityTelemetryContext,
  clearSecurityTelemetryContext,
} from "../lib/botDetection";

describe("Synthetic Bot Detection & Headless Browser Heuristics Suite (#471)", () => {
  beforeEach(() => {
    clearSecurityTelemetryContext();
    vi.restoreAllMocks();
  });

  describe("1. Detection of navigator.webdriver === true", () => {
    it("flags headless runner when navigator.webdriver is true", () => {
      const mockNav: Partial<Navigator> = {
        webdriver: true,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        platform: "MacIntel",
        plugins: [{ name: "Chrome PDF Viewer" }] as any,
        permissions: { query: vi.fn() } as any,
        languages: ["en-US", "en"],
      };

      const directCheck = detectWebdriver(mockNav);
      expect(directCheck.detected).toBe(true);
      expect(directCheck.reason).toContain("navigator.webdriver === true");

      const result = evaluateBotHeuristics({ navigatorOverride: mockNav });
      expect(result.isBot).toBe(true);
      expect(result.flags.webdriverDetected).toBe(true);
      expect(result.reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("navigator.webdriver === true")]),
      );
    });

    it("does not flag navigator.webdriver when false or undefined", () => {
      const mockNav: Partial<Navigator> = {
        webdriver: false,
      };
      expect(detectWebdriver(mockNav).detected).toBe(false);
      expect(detectWebdriver({}).detected).toBe(false);
    });
  });

  describe("2. Anomalous Plugins, User-Agent Mismatches & Missing Permissions API", () => {
    it("flags empty plugins on claimed desktop browser as anomalous headless environment", () => {
      const mockNav: Partial<Navigator> = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        platform: "Win32",
        plugins: [] as any, // Headless Chrome on desktop has 0 plugins
        maxTouchPoints: 0,
      };

      const check = detectAnomalousPlugins(mockNav, false);
      expect(check.detected).toBe(true);
      expect(check.reason).toContain("Zero browser plugins reported on claimed desktop environment");
    });

    it("flags explicit headless automation tokens in User-Agent string", () => {
      const headlessUAs = [
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.6099.109 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Puppeteer/21.6.0 Chrome/120.0.0.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Playwright/1.40.0 Safari/537.36",
        "Mozilla/5.0 (Unknown; Linux x86_64) PhantomJS/2.1.1 Safari/534.34",
      ];

      for (const ua of headlessUAs) {
        const check = detectUserAgentAnomalies({ userAgent: ua, languages: ["en"] });
        expect(check.detected).toBe(true);
        expect(check.headlessTokenFound).toBe(true);
        expect(check.reason).toContain("Headless automation identifier found");
      }
    });

    it("flags User-Agent vs platform architecture mismatches and empty languages", () => {
      // Claims iPhone in UA but reports Linux or Win32 in platform
      const spoofedNav: Partial<Navigator> = {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
        platform: "Linux x86_64", // Spoofed server runner!
        languages: ["en-US"],
      };

      const check = detectUserAgentAnomalies(spoofedNav);
      expect(check.detected).toBe(true);
      expect(check.mismatchFound).toBe(true);
      expect(check.reason).toContain("claims iOS");

      // Claims standard UA but languages is empty array
      const emptyLangNav: Partial<Navigator> = {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        platform: "MacIntel",
        languages: [],
      };
      const langCheck = detectUserAgentAnomalies(emptyLangNav);
      expect(langCheck.detected).toBe(true);
      expect(langCheck.reason).toContain("Empty navigator.languages array");
    });

    it("flags environments where navigator.permissions API is missing or not a function", () => {
      const bareNav: Partial<Navigator> = {
        permissions: undefined,
      };

      const check = detectMissingPermissionsApi(bareNav);
      expect(check.detected).toBe(true);
      expect(check.reason).toContain("Permissions API (navigator.permissions.query) is absent");
    });
  });

  describe("3. Silent Telemetry Context Propagation (Without Revealing Detection to Attacker)", () => {
    it("silently populates security telemetry context upon bot detection without throwing or alerting", () => {
      const botNav: Partial<Navigator> = {
        webdriver: true,
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0",
        platform: "Linux x86_64",
        plugins: [] as any,
        languages: [],
        permissions: undefined,
        maxTouchPoints: 0,
      };

      // Evaluation must run passively and never throw or trigger visible dialogs
      expect(() => {
        evaluateBotHeuristics({ navigatorOverride: botNav });
      }).not.toThrow();

      const telemetry = getSecurityTelemetryContext();
      expect(telemetry).not.toBeNull();
      expect(telemetry!.isBot).toBe(true);
      expect(telemetry!.botConfidence).toBeGreaterThanOrEqual(0.9);
      expect(telemetry!.flags.webdriverDetected).toBe(true);
      expect(telemetry!.flags.headlessPatternDetected).toBe(true);
      expect(telemetry!.flags.pluginsAnomalous).toBe(true);
      expect(telemetry!.flags.permissionsMissing).toBe(true);
      expect(telemetry!.sessionId).toMatch(/^sess_\d+_[a-z0-9]+$/);
      expect(telemetry!.clientEnvironment.userAgent).toContain("HeadlessChrome");
    });
  });

  describe("4. Zero False Positives on Standard Mobile Devices and Modern Laptops", () => {
    it("evaluates genuine iOS mobile Safari as non-bot (zero false positives)", () => {
      const genuineIphone: Partial<Navigator> = {
        webdriver: false,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        plugins: [] as any, // iOS Safari legitimately reports 0 plugins
        maxTouchPoints: 5, // Touch screen active
        languages: ["en-US", "en"],
        language: "en-US",
        permissions: { query: vi.fn() } as any,
        hardwareConcurrency: 6,
      };

      const result = evaluateBotHeuristics({ navigatorOverride: genuineIphone });
      expect(result.isBot).toBe(false);
      expect(result.botConfidence).toBe(0);
      expect(result.reasons).toHaveLength(0);
      expect(result.flags.webdriverDetected).toBe(false);
      expect(result.flags.pluginsAnomalous).toBe(false);
      expect(result.flags.userAgentMismatch).toBe(false);
    });

    it("evaluates genuine Android Chrome device as non-bot (zero false positives)", () => {
      const genuineAndroid: Partial<Navigator> = {
        webdriver: false,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36",
        platform: "Linux armv8l",
        plugins: [] as any, // Mobile Chrome legitimately reports 0 plugins
        maxTouchPoints: 10,
        languages: ["en-US", "es-US", "es"],
        language: "en-US",
        permissions: { query: vi.fn() } as any,
        hardwareConcurrency: 8,
      };

      const result = evaluateBotHeuristics({ navigatorOverride: genuineAndroid });
      expect(result.isBot).toBe(false);
      expect(result.botConfidence).toBe(0);
      expect(result.flags.pluginsAnomalous).toBe(false);
    });

    it("evaluates genuine macOS laptop (Chrome / Safari) as non-bot (zero false positives)", () => {
      const genuineMacLaptop: Partial<Navigator> = {
        webdriver: false,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        platform: "MacIntel",
        plugins: [
          { name: "PDF Viewer" },
          { name: "Chrome PDF Viewer" },
        ] as any,
        maxTouchPoints: 0,
        languages: ["en-US", "en"],
        language: "en-US",
        permissions: { query: vi.fn() } as any,
        hardwareConcurrency: 10, // Apple M3 Pro / Max
      };

      const result = evaluateBotHeuristics({ navigatorOverride: genuineMacLaptop });
      expect(result.isBot).toBe(false);
      expect(result.botConfidence).toBe(0);
      expect(result.flags.webdriverDetected).toBe(false);
      expect(result.flags.pluginsAnomalous).toBe(false);
      expect(result.flags.userAgentMismatch).toBe(false);
      expect(result.flags.permissionsMissing).toBe(false);
    });

    it("evaluates genuine Windows desktop/laptop (Edge / Firefox) as non-bot (zero false positives)", () => {
      const genuineWindowsPc: Partial<Navigator> = {
        webdriver: false,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
        platform: "Win32",
        plugins: [{ name: "Default Plugin" }] as any,
        maxTouchPoints: 0,
        languages: ["en-US", "en"],
        language: "en-US",
        permissions: { query: vi.fn() } as any,
        hardwareConcurrency: 16,
      };

      const result = evaluateBotHeuristics({ navigatorOverride: genuineWindowsPc });
      expect(result.isBot).toBe(false);
      expect(result.botConfidence).toBe(0);
      expect(result.flags.webdriverDetected).toBe(false);
    });
  });
});
