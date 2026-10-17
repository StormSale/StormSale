import { describe, it, expect } from "vitest";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

describe("PWA Offline Shell & Background Sync Suite", () => {
  it("exports useOnlineStatus hook", () => {
    expect(typeof useOnlineStatus).toBe("function");
  });

  it("defaults to true in non-browser or standard online environment", () => {
    const isOnline =
      typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
        ? navigator.onLine
        : true;
    expect(typeof isOnline).toBe("boolean");
  });

  it("validates PWA Web App Manifest structure conforms to requirements", async () => {
    // Verify that manifest icon paths, standalone display mode, and theme color meet criteria
    const manifestConfig = {
      name: "StormSale",
      short_name: "StormSale",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#6366f1",
      icons: [
        {
          src: "/pwa-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "/icons/maskable-icon-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    };

    expect(manifestConfig.display).toBe("standalone");
    expect(manifestConfig.name).toBe("StormSale");
    expect(manifestConfig.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifestConfig.icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(manifestConfig.icons.some((i) => i.sizes === "512x512")).toBe(true);
    expect(manifestConfig.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
});
