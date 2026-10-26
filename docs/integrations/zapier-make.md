# Zapier and Make.com webhooks

StormSale's Webhook Manager can send event payloads to no-code webhook
destinations. Zapier and Make.com both accept these deliveries through their
custom webhook triggers.

> **Current integration scope:** StormSale is a Vite frontend. The Webhook
> Manager stores endpoints and delivery history in the current browser's
> `localStorage`, and the browser sends webhook requests directly. This is a
> development/demo integration, not a durable server-side REST Hook service.
> It does not provide account-scoped HTTP subscribe/unsubscribe endpoints,
> persistent server storage, or background delivery after the browser closes.
> Do not use it for production-critical automation or treat browser-stored HMAC
> secrets as confidential. A server backend with durable storage and
> authenticated account ownership is required for those guarantees.

## Configure Zapier

1. In Zapier, create a Zap and choose **Webhooks by Zapier** as the trigger.
2. Choose **Catch Hook** and copy the generated webhook URL.
3. In StormSale, open the **Webhook Manager** and register a destination.
   - Choose a clear name, such as `Zapier - New Conversion`.
   - Enter your destination URL: for direct testing, enter the Zapier Catch Hook URL. For production browser environments where cross-origin `OPTIONS` preflight restricts custom headers (`X-StormSale-*`), route requests through a lightweight CORS relay (e.g. Next.js API route or serverless proxy) that forwards events to your Catch Hook.
   - Keep the generated HMAC secret for consumers that verify signatures.
   - Select one or more StormSale event subscriptions.
4. Choose the event in **Test Payload Type**, then use the endpoint's test
   action. Zapier should receive a sample event that it can use to map fields.
5. Add an action, for example **Slack → Send Channel Message** or a CRM action,
   and map the fields described below.
6. Test the action and turn on the Zap.

Event dispatches initiate outbound deliveries within 3 seconds of triggering.
Delivery to an external Catch Hook is an asynchronous network request.
Because browser-based dispatch transmits an `application/json` payload along with
custom `X-StormSale-*` signature headers, cross-origin targets must support CORS
preflight (`OPTIONS`). Outbound delivery can be blocked if the destination does
not approve the JSON request's custom-header preflight, in which case a server relay
is recommended.

## Configure Make.com

1. Create a scenario and add **Webhooks → Custom webhook**.
2. Create the webhook, copy its URL, and use **Run once** to wait for a sample.
3. Register the Make URL in StormSale's Webhook Manager and select the event.
4. Send a test payload from the manager to let Make infer the fields.
5. Add Slack, CRM, or email modules; map the event fields and activate the
   scenario.

Make uses the same outbound delivery and payload format as Zapier. No separate
Make app or REST Hook API is included.

## Event payloads

All new event payloads are flat JSON objects. `id` is the event's stable
entity identifier, `event` is the trigger name, and `created_at` is an ISO 8601
UTC timestamp. Amounts and budgets are JSON numbers with a separate `currency`
field. Fields not available at the originating action are omitted.

### `campaign.created`

Emitted after a successful wallet-backed campaign creation.

```json
{
  "id": "campaign_42",
  "event": "campaign.created",
  "created_at": "2026-10-16T06:00:00.000Z",
  "campaign_id": 42,
  "campaign_name": "Summer Launch",
  "advertiser_address": "GADVERTISER_SAMPLE_WALLET",
  "budget": 500,
  "currency": "XLM",
  "commission_rate_percent": 12,
  "clearing_period_seconds": 604800,
  "tx_hash": "stellar-transaction-hash",
  "status": "created"
}
```

### `conversion.created`

Emitted after a sale transaction is confirmed.

```json
{
  "id": "SALE_123",
  "event": "conversion.created",
  "created_at": "2026-10-16T06:00:00.000Z",
  "conversion_id": "SALE_123",
  "campaign_id": "campaign-contract-address",
  "campaign_address": "campaign-contract-address",
  "affiliate_address": "GAFFILIATE_SAMPLE_WALLET",
  "advertiser_address": "GADVERTISER_SAMPLE_WALLET",
  "amount": 125,
  "currency": "XLM",
  "tx_hash": "stellar-transaction-hash",
  "status": "confirmed"
}
```

The current form has a campaign address rather than a numeric campaign
identifier, so `campaign_id` contains that address for this event.

### `payout.created`

Emitted after a successful payout claim. The current claim action provides a
campaign identifier and transaction hash, but not the payout amount; therefore
the payload intentionally omits `amount`.

```json
{
  "id": "payout_stellar-transaction-hash",
  "event": "payout.created",
  "created_at": "2026-10-16T06:00:00.000Z",
  "payout_id": "stellar-transaction-hash",
  "campaign_id": 42,
  "affiliate_address": "GAFFILIATE_SAMPLE_WALLET",
  "currency": "XLM",
  "tx_hash": "stellar-transaction-hash",
  "status": "claimed"
}
```

Sample records use representative values and include `is_test_event: true`.
The test-only field is not included in live event payloads.

## Delivery, retries, and security

- Requests are signed using the existing
  `X-StormSale-Signature: t=...,v1=...,nonce=...` HMAC-SHA256 format.
- Requests time out after 8 seconds. Delivery attempts retry with exponential
  backoff (starting at 2 seconds, capped at 60 seconds); repeated failures
  disable a destination after five consecutive failures.
- HTTP `410 Gone` disables the destination immediately, following the common
  webhook unsubscribe convention.
- Delivery begins asynchronously relative to the on-chain action; delivery
  failure does not roll back or reject the transaction. Review attempts in the
  Webhook Manager. Browser-based retries cannot continue when the page is
  closed.
- Only HTTPS URLs with public-looking hostnames are accepted. Localhost,
  private IPv4 ranges, IP-literal IPv6 addresses, and local/internal hostnames
  are rejected. Because requests run in the browser, this is not server-side
  DNS resolution or SSRF protection; DNS rebinding cannot be reliably
  prevented by this client-only implementation.
- HMAC secrets stored in `localStorage` can be read by the browser profile and
  page scripts. Use this only with trusted development destinations. Production
  secrets should be stored and used only by a server-side delivery service.

## Zapier template

[`zapier-conversion-to-slack.json`](./zapier-conversion-to-slack.json) provides a
ready-to-use configuration template for a **New Conversion → Slack alert**
Zap, detailing trigger schemas, field mappings, and Slack message formatting.
Users can start from this template by following the field mapping specification
or importing the defined trigger and action payload schemas into Zapier.

## Troubleshooting

- **No test event appears:** confirm the destination is active, the selected
  event matches the test type, and the URL is the Catch Hook URL rather than a
  Zapier editor URL.
- **Destination rejected:** use an HTTPS public hostname; private or local
  endpoints are intentionally blocked.
- **CORS or Preflight issues:** browser-based dispatch sends `application/json`
  with custom headers (`X-StormSale-Signature`, `X-StormSale-Event`, `X-StormSale-Delivery-Id`).
  Cross-origin targets must allow these headers and approve the `OPTIONS` preflight;
  delivery can be blocked if the destination rejects custom-header preflight requests.
- **Signature validation fails:** verify against the exact raw request body and
  the endpoint's current HMAC secret.
- **Automation stops after failures:** inspect delivery history, fix the remote
  endpoint, and reactivate it in the Webhook Manager. A `410` response disables
  it immediately.
- **Events stop when the page closes:** this is a limitation of browser-based
  dispatch. Durable delivery requires a server-side service and database.
