import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTelegramMiniApp,
  initTelegramWebApp,
  getTelegramUser,
  getTelegramPlatform,
  triggerHaptic,
  syncTelegramTheme,
  applyTelegramTheme,
  openTelegramShareLink,
  copyReferralLinkWithHaptic,
} from "../lib/telegram";
import type { TelegramWebApp } from "../lib/telegram";
import { MOCK_TELEGRAM_CAMPAIGNS } from "../components/affiliate/TelegramCampaignBrowser";

describe("Telegram Mini-App (TMA) Client Integration", () => {
  let mockWebApp: TelegramWebApp;
  const classListSet = new Set<string>();
  const styleMap = new Map<string, string>();

  let origWindowDescriptor: PropertyDescriptor | undefined;
  let origDocumentDescriptor: PropertyDescriptor | undefined;
  let origNavigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    classListSet.clear();
    styleMap.clear();

    mockWebApp = {
      initData:
        "query_id=AAHd&user=%7B%22id%22%3A123456%2C%22first_name%22%3A%22Alex%22%2C%22username%22%3A%22alex_web3%22%7D",
      initDataUnsafe: {
        query_id: "AAHd",
        user: {
          id: 123456,
          first_name: "Alex",
          username: "alex_web3",
        },
      },
      version: "7.10",
      platform: "ios",
      colorScheme: "dark",
      themeParams: {
        bg_color: "#18222d",
        text_color: "#ffffff",
        button_color: "#2ea6ff",
        button_text_color: "#ffffff",
        secondary_bg_color: "#131b24",
      },
      isExpanded: true,
      viewportHeight: 700,
      viewportStableHeight: 700,
      headerColor: "#18222d",
      backgroundColor: "#18222d",
      BackButton: {
        isVisible: false,
        show: vi.fn(),
        hide: vi.fn(),
        onClick: vi.fn(),
        offClick: vi.fn(),
      },
      MainButton: {
        text: "CONTINUE",
        color: "#2ea6ff",
        textColor: "#ffffff",
        isVisible: false,
        isActive: true,
        isProgressVisible: false,
        setText: vi.fn(),
        onClick: vi.fn(),
        offClick: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
        showProgress: vi.fn(),
        hideProgress: vi.fn(),
      },
      HapticFeedback: {
        impactOccurred: vi.fn(),
        notificationOccurred: vi.fn(),
        selectionChanged: vi.fn(),
      },
      ready: vi.fn(),
      expand: vi.fn(),
      close: vi.fn(),
      openLink: vi.fn(),
      openTelegramLink: vi.fn(),
      setHeaderColor: vi.fn(),
      setBackgroundColor: vi.fn(),
      enableClosingConfirmation: vi.fn(),
      disableClosingConfirmation: vi.fn(),
      onEvent: vi.fn(),
      offEvent: vi.fn(),
      sendData: vi.fn(),
    };

    const mockDocument = {
      documentElement: {
        classList: {
          add: vi.fn((cls: string) => classListSet.add(cls)),
          remove: vi.fn((cls: string) => classListSet.delete(cls)),
          contains: vi.fn((cls: string) => classListSet.has(cls)),
        },
        style: {
          setProperty: vi.fn((key: string, val: string) => styleMap.set(key, val)),
          getPropertyValue: vi.fn((key: string) => styleMap.get(key) || ""),
        },
      },
    };

    const mockNavigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };

    const mockWindow = {
      Telegram: {
        WebApp: mockWebApp,
      },
      open: vi.fn(),
    };

    origWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    origDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    origNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

    Object.defineProperty(globalThis, "window", {
      value: mockWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: mockDocument,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: mockNavigator,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (origWindowDescriptor) {
      Object.defineProperty(globalThis, "window", origWindowDescriptor);
    } else {
      delete (globalThis as any).window;
    }

    if (origDocumentDescriptor) {
      Object.defineProperty(globalThis, "document", origDocumentDescriptor);
    } else {
      delete (globalThis as any).document;
    }

    if (origNavigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", origNavigatorDescriptor);
    } else {
      delete (globalThis as any).navigator;
    }

    vi.restoreAllMocks();
  });

  describe("TMA Container & Environment Detection", () => {
    it("correctly identifies when running inside Telegram Mini App", () => {
      expect(isTelegramMiniApp()).toBe(true);
      expect(getTelegramPlatform()).toBe("ios");
      expect(getTelegramUser()?.username).toBe("alex_web3");
    });

    it("recognizes empty initData when valid platform identifier is present", () => {
      mockWebApp.initData = "";
      mockWebApp.platform = "android";
      expect(isTelegramMiniApp()).toBe(true);
    });

    it("recognizes non-empty initData when platform is unknown or empty", () => {
      mockWebApp.initData = "query_id=AAHd";
      mockWebApp.platform = "unknown";
      expect(isTelegramMiniApp()).toBe(true);
    });

    it("returns false when both initData and platform are unrecognized", () => {
      mockWebApp.initData = "";
      mockWebApp.platform = "unknown";
      expect(isTelegramMiniApp()).toBe(false);
    });

    it("returns false when Telegram WebApp SDK is not present", () => {
      delete (globalThis as any).window.Telegram;
      expect(isTelegramMiniApp()).toBe(false);
      expect(getTelegramPlatform()).toBe("web");
      expect(getTelegramUser()).toBeNull();
    });

    it("initializes WebApp with viewport expansion without unconditional close confirmation", () => {
      const initialized = initTelegramWebApp();
      expect(initialized).toBe(true);
      expect(mockWebApp.ready).toHaveBeenCalledTimes(1);
      expect(mockWebApp.expand).toHaveBeenCalledTimes(1);
      expect(mockWebApp.enableClosingConfirmation).not.toHaveBeenCalled();
    });
  });

  describe("Theme Synchronization with Telegram Client", () => {
    it("applies dark theme class and CSS variables matching Telegram colorScheme", () => {
      mockWebApp.colorScheme = "dark";
      applyTelegramTheme(mockWebApp);

      expect(classListSet.has("dark")).toBe(true);
      expect(mockWebApp.setHeaderColor).toHaveBeenCalledWith("#09090b");
      expect(mockWebApp.setBackgroundColor).toHaveBeenCalledWith("#09090b");
    });

    it("removes dark theme class when Telegram switches to light theme", () => {
      mockWebApp.colorScheme = "light";
      applyTelegramTheme(mockWebApp);

      expect(classListSet.has("dark")).toBe(false);
      expect(mockWebApp.setHeaderColor).toHaveBeenCalledWith("#ffffff");
      expect(mockWebApp.setBackgroundColor).toHaveBeenCalledWith("#f8fafc");
    });

    it("registers themeChanged event listener and triggers dynamic update", () => {
      let registeredHandler: (() => void) | undefined;
      mockWebApp.onEvent = vi.fn().mockImplementation((event, handler) => {
        if (event === "themeChanged") {
          registeredHandler = handler;
        }
      });

      const onThemeChangeSpy = vi.fn();
      const unsubscribe = syncTelegramTheme(onThemeChangeSpy);

      expect(mockWebApp.onEvent).toHaveBeenCalledWith("themeChanged", expect.any(Function));

      // Simulate Telegram theme switch from dark to light
      mockWebApp.colorScheme = "light";
      if (registeredHandler) {
        registeredHandler();
      }

      expect(onThemeChangeSpy).toHaveBeenCalledWith(false);
      expect(classListSet.has("dark")).toBe(false);

      unsubscribe();
      expect(mockWebApp.offEvent).toHaveBeenCalledWith("themeChanged", expect.any(Function));
    });
  });

  describe("Native Haptic Feedback", () => {
    it("triggers impactOccurred for impact styles (light, medium, heavy, rigid, soft)", () => {
      triggerHaptic("light");
      expect(mockWebApp.HapticFeedback.impactOccurred).toHaveBeenCalledWith("light");

      triggerHaptic("medium");
      expect(mockWebApp.HapticFeedback.impactOccurred).toHaveBeenCalledWith("medium");

      triggerHaptic("heavy");
      expect(mockWebApp.HapticFeedback.impactOccurred).toHaveBeenCalledWith("heavy");
    });

    it("triggers notificationOccurred for notification types (success, warning, error)", () => {
      triggerHaptic("success");
      expect(mockWebApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith("success");

      triggerHaptic("warning");
      expect(mockWebApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith("warning");

      triggerHaptic("error");
      expect(mockWebApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith("error");
    });

    it("triggers selectionChanged for selection events", () => {
      triggerHaptic("selection");
      expect(mockWebApp.HapticFeedback.selectionChanged).toHaveBeenCalledTimes(1);
    });

    it("gracefully returns false when HapticFeedback is unavailable", () => {
      (mockWebApp as any).HapticFeedback = undefined;
      const result = triggerHaptic("medium");
      expect(result).toBe(false);
    });
  });

  describe("1-Click Sharing to Telegram Chats", () => {
    it("generates correct t.me/share/url deep link and calls openTelegramLink", () => {
      const referralUrl = "https://stormsale.xyz/c/camp-usdc-101?ref=GBSTORM1234";
      const shareText = "Join my StormSale campaign!";

      openTelegramShareLink(referralUrl, shareText);

      expect(mockWebApp.HapticFeedback.impactOccurred).toHaveBeenCalledWith("light");
      expect(mockWebApp.openTelegramLink).toHaveBeenCalledWith(
        `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareText)}`,
      );
    });

    it("falls back to window.open if openTelegramLink is not supported", () => {
      (mockWebApp as any).openTelegramLink = undefined;
      const windowOpenSpy = vi.fn();
      (globalThis as any).window.open = windowOpenSpy;

      const referralUrl = "https://stormsale.xyz/c/camp-xlm-303?ref=GBSTORM1234";
      openTelegramShareLink(referralUrl);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}`,
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  describe("Link Copy with Native Telegram Feedback", () => {
    it("copies referral URL to clipboard and triggers success haptic feedback", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      (navigator.clipboard as any).writeText = writeTextMock;

      const url = "https://stormsale.xyz/c/camp-usdc-101?ref=GBSTORM999";
      const result = await copyReferralLinkWithHaptic(url);

      expect(result).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith(url);
      expect(mockWebApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith("success");
    });

    it("triggers error haptic feedback if clipboard writing fails", async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
      (navigator.clipboard as any).writeText = writeTextMock;

      const url = "https://stormsale.xyz/c/camp-usdc-101?ref=GBSTORM999";
      const result = await copyReferralLinkWithHaptic(url);

      expect(result).toBe(false);
      expect(mockWebApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith("error");
    });

    it("falls back to execCommand when navigator.clipboard.writeText rejects and succeeds if execCommand succeeds", async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
      (navigator.clipboard as any).writeText = writeTextMock;

      const mockTextArea = {
        value: "",
        select: vi.fn(),
      };
      (document as any).body = {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      };
      (document as any).createElement = vi.fn().mockReturnValue(mockTextArea);
      (document as any).execCommand = vi.fn().mockReturnValue(true);

      const url = "https://stormsale.xyz/c/camp-usdc-101?ref=GBSTORM999";
      const result = await copyReferralLinkWithHaptic(url);

      expect(result).toBe(true);
      expect((document as any).execCommand).toHaveBeenCalledWith("copy");
      expect(mockWebApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith("success");
    });
  });

  describe("Telegram Campaign Directory", () => {
    it("contains multi-asset active campaigns with valid contract references and commission details", () => {
      expect(MOCK_TELEGRAM_CAMPAIGNS.length).toBeGreaterThanOrEqual(4);

      const usdcCampaign = MOCK_TELEGRAM_CAMPAIGNS.find((c) => c.asset === "USDC");
      const eurcCampaign = MOCK_TELEGRAM_CAMPAIGNS.find((c) => c.asset === "EURC");
      const xlmCampaign = MOCK_TELEGRAM_CAMPAIGNS.find((c) => c.asset === "XLM");

      expect(usdcCampaign).toBeDefined();
      expect(eurcCampaign).toBeDefined();
      expect(xlmCampaign).toBeDefined();

      MOCK_TELEGRAM_CAMPAIGNS.forEach((c) => {
        expect(c.id).toBeTruthy();
        expect(c.name).toBeTruthy();
        expect(c.commissionRate).toBeTruthy();
        expect(c.clearingPeriod).toBeTruthy();
        expect(c.contractAddress).toBeTruthy();
      });
    });
  });
});
