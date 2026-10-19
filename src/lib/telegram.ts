/**
 * Telegram Mini App (TMA) SDK Integration & Utilities
 * Provides comprehensive WebApp container support, safe-area adaptation,
 * theme synchronization, haptic feedback, and 1-click Telegram chat sharing.
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

export type HapticImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
export type HapticNotificationType = "error" | "success" | "warning";

export interface TelegramHapticFeedback {
  impactOccurred: (style: HapticImpactStyle) => void;
  notificationOccurred: (type: HapticNotificationType) => void;
  selectionChanged: () => void;
}

export interface TelegramBackButton {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
}

export interface TelegramMainButton {
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText: (text: string) => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
    start_param?: string;
  };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  BackButton: TelegramBackButton;
  MainButton: TelegramMainButton;
  HapticFeedback: TelegramHapticFeedback;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  onEvent: (eventType: string, eventHandler: () => void) => void;
  offEvent: (eventType: string, eventHandler: () => void) => void;
  sendData: (data: string) => void;
  readTextFromClipboard?: (callback: (text: string) => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

/**
 * Retrieve the active Telegram WebApp instance if available.
 */
export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

/**
 * Checks whether the current session is running inside a Telegram Mini App.
 */
export function isTelegramMiniApp(): boolean {
  const wa = getTelegramWebApp();
  if (!wa) return false;
  // Valid WebApp instances provide either a non-empty initData or a non-empty platform identifier other than "unknown"
  const hasInitData = typeof wa.initData === "string" && wa.initData.trim().length > 0;
  const hasRecognizedPlatform =
    typeof wa.platform === "string" &&
    wa.platform.trim().length > 0 &&
    wa.platform.toLowerCase() !== "unknown";

  return hasInitData || hasRecognizedPlatform;
}

/**
 * Returns the Telegram user object if available from initDataUnsafe.
 */
export function getTelegramUser(): TelegramUser | null {
  const wa = getTelegramWebApp();
  return wa?.initDataUnsafe?.user || null;
}

/**
 * Returns the Telegram platform string ('ios' | 'android' | 'tdesktop' | 'macos' | 'web' | etc.).
 */
export function getTelegramPlatform(): string {
  const wa = getTelegramWebApp();
  return wa?.platform || "web";
}

/**
 * Trigger native Telegram haptic feedback.
 * Supports both impact and notification styles with safe fallbacks.
 */
export function triggerHaptic(
  type: HapticImpactStyle | HapticNotificationType | "selection",
): boolean {
  const wa = getTelegramWebApp();
  if (!wa?.HapticFeedback) return false;

  try {
    if (type === "success" || type === "warning" || type === "error") {
      wa.HapticFeedback.notificationOccurred(type);
    } else if (type === "selection") {
      wa.HapticFeedback.selectionChanged();
    } else {
      wa.HapticFeedback.impactOccurred(type);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize Telegram WebApp SDK: expands viewport, sets ready state,
 * and syncs theme colors.
 */
export function initTelegramWebApp(): boolean {
  const wa = getTelegramWebApp();
  if (!wa) return false;

  try {
    wa.ready();
    wa.expand();
    applyTelegramTheme(wa);
    return true;
  } catch (err) {
    console.warn("Failed to initialize Telegram WebApp:", err);
    return false;
  }
}

/**
 * Internal helper to sync Telegram theme parameters into document classes and CSS custom properties.
 */
export function applyTelegramTheme(wa: TelegramWebApp): void {
  if (typeof document === "undefined") return;

  const isDark = wa.colorScheme === "dark";
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  // Sync Telegram theme CSS variables
  if (wa.themeParams) {
    const root = document.documentElement;
    if (wa.themeParams.bg_color) {
      root.style.setProperty("--tg-theme-bg-color", wa.themeParams.bg_color);
    }
    if (wa.themeParams.text_color) {
      root.style.setProperty("--tg-theme-text-color", wa.themeParams.text_color);
    }
    if (wa.themeParams.button_color) {
      root.style.setProperty("--tg-theme-button-color", wa.themeParams.button_color);
    }
    if (wa.themeParams.button_text_color) {
      root.style.setProperty("--tg-theme-button-text-color", wa.themeParams.button_text_color);
    }
    if (wa.themeParams.secondary_bg_color) {
      root.style.setProperty("--tg-theme-secondary-bg-color", wa.themeParams.secondary_bg_color);
    }
  }

  // Set Telegram header and background colors to blend seamlessly
  try {
    if (typeof wa.setHeaderColor === "function") {
      wa.setHeaderColor(isDark ? "#09090b" : "#ffffff");
    }
    if (typeof wa.setBackgroundColor === "function") {
      wa.setBackgroundColor(isDark ? "#09090b" : "#f8fafc");
    }
  } catch {
    // Ignore if not supported on client
  }
}

/**
 * Listen to Telegram theme changes and sync dynamically.
 * Returns an unsubscribe callback.
 */
export function syncTelegramTheme(onThemeChange?: (isDark: boolean) => void): () => void {
  const wa = getTelegramWebApp();
  if (!wa || typeof wa.onEvent !== "function") {
    return () => {};
  }

  const handler = () => {
    applyTelegramTheme(wa);
    if (onThemeChange) {
      onThemeChange(wa.colorScheme === "dark");
    }
  };

  wa.onEvent("themeChanged", handler);
  // Apply initial theme
  handler();

  return () => {
    try {
      wa.offEvent("themeChanged", handler);
    } catch {
      // Ignore
    }
  };
}

/**
 * 1-Click Share to Telegram:
 * Invokes native Telegram chat chooser with referral URL and message.
 */
export function openTelegramShareLink(referralUrl: string, shareText?: string): void {
  const wa = getTelegramWebApp();
  triggerHaptic("light");

  const textParam = shareText ? `&text=${encodeURIComponent(shareText)}` : "";
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}${textParam}`;

  if (wa && typeof wa.openTelegramLink === "function") {
    wa.openTelegramLink(shareUrl);
  } else if (typeof window !== "undefined") {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }
}

/**
 * Copy referral link with native Telegram haptic feedback.
 */
export async function copyReferralLinkWithHaptic(referralUrl: string): Promise<boolean> {
  let copied = false;
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(referralUrl);
      copied = true;
    } catch (err) {
      console.warn("Clipboard API failed, trying fallback:", err);
    }
  }
  if (!copied && typeof document !== "undefined" && document.body) {
    const textArea = document.createElement("textarea");
    textArea.value = referralUrl;
    document.body.appendChild(textArea);
    try {
      textArea.select();
      copied = document.execCommand("copy");
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    } finally {
      document.body.removeChild(textArea);
    }
  }

  if (copied) {
    triggerHaptic("success");
  } else {
    triggerHaptic("error");
  }
  return copied;
}
