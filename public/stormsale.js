/* global window, document, URLSearchParams */
(function (window, document) {
  "use strict";

  var cookieName = "_stormsale_ref";
  var cookieAge = 30 * 24 * 60 * 60;
  var secure = window.location.protocol === "https:" ? "; Secure" : "";

  function readCookie(name) {
    var prefix = name + "=";
    var cookie = document.cookie.split(/;\s*/).find(function (part) {
      return part.indexOf(prefix) === 0;
    });
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
  }

  function sharedCookieDomain() {
    var labels = window.location.hostname.split(".");
    if (labels.length < 2) return "";

    for (var start = labels.length - 1; start >= 0; start -= 1) {
      var domain = labels.slice(start).join(".");
      var probe = "_stormsale_probe_" + Math.random().toString(36).slice(2);
      document.cookie = probe + "=1; Domain=" + domain + "; Path=/; SameSite=Lax" + secure;
      var supported = readCookie(probe) === "1";
      document.cookie = probe + "=; Domain=" + domain + "; Path=/; Max-Age=0" + secure;
      if (supported) return "; Domain=" + domain;
    }
    return "";
  }

  var cookieDomain = sharedCookieDomain();
  var referral = new URLSearchParams(window.location.search).get("ref");
  if (referral && referral.length <= 256) {
    document.cookie =
      cookieName +
      "=" +
      encodeURIComponent(referral) +
      "; Max-Age=" +
      cookieAge +
      "; Path=/; SameSite=Lax" +
      cookieDomain +
      secure;
  }

  var script = document.currentScript;
  var endpoint =
    (script && script.getAttribute("data-endpoint")) || window.STORMSALE_ENDPOINT || "";

  async function trackConversion(conversion) {
    if (!conversion || typeof conversion.orderId !== "string" || !conversion.orderId.trim()) {
      throw new TypeError("StormSale requires a non-empty orderId");
    }
    var amount = Number(conversion.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new TypeError("StormSale requires an amount greater than zero");
    }

    var payload = {
      orderId: conversion.orderId.trim(),
      amount: amount,
      referral: readCookie(cookieName),
    };

    document.dispatchEvent(new window.CustomEvent("stormsale:conversion", { detail: payload }));

    if (endpoint) {
      var response = await window.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit",
      });
      if (!response.ok) throw new Error("StormSale conversion request failed");
    }

    return payload;
  }

  window.stormsale = window.stormsale || {};
  window.stormsale.trackConversion = trackConversion;
})(window, document);