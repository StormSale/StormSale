export interface StripeCheckoutSessionLike {
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
}

export function extractAffiliateToken(session: StripeCheckoutSessionLike): string | null {
  const token = session.metadata?.affiliate_token?.trim();
  return token && /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : null;
}

export function normalizeCheckoutAmount(session: StripeCheckoutSessionLike) {
  if (!Number.isInteger(session.amount_total) || (session.amount_total ?? 0) <= 0) {
    throw new Error("Stripe checkout session is missing a positive amount_total");
  }
  return { minorUnits: session.amount_total as number, currency: (session.currency ?? "usd").toUpperCase() };
}
