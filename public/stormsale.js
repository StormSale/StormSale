/* global window, document, URLSearchParams */
(function (window, document) {
  "use strict";

  var cookieName = "_stormsale_ref";
  var cookieAge = 30 * 24 * 60 * 60;
  var requestTimeout = 10000;
  var base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  var secure = window.location.protocol === "https:" ? "; Secure" : "";

  function readCookie(name) {
    var prefix = name + "=";
    var cookie = document.cookie.split(/;\s*/).find(function (part) {
      return part.indexOf(prefix) === 0;
    });
    if (!cookie) return null;

    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return null;
    }
  }

  function isValidStellarKey(value) {
    if (typeof value !== "string" || value.length !== 56 || value.charAt(0) !== "G") return false;

    var bytes = [];
    var bits = 0;
    var buffer = 0;

    for (var index = 0; index < value.length; index += 1) {
      var digit = base32Alphabet.indexOf(value.charAt(index));
      if (digit === -1) return false;
      buffer = (buffer << 5) | digit;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }

    var crc = 0;
    for (var byte = 0; byte < 33; byte += 1) {
      crc ^= bytes[byte] << 8;
      for (var bit = 0; bit < 8; bit += 1) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }

    return crc === (bytes[33] | (bytes[34] << 8));
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
  if (referral && isValidStellarKey(referral)) {
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
      var controller =
        typeof window.AbortController === "function" ? new window.AbortController() : null;
      var request = window.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit",
        signal: controller ? controller.signal : undefined,
      });
      var response = await new Promise(function (resolve, reject) {
        var timer = window.setTimeout(function () {
          if (controller) controller.abort();
          reject(new Error("StormSale conversion request timed out"));
        }, requestTimeout);
        request.then(
          function (value) {
            window.clearTimeout(timer);
            resolve(value);
          },
          function (error) {
            window.clearTimeout(timer);
            reject(error);
          },
        );
      });
      if (!response.ok) throw new Error("StormSale conversion request failed");
    }

    return payload;
  }

  window.stormsale = window.stormsale || {};
  window.stormsale.trackConversion = trackConversion;
})(window, document);
