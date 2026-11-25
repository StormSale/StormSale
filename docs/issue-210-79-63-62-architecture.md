# Issues #210, #79, #63, and #62 — Architecture and Verification

## Architecture

```mermaid
flowchart LR
  subgraph RUM[Anonymous Web Vitals RUM]
    WV[web-vitals: LCP, CLS, INP] --> Privacy{DNT, GPC, or local opt-out?}
    Privacy -- Yes --> Skip[Send nothing]
    Privacy -- No --> Payload[Device and viewport categories only]
    Payload --> Beacon[sendBeacon with keepalive fetch fallback]
  end

  Beacon --> API[/api/telemetry/web-vitals/]
  API --> Validate[Strict Zod allowlist and size checks]
  Validate --> Redis[(Upstash Redis hourly hashes)]
  Redis --> Aggregate[Grouped counts, averages, and ratings]

  subgraph CSP[Strict CSP delivery]
    Policy[src/config/csp.ts] --> Meta[Vite HTML meta policy]
    Policy --> Vercel[Vercel response header]
    Policy --> Nginx[Nginx response header]
    Meta --> Browser[Browser enforcement]
    Vercel --> Browser
    Nginx --> Browser
  end

  subgraph Auditor[Auditor navigation and timeline]
    Controls[Block and UTC-date controls] --> Normalize[Validate inclusive range: max 10,000]
    Controls --> Local[Tenant-scoped local filtering]
    Normalize --> Chunks[1,000-ledger chunks]
    Chunks --> Events[Soroban getEvents with cursor pagination]
    Events --> Dedupe[Deduplicate, boundary-filter, and sort]
    Controls --> Date[UTC date-to-ledger binary search]
    Date --> Horizon[Horizon ledgers]
    History[AuditHistory] --> Tenant[AuditorTenancyContext]
    Tenant --> Timeline[Block-referenced lifecycle steps]
  end
```

## Visual evidence

### #79 — Strict CSP and network policy

![Production StormSale page rendering under the strict CSP](issue-79-proof.png)

Production Chromium verification confirmed:

- Telegram WebApp SDK loads with the updated SHA-384 SRI digest.
- Inline script elements and inline event handlers do not execute.
- React inline style attributes continue to work.
- A trusted Soroban RPC request succeeds.
- An untrusted RPC request is blocked by `connect-src`.
- Production localhost RPC/API attempts are blocked; localhost is allowed only in development.
- Fixed CoinGecko, Pyth Hermès, and Chainalysis origins remain available for existing pricing and sanctions features.
- Arbitrary federation servers, webhook destinations, custom RPC endpoints, merchant-hosted images, and deployment-specific Sentry ingestion hosts are intentionally blocked. Those features require a first-party proxy or an explicitly reviewed origin before they can be enabled under the strict policy.

### #63 — Block-range navigation and search

![Applying an exact block range](issue-63-block-range-proof.png)

![Jumping to a UTC date and resolving its ledger](issue-63-date-jump-proof.png)

The date-jump screenshot uses deterministic Horizon and Soroban responses in Chromium so the binary-search result is reproducible. Automated tests also cover invalid dates, future dates, bounded chunking, cursor pagination, deduplication, stale-response protection, and RPC failure fallback.

### #62 — Interactive audit trail timeline

![Five-step campaign lifecycle with block and metadata details](issue-62-timeline-proof.png)

Each expanded lifecycle exposes the block, UTC timestamp, actor, event ID, status, and detail for every step. Verified campaigns seal an evidence receipt; denied campaigns show a denied decision; pending campaigns remain at the current decision step. Records remain scoped to the selected auditor organization.
