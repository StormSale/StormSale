=== StormSale WooCommerce ===
Contributors: stormsale
Tags: woocommerce, affiliate, stellar, referrals, conversions
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
WC requires at least: 7.0
WC tested up to: 9.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Track affiliate referral clicks and log completed purchases to your StormSale smart campaign as encrypted, verified Stellar ledger conversions.

== Description ==

StormSale WooCommerce connects your storefront to the StormSale affiliate
protocol on the Stellar network.

* **Referral click tracking** — captures `?ss_ref=...` affiliate links in a
  signed, tamper-proof cookie that survives the full cart and checkout
  lifecycle, then forwards each click to your campaign.
* **Verified conversions** — hooks into `woocommerce_payment_complete`, encrypts
  the order payload with AES-256-GCM (XChaCha20-Poly1305 fallback), signs the
  request with HMAC-SHA256, and transmits it to your StormSale gateway.
* **Ledger confirmation** — stores the returned Stellar transaction hash on the
  order and marks the conversion verified. Failures retry automatically with
  exponential backoff via Action Scheduler.

= Data transmitted =

Only the following data leaves your store, encrypted with your API key:

* Order identifiers, totals, currency and line items
* Billing country and customer contact details (encrypted)
* The affiliate id and click id captured from the referral cookie
* Store URL and name

= Security =

* All payloads are encrypted with AES-256-GCM using a key derived from your API
  key via HKDF-SHA256.
* Every request is signed with HMAC-SHA256 and an idempotency key so duplicate
  submissions cannot double count conversions.
* The referral cookie is HTTP-only, `SameSite=Lax`, and `Secure` on HTTPS.

== Installation ==

1. Upload the `stormsale-woocommerce` folder to `/wp-content/plugins/`.
2. Activate the plugin through the *Plugins* screen.
3. Go to **WooCommerce > Settings > StormSale**.
4. Enter your **Campaign ID** and **API Key**, then save.

You may optionally define `STORMSALE_WC_CAMPAIGN_ID`, `STORMSALE_WC_API_KEY` and
`STORMSALE_WC_GATEWAY_URL` in `wp-config.php` to configure the plugin without
the database.

== Frequently Asked Questions ==

= Which hook logs the conversion? =

`woocommerce_payment_complete`. The conversion is queued immediately and retries
up to five times with exponential backoff if the gateway is unreachable.

= How are clicks attributed to an order? =

The referral cookie is copied onto the order meta when checkout completes, for
both classic checkout and the Cart/Checkout blocks.

= Can I resend a failed conversion? =

Yes. Open the order and use the *Resend to StormSale* order action.

== Changelog ==

= 1.0.0 =
* Initial release: referral click tracking, settings screen, encrypted
  conversion logging with verified Stellar ledger status.
