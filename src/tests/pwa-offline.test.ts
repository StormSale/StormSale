// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "../components/InstallPrompt";
import { OfflineBanner } from "../components/OfflineBanner";
import { PwaRegistrationFeedback } from "../components/PwaRegistrationFeedback";
import { NotificationWrapper } from "../context/NotificationContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { createPwaRegistrationCallbacks } from "../lib/pwaRegistration";
import {
  cachePublicApiResponse,
  createPublicCampaignRequest,
  offlineStatusPlugin,
  publicCampaignCaching,
  pwaManifest,
} from "../pwaConfig";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function OnlineStatusProbe() {
  const online = useOnlineStatus();
  return createElement("output", null, String(online));
}

describe("PWA offline support", () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  const render = async (component: ReactNode) => {
    container = document.createElement("div");
    document.body.append(container);
    const mountedRoot = createRoot(container);
    root = mountedRoot;
    await act(async () => mountedRoot.render(component));
  };

  const getContainer = () => {
    if (!container) throw new Error("Test component has not been rendered");
    return container;
  };

  const setOnline = (value: boolean) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value });
  };

  afterEach(async () => {
    const mountedRoot = root;
    if (mountedRoot) await act(async () => mountedRoot.unmount());
    container?.remove();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Reflect.deleteProperty(navigator, "serviceWorker");
    vi.restoreAllMocks();
  });

  it("initializes the hook from navigator.onLine", async () => {
    setOnline(false);
    await render(createElement(OnlineStatusProbe));
    expect(getContainer().textContent).toBe("false");
  });

  it("updates hook state for online and offline browser events", async () => {
    setOnline(true);
    await render(createElement(OnlineStatusProbe));
    expect(getContainer().textContent).toBe("true");

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(getContainer().textContent).toBe("false");

    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(getContainer().textContent).toBe("true");
  });

  it("removes browser connectivity listeners when the hook unmounts", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    await render(createElement(OnlineStatusProbe));

    const onlineListener = addListener.mock.calls.find(([type]) => type === "online")?.[1];
    const offlineListener = addListener.mock.calls.find(([type]) => type === "offline")?.[1];
    expect(onlineListener).toBeDefined();
    expect(offlineListener).toBeDefined();

    const mountedRoot = root;
    if (!mountedRoot) throw new Error("Test component has not been rendered");
    await act(async () => mountedRoot.unmount());
    root = undefined;
    expect(removeListener).toHaveBeenCalledWith("online", onlineListener);
    expect(removeListener).toHaveBeenCalledWith("offline", offlineListener);
  });

  it("treats a service-worker cached response as offline and restores status on network success", async () => {
    const serviceWorker = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: serviceWorker,
    });
    setOnline(true);
    await render(createElement(OnlineStatusProbe));

    await act(async () => {
      serviceWorker.dispatchEvent(
        new MessageEvent("message", { data: { type: "SW_CACHED_FALLBACK" } }),
      );
    });
    expect(getContainer().textContent).toBe("false");

    await act(async () => {
      serviceWorker.dispatchEvent(
        new MessageEvent("message", { data: { type: "SW_ONLINE_RESTORED" } }),
      );
    });
    expect(getContainer().textContent).toBe("true");
  });

  it("announces Offline Mode with status semantics", async () => {
    await render(createElement(OfflineBanner));
    const status = getContainer().querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("Offline Mode");
    expect(status?.textContent).toContain("currently offline");
  });

  it("captures and invokes the supported browser install prompt", async () => {
    await render(createElement(InstallPrompt));
    const prompt = vi.fn().mockResolvedValue(undefined);
    const userChoice = Promise.resolve({ outcome: "accepted" as const, platform: "web" });
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice,
    });

    await act(async () => window.dispatchEvent(event));
    const button = getContainer().querySelector("button");
    expect(button?.textContent).toBe("Install StormSale App");
    expect(event.defaultPrevented).toBe(true);

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await userChoice;
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(getContainer().querySelector("button")).toBeNull();
    expect(getContainer().textContent).toContain("StormSale has been installed.");
  });

  it("uses the manifest configured for the PWA plugin and references existing icons", async () => {
    expect(pwaManifest.display).toBe("standalone");
    expect(pwaManifest.name).toBe("StormSale");
    expect(pwaManifest.start_url).toBe("/");
    expect(pwaManifest.background_color).toBe("#ffffff");
    expect(pwaManifest.theme_color).toBe("#6366f1");
    expect(pwaManifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", src: "/icon-192.png" }),
        expect.objectContaining({ sizes: "512x512", src: "/icon-512.png" }),
        expect.objectContaining({ purpose: "maskable" }),
      ]),
    );

    for (const icon of pwaManifest.icons) {
      expect(icon.src.startsWith("/")).toBe(true);
    }
  });

  it("caches only public campaign GETs with bounded network-first fallback", () => {
    const matches = publicCampaignCaching.urlPattern as (input: {
      url: URL;
      request: Request;
    }) => boolean;

    expect(publicCampaignCaching.handler).toBe("NetworkFirst");
    expect(publicCampaignCaching.options.networkTimeoutSeconds).toBe(3);
    expect(publicCampaignCaching.options.expiration.maxAgeSeconds).toBe(86400);
    expect(
      matches({
        url: new URL("https://api.example.test/api/campaigns/123"),
        request: new Request("https://api.example.test/api/campaigns/123"),
      }),
    ).toBe(true);
    expect(
      matches({
        url: new URL("https://api.example.test/api/users/me"),
        request: new Request("https://api.example.test/api/users/me"),
      }),
    ).toBe(false);
    expect(
      matches({
        url: new URL("https://api.example.test/api/campaigns/123?wallet=GABC"),
        request: new Request("https://api.example.test/api/campaigns/123?wallet=GABC"),
      }),
    ).toBe(false);
    expect(
      matches({
        url: new URL("https://api.example.test/api/campaigns/123"),
        request: new Request("https://api.example.test/api/campaigns/123", {
          method: "POST",
        }),
      }),
    ).toBe(false);
    expect(
      matches({
        url: new URL("https://api.example.test/api/campaigns/123"),
        request: new Request("https://api.example.test/api/campaigns/123", {
          headers: { Authorization: "x" },
        }),
      }),
    ).toBe(false);
    expect(publicCampaignCaching.options.plugins).toContain(offlineStatusPlugin);
  });

  it("omits cookies when requesting publicly cacheable campaign metadata", () => {
    const request = new Request("https://api.example.test/api/campaigns/123");
    expect(request.credentials).toBe("same-origin");
    expect(createPublicCampaignRequest(request).credentials).toBe("omit");
  });

  it("only persists successful public API responses without authorization headers", () => {
    const request = new Request("https://api.example.test/api/campaigns/123");
    const publicResponse = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "public, max-age=3600" },
    });
    const privateResponse = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "private, max-age=3600" },
    });
    const noStoreResponse = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "public, no-store" },
    });
    const personalizedResponse = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "public", Vary: "Cookie" },
    });
    const authorizedRequest = new Request("https://api.example.test/api/campaigns/123", {
      headers: { Authorization: "Bearer test-token" },
    });

    expect(cachePublicApiResponse(request, publicResponse)).toBe(publicResponse);
    expect(cachePublicApiResponse(request, privateResponse)).toBeNull();
    expect(cachePublicApiResponse(request, noStoreResponse)).toBeNull();
    expect(cachePublicApiResponse(request, personalizedResponse)).toBeNull();
    expect(cachePublicApiResponse(authorizedRequest, publicResponse)).toBeNull();
    expect(
      cachePublicApiResponse(
        request,
        new Response("{}", {
          status: 503,
          headers: { "Cache-Control": "public" },
        }),
      ),
    ).toBeNull();
  });

  it("dispatches registration lifecycle callbacks for user-visible feedback", () => {
    const offlineReady = vi.fn();
    const registrationError = vi.fn();
    window.addEventListener("pwa:offline-ready", offlineReady);
    window.addEventListener("pwa:register-error", registrationError);
    const callbacks = createPwaRegistrationCallbacks();
    const error = new Error("registration failed");

    callbacks.onOfflineReady();
    callbacks.onRegisterError(error);

    expect(offlineReady).toHaveBeenCalledOnce();
    expect(registrationError.mock.calls[0]?.[0]).toMatchObject({ detail: error });
    window.removeEventListener("pwa:offline-ready", offlineReady);
    window.removeEventListener("pwa:register-error", registrationError);
  });

  it("shows registration lifecycle feedback through the notification UI", async () => {
    await render(createElement(NotificationWrapper, null, createElement(PwaRegistrationFeedback)));
    const callbacks = createPwaRegistrationCallbacks();

    await act(async () => callbacks.onOfflineReady());
    expect(getContainer().textContent).toContain("StormSale is ready offline");

    await act(async () => callbacks.onRegisterError(new Error("worker unavailable")));
    expect(getContainer().textContent).toContain("Offline support could not be enabled");
    expect(getContainer().textContent).toContain("worker unavailable");
  });
});
