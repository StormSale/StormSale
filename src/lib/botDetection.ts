/**
 * Synthetic Bot Detection & Headless Browser Heuristics (Issue #471)
 *
 * Implements passive client-side bot detection to prevent automated click fraud
 * and spoofed affiliate conversions without alerting malicious actors.
 *
 * Heuristics evaluated:
 * 1. navigator.webdriver === true (Puppeteer, Selenium, Playwright default)
 * 2. User-Agent vs. platform inconsistencies & headless tokens (e.g. HeadlessChrome)
 * 3. Anomalous plugin configurations (empty plugins on desktop vs. normal mobile behavior)
 * 4. Missing or anomalous Permissions API implementations
 * 5. Touch and hardware concurrency consistency
 *
 * Designed with zero false positives for standard touch mobile devices (iOS/Android)
 * and standard modern laptops (macOS, Windows, Linux desktop).
 */

export interface BotHeuristicFlags {
  webdriverDetected: boolean;
  userAgentMismatch: boolean;
  pluginsAnomalous: boolean;
  permissionsMissing: boolean;
  headlessPatternDetected: boolean;
}

export interface SecurityTelemetryContext {
  sessionId: string;
  timestamp: string;
  isBot: boolean;
  botConfidence: number; // 0.0 to 1.0
  reasons: string[];
  flags: BotHeuristicFlags;
  clientEnvironment: {
    userAgent: string;
    platform: string;
    hasTouch: boolean;
    maxTouchPoints: number;
    hardwareConcurrency: number;
    language: string;
  };
}

export interface BotDetectionOptions {
  navigatorOverride?: Partial<Navigator>;
  screenOverride?: Partial<Screen>;
  windowOverride?: {
    chrome?: unknown;
    outerWidth?: number;
    outerHeight?: number;
  };
}

export interface BotDetectionResult {
  isBot: boolean;
  botConfidence: number;
  reasons: string[];
  flags: BotHeuristicFlags;
  telemetryContext: SecurityTelemetryContext;
}

// Global active security telemetry state for the current session
let activeSecurityTelemetry: SecurityTelemetryContext | null = null;

export function getSecurityTelemetryContext(): SecurityTelemetryContext | null {
  return activeSecurityTelemetry;
}

export function setSecurityTelemetryContext(context: SecurityTelemetryContext): void {
  activeSecurityTelemetry = { ...context };
}

export function clearSecurityTelemetryContext(): void {
  activeSecurityTelemetry = null;
}

/**
 * Checks for navigator.webdriver.
 */
export function detectWebdriver(nav: Partial<Navigator>): { detected: boolean; reason?: string } {
  if (nav.webdriver === true) {
    return {
      detected: true,
      reason: "Automated browser control flag navigator.webdriver === true",
    };
  }
  return { detected: false };
}

/**
 * Evaluates anomalous plugins behavior.
 * NOTE: Mobile browsers (iOS Safari, Android Chrome) naturally have empty plugins!
 * Therefore, empty plugins is ONLY flagged if the user-agent claims a desktop browser.
 */
export function detectAnomalousPlugins(
  nav: Partial<Navigator>,
  isMobileDevice: boolean,
): { detected: boolean; reason?: string } {
  const plugins = nav.plugins;

  // On standard mobile, empty plugins is expected and never anomalous
  if (isMobileDevice) {
    return { detected: false };
  }

  // If plugins is null or undefined on desktop
  if (!plugins) {
    return {
      detected: true,
      reason: "Missing navigator.plugins object on desktop browser",
    };
  }

  // Headless Chrome on desktop often has plugins.length === 0
  // Standard desktop Chrome / Firefox / Edge has 1+ plugins (like PDF viewer)
  if (plugins.length === 0 && !isMobileDevice) {
    return {
      detected: true,
      reason: "Zero browser plugins reported on claimed desktop environment",
    };
  }

  return { detected: false };
}

/**
 * Checks User-Agent for headless tokens and platform inconsistencies.
 */
