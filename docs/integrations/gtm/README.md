# StormSale Google Tag Manager template

`template.tpl` is a Community Template that records StormSale conversions from
any website where the StormSale sales flow runs. It is sandboxed (no custom
HTML, no remote scripts) and only pushes to `dataLayer`.

## Import

1. In Google Tag Manager open **Templates → Tag Templates → New**.
2. Use the overflow menu (⋮) → **Import** and select `template.tpl`.
3. Save the template. GTM validates the template parameters and web
   permissions on import.

## Configure the tag

Create a new tag from the **StormSale Conversion Tracking** template and fill
in:

| Field                 | Example                     | Notes                                             |
| --------------------- | --------------------------- | ------------------------------------------------- |
| Campaign ID           | `{{Campaign ID}}` or `42`   | StormSale campaign that receives the conversion.  |
| Order Value Variable  | `{{Order Value}}` or `99.5` | Must resolve to a number greater than zero.       |
| Currency              | `USD`, `XLM`, …             | ISO-4217 code or a variable that resolves to one. |
| Data Layer Event Name | `stormsale_conversion`      | Optional; defaults to `stormsale_conversion`.     |

### Triggers

The template is trigger-agnostic. Attach it to any trigger that represents a
completed sale:

- **Purchase** trigger (ecommerce) — recommended for shops using the GA4
  ecommerce data layer.
- **Custom Event** trigger, for example `purchase` or `order_completed`.
- **Page View** trigger on a dedicated thank-you page.

The tag calls `gtmOnSuccess()` after pushing the event, so GTM's tag firing
status reflects the validation result.

## Data layer shape

```js
dataLayer.push({
  event: "stormsale_conversion",
  stormsale: {
    campaign_id: "42",
    order_value: 99.5,
    currency: "USD",
  },
});
```

Downstream tags (GA4, Meta, TikTok, etc.) can map the nested `stormsale.*`
fields. To trigger downstream tags from this payload, create a **Custom
Event** trigger whose event name matches the configured _Data Layer Event
Name_.

## Validation behaviour

- A missing campaign ID or a non-positive order value calls
  `gtmOnFailure()` and pushes nothing.
- The template does not read cookies, send network requests, or inject
  scripts, so it needs no sandbox permissions beyond `dataLayer` access via
  `createQueue`.
