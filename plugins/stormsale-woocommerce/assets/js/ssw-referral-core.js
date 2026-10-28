/**
 * StormSale referral tracking core.
 *
 * Framework-free, side-effect-free helpers shared by the storefront tracker and
 * the automated test suite. Exposed as `window.StormSaleReferral` in the
 * browser and as a CommonJS module under Node/test runners.
 */
(function (root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.StormSaleReferral = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;
  var AFFILIATE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{1,118}[A-Za-z0-9])$/;
  var CLICK_ID = /^[A-Za-z0-9._:-]{1,120}$/;

  var DEFAULT_CONFIG = {
    affiliateParam: "ss_ref",
    clickParam: "ss_click",
  };

  /**
   * Normalize an affiliate identifier, returning "" when invalid.
   *
   * @param {*} value Candidate value.
   * @return {string} Validated affiliate id or "".
   */
  function normalizeAffiliateId(value) {
    if (typeof value !== "string") {
      return "";
    }

    var candidate = value.trim();

    if (candidate === "" || candidate.length > 120) {
      return "";
    }

    if (STELLAR_PUBLIC_KEY.test(candidate) || AFFILIATE_ID.test(candidate)) {
      return candidate;
    }

    return "";
  }

  /**
   * Whether a value is a valid affiliate identifier.
   *
   * @param {*} value Candidate value.
   * @return {boolean} True when valid.
   */
  function isValidAffiliateId(value) {
    return normalizeAffiliateId(value) !== "";
  }

  /**
   * Normalize a click identifier, returning "" when invalid.
   *
   * @param {*} value Candidate value.
   * @return {string} Validated click id or "".
   */
  function sanitizeClickId(value) {
    if (typeof value !== "string") {
      return "";
    }

    var candidate = value.trim();

    return CLICK_ID.test(candidate) ? candidate : "";
  }

  /**
   * Safely decode a URL component.
   *
   * @param {string} value Encoded value.
   * @return {string} Decoded value.
   */
  function decode(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, "%20"));
    } catch {
      return String(value);
    }
  }

  /**
   * Parse a query string into a plain object.
   *
   * @param {string} query Raw query string (with or without leading ?/#).
   * @return {Object.<string,string>} Parsed parameters.
   */
  function parseQueryString(query) {
    var result = {};

    if (typeof query !== "string") {
      return result;
    }

    var trimmed = query.replace(/^[?#]+/, "");

    if (trimmed === "") {
      return result;
    }

    trimmed.split("&").forEach(function (pair) {
      if (pair === "") {
        return;
      }

      var separator = pair.indexOf("=");
      var key = separator === -1 ? pair : pair.slice(0, separator);
      var value = separator === -1 ? "" : pair.slice(separator + 1);
      var decodedKey = decode(key);

      if (decodedKey !== "" && typeof result[decodedKey] === "undefined") {
        result[decodedKey] = decode(value);
      }
    });

    return result;
  }

  /**
   * Extract referral parameters from a location object.
   *
   * Query string parameters win over hash parameters. Hash fragments are parsed
   * so single-page and cached checkouts still attribute correctly.
   *
   * @param {{search?:string, hash?:string}} location Window location.
   * @param {{affiliateParam?:string, clickParam?:string}} [config] Custom params.
   * @return {{affiliateId:string, clickId:string, source:string}|null} Referral.
   */
  function extractReferral(location, config) {
    var options = Object.assign({}, DEFAULT_CONFIG, config || {});
    var loc = location || {};
    var params = parseQueryString(loc.search);
    var source = "query";

    if (options.affiliateParam && typeof params[options.affiliateParam] === "undefined") {
      var hashParams = parseQueryString(loc.hash || "");
      var hashKeys = Object.keys(hashParams);

      for (var i = 0; i < hashKeys.length; i += 1) {
        if (typeof params[hashKeys[i]] === "undefined") {
          params[hashKeys[i]] = hashParams[hashKeys[i]];
        }
      }

      if (typeof params[options.affiliateParam] !== "undefined") {
        source = "hash";
      }
    }

    var affiliateId = normalizeAffiliateId(params[options.affiliateParam]);

    if (affiliateId === "") {
      return null;
    }

    return {
      affiliateId: affiliateId,
      clickId: sanitizeClickId(params[options.clickParam]),
      source: source,
    };
  }

  /**
   * Build the JSON body sent to the click beacon endpoint.
   *
   * @param {{affiliateId:string, clickId?:string}} referral Referral data.
   * @param {{url?:string, referrer?:string, campaignId?:string}} [meta] Context.
   * @return {{affiliate_id:string, click_id:string, landing_url:string, referrer:string, campaign_id:string}} Request body.
   */
  function buildClickRequest(referral, meta) {
    var data = referral || {};
    var context = meta || {};

    return {
      affiliate_id: normalizeAffiliateId(data.affiliateId),
      click_id: sanitizeClickId(data.clickId),
      landing_url: typeof context.url === "string" ? context.url : "",
      referrer: typeof context.referrer === "string" ? context.referrer : "",
      campaign_id: typeof context.campaignId === "string" ? context.campaignId : "",
    };
  }

  return {
    normalizeAffiliateId: normalizeAffiliateId,
    isValidAffiliateId: isValidAffiliateId,
    sanitizeClickId: sanitizeClickId,
    parseQueryString: parseQueryString,
    extractReferral: extractReferral,
    buildClickRequest: buildClickRequest,
  };
});
