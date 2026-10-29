/**
 * StormSale storefront referral click beacon.
 *
 * Emits a single beacon per referral session so clicks observed client-side
 * (cached pages, SPA navigation, hash fragments) still reach the campaign.
 */
(function (window, document, navigator) {
  "use strict";

  var config = window.StormSaleTracking || {};
  var core = window.StormSaleReferral;

  if (!core || !config.clickEndpoint) {
    return;
  }

  var referral = core.extractReferral(window.location, {
    affiliateParam: config.affiliateParam,
    clickParam: config.clickParam,
  });

  if (!referral) {
    return;
  }

  var fingerprint = referral.affiliateId + "|" + referral.clickId;

  try {
    if (
      window.sessionStorage &&
      window.sessionStorage.getItem("stormsale_click_sent") === fingerprint
    ) {
      return;
    }

    if (window.sessionStorage) {
      window.sessionStorage.setItem("stormsale_click_sent", fingerprint);
    }
  } catch {
    // Private browsing may block sessionStorage; continue and rely on server dedupe.
  }

  var body = JSON.stringify(
    core.buildClickRequest(referral, {
      url: window.location.href,
      referrer: document.referrer,
      campaignId: config.campaignId,
    }),
  );

  if (typeof navigator.sendBeacon === "function") {
    try {
      navigator.sendBeacon(config.clickEndpoint, new Blob([body], { type: "application/json" }));
      return;
    } catch {
      // Fall through to fetch below.
    }
  }

  if (typeof window.fetch === "function") {
    var headers = { "Content-Type": "application/json" };

    if (config.nonce) {
      headers["X-WP-Nonce"] = config.nonce;
    }

    window
      .fetch(config.clickEndpoint, {
        method: "POST",
        headers: headers,
        body: body,
        credentials: "same-origin",
        keepalive: true,
      })
      .catch(function () {
        // Click tracking is best-effort and must never break the storefront.
      });
  }
})(window, document, navigator);
