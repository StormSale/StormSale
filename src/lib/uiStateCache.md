# Persistent UI & Filter State Cache — Architecture

## Overview

Dashboard preferences (active tab, nav state, theme, sidebar), reusable UI
tabs, and structured filter state (search, status, timeframe, sort) persist in
`localStorage` under one versioned, schema-validated contract:

```json
{ "v": 1, "updatedAt": 1750000000000, "value": { "...": "..." } }
```

A corrupt, outdated, off-schema, expired, or future-dated entry is evicted
instead of being rendered. Legacy `{ v, value }` and bare-string tab entries
are upgraded in place. All persistence paths share the low-level envelope
helpers in `src/lib/uiStateCache.ts`.

## Data flow

```mermaid
flowchart TD
    subgraph Boot["Boot (src/main.tsx)"]
        A[initUIStateCache] -->|scan stormsale.* envelope-like keys| B{envelope valid?}
        B -->|no / expired / future / wrong version| C[evict entry]
        B -->|legacy {v,value}| L[migrate to v + updatedAt + value]
        B -->|yes| D[keep entry]
    end

    subgraph Read["Read path"]
        E[usePreference / useFilterState] --> F[readVersionedState]
        F --> G{version matches?}
        G -->|legacy v or bare tab string| H[validate → upgrade in place]
        G -->|current envelope| I[validate with zod / guard]
        I -->|fail| C
        I -->|pass| J[return value]
        H --> J
    end

    subgraph Write["Write path"]
        K[state change] --> L[writeVersionedState]
        L --> M[schema.safeParse]
        M -->|fail| N[reject write]
        M -->|pass| O[setItem v + updatedAt + value]
    end

    subgraph Sync["Cross-tab sync"]
        P[storage event from another tab] --> Q[re-read through schema]
        Q --> R[setState]
    end

    D --> E
    O -->|other tab| P
```

## Guarantees

| Aspect               | Implementation                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Schema safety        | Reads and writes validate against a `zod` schema (filters) or guard (prefs/tabs).                              |
| Versioning           | `UI_STATE_VERSION = 1`; any other version is purged on read and at boot.                                       |
| Legacy migration     | `{ v, value }` entries and bare-string tab values gain `updatedAt` on first read or boot sweep.                |
| TTL expiration       | Filters older than 30 days are dropped; preferences/tabs never expire; per-key overrides are honoured.         |
| Clock skew           | Future-dated entries beyond a 5-minute skew are treated as corrupt.                                            |
| Cross-tab sync       | A `storage` listener rehydrates changes from other tabs, re-validating first and ignoring other storage areas. |
| Write de-duplication | Hooks skip writes when the serialized value is unchanged, preventing echoes.                                   |
| SSR / private mode   | `getSafeStorage()` returns `null` without a DOM; defaults always apply.                                        |
| Boot hygiene         | `initUIStateCache()` sweeps all envelope-like `stormsale.*` keys before the first React render.                |

## Keys

| Layer            | Storage key                          | Envelope                  |
| ---------------- | ------------------------------------ | ------------------------- |
| Preferences      | `stormsale.<scope>.<name>`           | `{ v, updatedAt, value }` |
| Reusable UI tabs | `stormsale.tabs:<path>:<storageKey>` | `{ v, updatedAt, value }` |
| Filters          | `stormsale.ui.<scope>.<name>`        | `{ v, updatedAt, value }` |

All layers use the same version and validation pipeline. The shared
`stormsale.` namespace lets boot normalise every cache entry while
`isCacheEnvelope` leaves unrelated app storage (plain strings, arrays, and
domain payloads) untouched.