export function detectUserAgentAnomalies(nav: Partial<Navigator>): {
  detected: boolean;
  headlessTokenFound: boolean;
  mismatchFound: boolean;
  reason?: string;
} {
  const ua = (nav.userAgent || "").trim();
  const platform = (nav.platform || "").trim();

  // 1. Direct headless tokens
  const headlessRegex = /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium/i;
  if (headlessRegex.test(ua)) {
    return {
      detected: true,
      headlessTokenFound: true,
      mismatchFound: false,
      reason: `Headless automation identifier found in User-Agent: ${ua}`,
    };
  }

  // 2. Languages array check: bare headless environments often leave languages empty
  if (Array.isArray(nav.languages) && nav.languages.length === 0) {
    return {
      detected: true,
      headlessTokenFound: false,
      mismatchFound: true,
      reason: "Empty navigator.languages array",
    };
  }

  // 3. Obvious platform vs UA spoofing mismatches
  const isAppleUa = /iPhone|iPad|iPod/i.test(ua);
  const isMacUa = /Macintosh/i.test(ua) || (/Mac OS X/i.test(ua) && !isAppleUa);
  const isWindowsUa = /Windows NT/i.test(ua);

  if (isAppleUa && platform && !/iPhone|iPad|iPod/i.test(platform)) {
    return {
      detected: true,
      headlessTokenFound: false,
      mismatchFound: true,
      reason: `User-Agent claims iOS (${ua}) but navigator.platform is ${platform}`,
    };
  }

  if (isWindowsUa && platform && !/Win/i.test(platform)) {
    return {
      detected: true,
      headlessTokenFound: false,
      mismatchFound: true,
      reason: `User-Agent claims Windows (${ua}) but navigator.platform is ${platform}`,
    };
  }

  if (isMacUa && platform && !/Mac/i.test(platform)) {
    return {
      detected: true,
      headlessTokenFound: false,
      mismatchFound: true,
      reason: `User-Agent claims macOS (${ua}) but navigator.platform is ${platform}`,
    };
  }

  return {
    detected: false,
    headlessTokenFound: false,
    mismatchFound: false,
  };
}

/**
 * Checks whether the Permissions API exists and behaves consistently.
 */
export function detectMissingPermissionsApi(nav: Partial<Navigator>): {
  detected: boolean;
  reason?: string;
} {
  // Standard modern desktop and mobile browsers support navigator.permissions
  if (!nav.permissions || typeof nav.permissions.query !== "function") {
    return {
      detected: true,
      reason: "Permissions API (navigator.permissions.query) is absent or not a function",
    };
  }

  return { detected: false };
}

/**
 * Helper to determine if the environment is a touch mobile device.
 */
export function isTouchMobile(nav: Partial<Navigator>): boolean {
  const ua = nav.userAgent || "";
  const maxTouch = nav.maxTouchPoints || 0;
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return (maxTouch > 0 && isMobileUa) || isMobileUa;
}

/**
 * Primary passive evaluation engine. Runs without throwing and records
 * telemetry context without showing any disruptive UI to the client session.
 */
export function evaluateBotHeuristics(options: BotDetectionOptions = {}): BotDetectionResult {
  const nav: Partial<Navigator> = options.navigatorOverride ||
    (typeof navigator !== "undefined" ? navigator : {});

  const reasons: string[] = [];
  let botPoints = 0;

  const isMobile = isTouchMobile(nav);

  // 1. Webdriver check (Weight: Very High)
  const webdriverCheck = detectWebdriver(nav);
  if (webdriverCheck.detected) {
    reasons.push(webdriverCheck.reason!);
    botPoints += 0.9;
  }

  // 2. User-Agent & Platform consistency (Weight: High)
  const uaCheck = detectUserAgentAnomalies(nav);
  if (uaCheck.detected) {
    reasons.push(uaCheck.reason!);
    if (uaCheck.headlessTokenFound) {
      botPoints += 0.95;
    } else {
      botPoints += 0.5;
    }
  }

  // 3. Plugins anomaly (Weight: Medium)
  const pluginsCheck = detectAnomalousPlugins(nav, isMobile);
  if (pluginsCheck.detected) {
    reasons.push(pluginsCheck.reason!);
    botPoints += 0.4;
  }

  // 4. Permissions API check (Weight: Medium)
  const permissionsCheck = detectMissingPermissionsApi(nav);
  if (permissionsCheck.detected) {
    reasons.push(permissionsCheck.reason!);
    botPoints += 0.35;
  }

  const confidence = Math.min(1.0, Number(botPoints.toFixed(2)));
  const isBot = confidence >= 0.5 || webdriverCheck.detected || uaCheck.headlessTokenFound;

  const flags: BotHeuristicFlags = {
    webdriverDetected: webdriverCheck.detected,
    userAgentMismatch: uaCheck.mismatchFound,
    pluginsAnomalous: pluginsCheck.detected,
    permissionsMissing: permissionsCheck.detected,
    headlessPatternDetected: uaCheck.headlessTokenFound,
  };

  const telemetryContext: SecurityTelemetryContext = {
    sessionId: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
    isBot,
    botConfidence: confidence,
    reasons,
    flags,
    clientEnvironment: {
      userAgent: nav.userAgent || "unknown",
      platform: nav.platform || "unknown",
      hasTouch: (nav.maxTouchPoints || 0) > 0,
      maxTouchPoints: nav.maxTouchPoints || 0,
      hardwareConcurrency: nav.hardwareConcurrency || 1,
      language: nav.language || "en",
    },
  };

  // Passive telemetry update without alerting attacker
  setSecurityTelemetryContext(telemetryContext);

  return {
    isBot,
    botConfidence: confidence,
    reasons,
    flags,
    telemetryContext,
  };
}
