# Segment.io & RudderStack CDP Integration for StormSale

This document outlines the client-side customer data platform (CDP) tracking integration for StormSale affiliate lifecycle events using **Segment.io** (`analytics.js`) and **RudderStack** (`rudderanalytics`).

---

## 1. Architecture & Overview

StormSale utilizes a dual-dispatch CDP pipeline:

- **Segment.io**: For marketing automation, product analytics, and customer tracking.
- **RudderStack**: For open-source CDP ingestion, downstream warehouse warehousing (Google BigQuery, Snowflake), and downstream tools (Mixpanel, Amplitude).

Both SDKs receive **identical event payloads** conforming to the **Segment E-Commerce Spec**. This guarantees schema parity across all analytics destinations.

---

## 2. Environment Variables & Setup

Configuration is controlled entirely through client environment variables. **Never hardcode write keys or secrets in source code.**

### A. Environment Configuration

Add the following keys to your `.env.local` or hosting provider environment settings (e.g., Vercel):

```bash
# Segment.io Client Write Key (from Segment Source settings)
NEXT_PUBLIC_SEGMENT_WRITE_KEY=your_segment_write_key_here

# RudderStack Client Write Key (from RudderStack JavaScript Source)
NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY=your_rudderstack_write_key_here

# RudderStack Data Plane URL (e.g., https://your-dataplane.rudderstack.com)
NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL=https://hosted.rudderlabs.com
```

_Note: The integration supports both `NEXT_PUBLIC_*` and `VITE_*` prefixes seamlessly._

### B. SDK Installation & Initialization

No manual `<script>` tags are required in `index.html`. The `useSegmentStormSale` hook lazily and asynchronously initializes the SDK buffers and scripts at runtime only when:

1. The respective environment write keys are provided.
2. The user has granted explicit tracking consent (`hasAnalyticsConsent() === true`).
3. Initialization runs at most **once per session**, preventing duplicate tracking instances even during React 18/19 StrictMode remounts.

---

## 3. Privacy, Consent Gating & Zero-PII Policy

### A. Consent Gating (GDPR / CCPA)

StormSale operates on an **opt-in privacy model**:

- Consent state is stored in `localStorage` under `stormsale_analytics_consent`.
- If consent is not explicitly granted (`false` or missing), neither the Segment nor the RudderStack SDK scripts are fetched from CDN.
- All `trackCampaignViewed` and `trackOrderCompleted` invocations immediately return `false` without firing network requests or creating buffer entries.
- Users can toggle consent at any time via `setAnalyticsConsent(true | false)` or through `setConsent` on `useSegmentStormSale()`.

```typescript
import { useSegmentStormSale } from "@/hooks/useSegmentStormSale";

function AnalyticsConsentBanner() {
  const { hasConsent, setConsent } = useSegmentStormSale();

  return (
    <div>
      <p>We respect your privacy. Enable analytics to help improve StormSale?</p>
      <button onClick={() => setConsent(true)}>Accept</button>
      <button onClick={() => setConsent(false)}>Decline</button>
    </div>
  );
}
```

### B. Wallet Address Hashing (SHA-256)

Raw Stellar public keys (e.g., `GBBD...`) or EVM addresses are considered pseudo-identifiers under global privacy standards.

- In all outgoing events, wallet addresses are passed through `hashWalletAddress()`, which produces a deterministic, irreversible **64-character lowercase hexadecimal SHA-256 digest**.
- The raw wallet address is never sent to Segment, RudderStack, Mixpanel, Amplitude, or BigQuery.

### C. Runtime PII Guard

The `validateNoPII` utility inspects outgoing payloads before dispatch:

- **Forbidden Keys**: Rejects keys such as `walletAddress`, `privateKey`, `seed`, `mnemonic`, `token`, `sessionToken`, `email`, `phone`, `password`, `ssn`.
- **Forbidden Value Patterns**: Detects and throws errors on raw Stellar public keys (`G[A-Z2-7]{55}`), Stellar secret seeds (`S[ABCD][A-Z2-7]{54}`), Ethereum addresses (`0x[a-fA-F0-9]{40}`), and email addresses.

---

## 4. Standard Event Specifications & Sample Payloads

### A. Event: `Campaign Viewed`

Fired when a user views a campaign details listing or branded affiliate marketplace page.

**Event Name:** `Campaign Viewed`

**Properties:**

