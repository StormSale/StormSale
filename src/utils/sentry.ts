import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn("VITE_SENTRY_DSN not provided. Sentry error tracking disabled.");
    return;
  }

  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    // Sample 10% of errors/transactions in production to prevent quota exhaustion
    sampleRate: 0.1,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    beforeSend(event) {
      // Regex pattern to identify Stellar secret keys (starts with 'S' and is 56 chars long)
      const stellarSecretKeyRegex = /S[A-D2-7]{55}/g;
      // Regex pattern for potential seed phrases / private data
      const sensitiveDataRegex =
        /(secret|privateKey|seedPhrase|mnemonic)\s*[:=]\s*["']?[^"'\s]+["']?/gi;

      let eventJson = JSON.stringify(event);

      // Scrub secret keys and sensitive properties
      eventJson = eventJson.replace(stellarSecretKeyRegex, "[SCRUBBED_SECRET_KEY]");
      eventJson = eventJson.replace(sensitiveDataRegex, '$1="[SCRUBBED]"');

      const sanitizedEvent = JSON.parse(eventJson);

      // Strip client IP address for user privacy
      if (sanitizedEvent.user) {
        delete sanitizedEvent.user.ip_address;
      }

      return sanitizedEvent;
    },
  });
}
