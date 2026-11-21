# Persistent UI & Filter State Cache — Architecture

## Overview

Dashboard preferences (active tab, nav state, theme) and structured filter
state (search, status, timeframe, sort) persist in `localStorage` under one
versioned, schema-validated contract:

```json
{ "v": 1, "updatedAt": 1750000000000, "value": { "...": "..." } }
```

A corrupt, outdated, off-schema, or expired entry is evicted instead of being
rendered. Both hooks share the same low-level envelope helpers in
`src/lib/uiStateCache.ts`.

## Data flow

```mermaid
flowchart TD
    subgraph Boot["Boot (src/main.tsx)"]
        A[initUIStateCache] -->|scan stormsale.ui.*| B{envelope valid?}
        B -->|no / expired / wrong version| C[evict entry]
        B -->|yes| D[keep entry]
    end

    subgraph Read["Read path"]
        E[usePreference / useFilterState] --> F[readVersionedState]
        F --> G{version matches?}
        G -->|legacy v with no updatedAt| H[validate → upgrade in place]
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

| Aspect               | Implementation                                                                |
| -------------------- | ----------------------------------------------------------------------------- |
| Schema safety        | Reads and writes validate against a `zod` schema (filters) or guard (prefs).  |
| Versioning           | `UI_STATE_VERSION = 1`; any other version is purged on read and at boot.      |
| Legacy migration     | `{ v, value }` preference entries gain `updatedAt` on first read.             |
| TTL expiration       | Filters older than 30 days are dropped at boot; preference keys never expire. |
| Cross-tab sync       | A `storage` listener rehydrates changes from other tabs, re-validating first. |
| Write de-duplication | Hooks skip writes when the serialized value is unchanged, preventing echoes.  |
| SSR / private mode   | `getSafeStorage()` returns `null` without a DOM; defaults always apply.       |
| Boot hygiene         | `initUIStateCache()` purges stale entries before the first React render.      |

## Keys

| Layer       | Storage key                   | Envelope                  |
| ----------- | ----------------------------- | ------------------------- |
| Preferences | `stormsale.<scope>.<name>`    | `{ v, updatedAt, value }` |
| Filters     | `stormsale.ui.<scope>.<name>` | `{ v, updatedAt, value }` |

Both namespaces use the same version and validation pipeline; only the key
prefix differs so filters can be swept at boot without touching unrelated
application storage.
