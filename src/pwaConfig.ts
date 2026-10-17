import type { WorkboxPlugin } from "workbox-core/types";

interface OfflineStatusScope {
  clients: {
    get(
      clientId: string,
    ): Promise<{ postMessage: (message: { type: string }) => void } | null | undefined>;
  };
}

export const pwaManifest = {
  name: "StormSale",
  short_name: "StormSale",
  start_url: "/",
  display: "standalone" as const,
  background_color: "#ffffff",
  theme_color: "#6366f1",
  icons: [
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "/icons/maskable-icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable" as const,
    },
  ],
};

export function cachePublicApiResponse(request: Request, response: Response): Response | null {
  const cacheControl = response.headers.get("Cache-Control")?.toLowerCase() ?? "";
  const vary = response.headers.get("Vary")?.toLowerCase() ?? "";
  const directives = cacheControl.split(",").map((directive) => directive.split("=", 1)[0].trim());
  const isPubliclyCacheable = directives.includes("public");
  const isExplicitlyPrivate = directives.some((directive) =>
    ["private", "no-store"].includes(directive),
  );
  const variesByCredentials = vary
    .split(",")
    .some((header) => ["*", "cookie", "authorization"].includes(header.trim()));
  const hasPrivateAuthorization = request.headers.has("Authorization");

  return response.status === 200 &&
    isPubliclyCacheable &&
    !isExplicitlyPrivate &&
    !variesByCredentials &&
    !hasPrivateAuthorization
    ? response
    : null;
}

export function createPublicCampaignRequest(request: Request): Request {
  return new Request(request, { credentials: "omit" });
}

export const offlineStatusPlugin: WorkboxPlugin = {
  requestWillFetch: async ({ request }) => new Request(request, { credentials: "omit" }),
  cacheWillUpdate: async ({ request, response }) => {
    const directives = (response.headers.get("Cache-Control") ?? "")
      .toLowerCase()
      .split(",")
      .map((directive) => directive.split("=", 1)[0].trim());
    const vary = (response.headers.get("Vary") ?? "")
      .toLowerCase()
      .split(",")
      .map((h) => h.trim());
    const cacheable =
      response.status === 200 &&
      directives.includes("public") &&
      !directives.includes("private") &&
      !directives.includes("no-store") &&
      !vary.some((h) => h === "*" || h === "cookie" || h === "authorization") &&
      !request.headers.has("Authorization");
    return cacheable ? response : null;
  },
  fetchDidSucceed: async ({ event, state, response }) => {
    if (response.ok) {
      if (state) state.receivedNetworkResponse = true;
      if ("clientId" in event && typeof event.clientId === "string") {
        const client = await (globalThis as typeof globalThis & OfflineStatusScope).clients.get(
          event.clientId,
        );
        client?.postMessage({ type: "SW_ONLINE_RESTORED" });
      }
    }
    return response;
  },
  handlerWillStart: async ({ state }) => {
    if (state) state.receivedNetworkResponse = false;
  },
  handlerDidRespond: async ({ event, state, response }) => {
    if (!response || state?.receivedNetworkResponse) return;
    if ("clientId" in event && typeof event.clientId === "string") {
      const client = await (globalThis as typeof globalThis & OfflineStatusScope).clients.get(
        event.clientId,
      );
      client?.postMessage({ type: "SW_CACHED_FALLBACK" });
    }
  },
};

export const publicCampaignCaching = {
  urlPattern: ({ url, request }: { url: URL; request: Request }) =>
    request.method === "GET" &&
    !request.headers.has("Authorization") &&
    url.pathname.startsWith("/api/campaigns/") &&
    url.search.length === 0,
  handler: "NetworkFirst" as const,
  options: {
    cacheName: "public-campaign-api-cache",
    networkTimeoutSeconds: 3,
    cacheableResponse: { statuses: [200] },
    expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
    plugins: [offlineStatusPlugin],
  },
};
