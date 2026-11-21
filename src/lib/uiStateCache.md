# Persistent UI & Filter State Cache — Architecture Diagram

## Overview

User dashboard preferences and structured filter state are now versioned and
schema-safe in `localStorage`. The system guarantees that a corrupt, outdated, or
off-shape entry can never be rendered into the UI.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    initUIStateCache()                               │
│  ───► scans all keys starting with "stormsale.ui."                  │
│  ───► validates envelope {v, updatedAt, value} against UI_STATE_VER  │
│  ───► evicts any entry that:                                       │
│       • has unknown version,                                        │
│       • has corrupt JSON,                                           │
│       • fails zod schema validation, or                             │
│       • expired via configured TTL                                 │
│  ───► runs once before the first React render                       │
└─────────────────────────────┬─────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │                     useFilterState(key, schema)      │
        │  ───► readUIState(key, schema, defaultValue)        │
        │       1. fetch raw JSON from localStorage           │
        │       2. envelopeSchema.safeParse()                 │
        │       3. check v === UI_STATE_VERSION               │
        │       4. check !isExpired(updatedAt, ttlMs)         │
        │       5. schema.safeParse(value) → reject if fail   │
        │       6. evict entry on any failure; return default │
        │  ───► setState(value) → useEffect → writeUIState    │
        │       writeUIState(key, schema, value)              │
        │         → stores {v: UI_STATE_VERSION, updatedAt,    │
        │           value: schema.parse(raw)}                  │
        │  ───► no manual JSON handling, no version migration   │
        └─────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │   Filter state persists across reloads (localStorage) │
        │                                                       │
        │   ┌─────────────────────┐   ┌───────────────────────┐       │
        │   │ Advertiser          │   │ Affiliate              │       │
        │   │ campaigns.filters   │   │ leaderboard.filters    │       │
        │   │ • statusFilter      │   │ • timeframe           │       │
        │   │ • search            │   │ • searchQuery         │       │
        │   └─────────────────────┘   └───────────────────────┘       │
        │                                                       │
        │   ┌─────────────────────┐   ┌───────────────────────┐       │
        │   │ Auditor             │   │ ZK Revenue Proof       │       │
        │   │ compliance-checklist│   │ filters               │       │
        │   │ • statusFilter      │   │ • selectedFamily      │       │
        │   │ • severityFilter    │   │ • searchQuery         │       │
        │   │ • query             │   └───────────────────────┘       │
        │   └─────────────────────┘                                       │
        └─────────────────────────────────────────────────────────────┘
```

## Key Guarantees

| Aspect               | Implementation                                                                 |
|----------------------|--------------------------------------------------------------------------------|
| Schema safety        | Every read validates against `zod`; bad values are silently evicted.         |
| Version rollback     | `UI_STATE_VERSION = 1`; any `v !== 1` entry is purged immediately on boot.   |
| TTL expiration       | Configurable `ttlMs`; entries older than `30 days` are dropped at boot.       |
| Safe cross-reload    | `useFilterState` writes to storage in a `useEffect`, decoupled from the updater.|
| SSR / private-mode   | `getStorage()` returns `null` when `window` is absent; defaults always apply.   |
| Boot hygiene         | `initUIStateCache()` runs once, purging stale entries before user interaction. |