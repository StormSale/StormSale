# Issue #46: encrypted affiliate link flow

```mermaid
flowchart LR
  A[Affiliate wallet + campaign ID] --> B[Versioned JSON payload]
  B --> C[AES-256-GCM with fresh 96-bit IV]
  C --> D[URL query: ref=v1.IV.ciphertext]
  C --> E[Raw AES key]
  E --> F[URL fragment: key=base64url]
  D --> G[Complete share URL]
  F --> G
  G --> H[Local QR code generation]
  G --> I[Copy share link]
  H --> J[Scan or download PNG]
```

The encrypted payload contains `{ v, affiliate, campaignId, createdAt }`. The query can be sent to the destination server without revealing the affiliate details. Browsers do not send URL fragments in HTTP requests, so the decryption key remains client-side. Anyone with the complete share URL can read the payload; the encryption protects metadata in transit and in server-visible request data, not access from recipients.
