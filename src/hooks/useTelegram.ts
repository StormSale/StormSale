import { useState, useEffect, useCallback } from "react";
import type {
  TelegramUser,
  TelegramThemeParams,
  HapticImpactStyle,
  HapticNotificationType,
} from "../lib/telegram";
import {
  getTelegramWebApp,
  isTelegramMiniApp,
  getTelegramUser,
  getTelegramPlatform,
  syncTelegramTheme,
  triggerHaptic,
  openTelegramShareLink,
  copyReferralLinkWithHaptic,
} from "../lib/telegram";

export interface UseTelegramReturn {
  isTelegram: boolean;
  user: TelegramUser | null;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  triggerHaptic: (type: HapticImpactStyle | HapticNotificationType | "selection") => boolean;
  shareReferral: (referralUrl: string, shareText?: string) => void;
  copyReferralLink: (referralUrl: string) => Promise<boolean>;
}

export function useTelegram(): UseTelegramReturn {
  const [isTelegram] = useState<boolean>(() => isTelegramMiniApp());
  const [user] = useState<TelegramUser | null>(() => getTelegramUser());
  const [platform] = useState<string>(() => getTelegramPlatform());
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(() => {
    const wa = getTelegramWebApp();
    return wa?.colorScheme || "dark";
  });
  const [themeParams, setThemeParams] = useState<TelegramThemeParams>(() => {
    const wa = getTelegramWebApp();
    return wa?.themeParams || {};
  });
  const [isExpanded] = useState<boolean>(() => {
    const wa = getTelegramWebApp();
    return wa?.isExpanded ?? false;
  });

  useEffect(() => {
    if (!isTelegram) return;

    let isInitial = true;
    const unsubscribe = syncTelegramTheme((isDark) => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      setColorScheme(isDark ? "dark" : "light");
      const activeWa = getTelegramWebApp();
      if (activeWa) {
        setThemeParams(activeWa.themeParams || {});
      }
    });

    isInitial = false;

    return () => {
      unsubscribe();
    };
  }, [isTelegram]);

  const handleShareReferral = useCallback((referralUrl: string, shareText?: string) => {
    openTelegramShareLink(referralUrl, shareText);
  }, []);

  const handleCopyReferral = useCallback(async (referralUrl: string) => {
    return await copyReferralLinkWithHaptic(referralUrl);
  }, []);

  return {
    isTelegram,
    user,
    platform,
    colorScheme,
    themeParams,
    isExpanded,
    triggerHaptic,
    shareReferral: handleShareReferral,
    copyReferralLink: handleCopyReferral,
  };
}
