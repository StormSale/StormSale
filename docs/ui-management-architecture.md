# UI Management Architecture

```mermaid
flowchart LR
  W[Web3Context] --> H[Authenticated Header]
  W --> U[User Menu]
  H -->|network and switch state| N[Stellar Network Indicator]
  H -->|dashboard navigation callback| A[App Router]
  U -->|updateUserRole and disconnectWallet| W
  U -->|active role dashboard link| A
  T[Tabs] -->|validated selected value| Q[URL search parameter]
  T -->|persisted selection| S[localStorage]
  B[Badge] -->|semantic variant and optional icon| V[Tooltip]
```

The header and account menu read wallet state directly from `Web3Context`. Role changes use the existing role update API, navigation is delegated to the app router, and tab state is restored from a validated URL value or local preference.