| Property          | Type     | Description                       | Example                        |
| :---------------- | :------- | :-------------------------------- | :----------------------------- |
| `campaign_id`     | `string` | Unique identifier of the campaign | `"101"`                        |
| `campaign_name`   | `string` | Name of the campaign              | `"Apex Ultra Pro SaaS Launch"` |
| `category`        | `string` | Campaign industry category        | `"Software & Cloud"`           |
| `commission_rate` | `number` | Affiliate commission percentage   | `25`                           |

**Sample Segment / RudderStack Payload:**

```json
{
  "event": "Campaign Viewed",
  "properties": {
    "campaign_id": "101",
    "campaign_name": "Apex Ultra Pro SaaS Launch",
    "category": "Software & Cloud",
    "commission_rate": 25
  }
}
```

---

### B. Event: `Order Completed`

Fired when an affiliate sale is verified and confirmed on the Stellar ledger.

**Event Name:** `Order Completed`

**Properties:**

| Property       | Type     | Description                             | Example                                                              |
| :------------- | :------- | :-------------------------------------- | :------------------------------------------------------------------- |
| `order_id`     | `string` | Unique on-chain sale or transaction ID  | `"SALE_1713446400000"`                                               |
| `campaign_id`  | `string` | Identifier of the campaign              | `"101"`                                                              |
| `revenue`      | `number` | Sale amount in native XLM tokens        | `150.0`                                                              |
| `currency`     | `string` | Currency symbol (strictly `"XLM"`)      | `"XLM"`                                                              |
| `affiliate_id` | `string` | SHA-256 hashed affiliate wallet address | `"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"` |

**Sample Segment / RudderStack Payload:**

```json
{
  "event": "Order Completed",
  "properties": {
    "order_id": "SALE_1713446400000",
    "campaign_id": "101",
    "revenue": 150.0,
    "currency": "XLM",
    "affiliate_id": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
  }
}
```

---

## 5. Hook Usage in Components

```tsx
import React, { useEffect } from "react";
import { useSegmentStormSale } from "@/hooks/useSegmentStormSale";

export const CampaignDetailsPage: React.FC<{ campaign: any }> = ({ campaign }) => {
  const { trackCampaignViewed, trackOrderCompleted } = useSegmentStormSale();

  // Track campaign view when component mounts
  useEffect(() => {
    trackCampaignViewed({
      campaignId: campaign.id,
      campaignName: campaign.name,
      category: campaign.category,
      commissionRate: campaign.commissionRate,
    });
  }, [campaign.id]);

  const handleSaleSettledOnChain = (saleReceipt: any) => {
    trackOrderCompleted({
      orderId: saleReceipt.saleId,
      campaignId: campaign.id,
      revenue: saleReceipt.amountXlm,
      affiliateAddress: saleReceipt.affiliateAddress, // Automatically hashed via SHA-256
    });
  };

  return <div>{/* Component UI */}</div>;
};
```

---

## 6. How to Add a New Event

To introduce a new tracked event to StormSale:

1. **Define Schema & Types in `src/utils/analyticsMapper.ts`**:
   - Create typed `Input` and `Payload` interfaces conforming to Segment specs.
   - Create a pure mapping function `mapYourEvent(input)`.
   - Run `validateNoPII(properties)` within the mapper.
2. **Expose in `src/hooks/useSegmentStormSale.ts`**:
   - Add a typed wrapper function `trackYourEvent(input)`.
   - Ensure it calls `if (!hasAnalyticsConsent()) return false;` before dispatching via `dispatchDualTrack()`.
3. **Write Unit Tests in `src/tests/`**:
   - Verify properties format, PII rejection, and dual dispatch behavior.
4. **Update Documentation**:
   - Document the event in this file with table properties and JSON sample payload.

---

## 7. Destination Compatibility Notes

By using the standardized `analytics.track(eventName, properties)` shape, events flow smoothly through RudderStack to downstream destinations without custom transformation:

### 1. Mixpanel

- `Campaign Viewed` and `Order Completed` are mapped directly to Mixpanel Events.
- `revenue` and `currency` automatically feed into Mixpanel Revenue tracking reports.
- `affiliate_id` serves as a distinct grouping property without exposing personal identities.

### 2. Amplitude

- Standard event names and properties populate Amplitude event segmentation charts.
- `revenue` automatically maps to Amplitude's native `$revenue` field in the Amplitude destination config.

### 3. Google BigQuery

- Events are loaded into partitioned dataset tables (`campaign_viewed`, `order_completed`).
- Field types match BigQuery schema: `revenue` (NUMERIC/FLOAT64), `campaign_id` (STRING), `affiliate_id` (STRING).
- Eliminates GDPR compliance exposure in SQL warehouses since raw wallet addresses are never written to disk.
