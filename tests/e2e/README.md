# End-to-end user journeys

Playwright tests that drive the real app (Vite dev server) through full user journeys.

| Spec                       | Journeys                                                                                               |
| :------------------------- | :----------------------------------------------------------------------------------------------------- |
| `wallet-connection.e2e.ts` | open/close wallet modal, demo account connect + disconnect, read-only key validation (reject + accept) |
| `role-journeys.e2e.ts`     | role consent + cancel, advertiser / affiliate / auditor dashboards, return to role selector            |

## Acceptance criteria

- **Multi-browser:** `chromium`, `firefox` and `webkit` projects (`playwright.config.ts`); CI runs one matrix job per browser (`.github/workflows/e2e.yml`).
- **Video on failure:** `video: "retain-on-failure"` (plus screenshot and trace). Failed runs upload `test-results/e2e/` and `playwright-report/` as a CI artifact.

```mermaid
flowchart LR
  PR[Push / PR] --> M{CI matrix}
  M --> C[chromium]
  M --> F[firefox]
  M --> W[webkit]
  C & F & W --> S[Vite dev server :4173]
  S --> J[Journeys: connect wallet -> pick role -> use dashboard]
  J --> R{Pass?}
  R -- yes --> G[Green check]
  R -- no --> V[Video + trace + screenshot uploaded as artifact]
```

## Running locally

```bash
npm run test:e2e:install   # one-off browser download
npm run test:e2e           # all browsers
npx playwright test --project=firefox
npx playwright show-report
```

The backend and Horizon are stubbed (`mockBackend` in `helpers.ts`), so the journeys need no API or network. Wallets that need an extension or hardware (Freighter, Ledger, passkey) are not driven; the 1-tap demo account and read-only mode cover the connect flow.

## Visual proof

Journey captured in a real browser: wallet modal, role selection with consent, auditor dashboard.

![Wallet modal](__proof__/01-wallet-modal.png)
![Role selection](__proof__/02-role-selection.png)
![Auditor dashboard](__proof__/03-auditor-dashboard.png)

---

## Multi-Resolution Visual Regression (#94)

Pixel-level comparison suite that checks for UI breaks between **375px mobile** and **1440px desktop** viewports.

| File                          | Purpose                                                                                            |
| :---------------------------- | :------------------------------------------------------------------------------------------------- |
| `visual-regression.config.ts` | Standalone Playwright config: `mobile-375` (375×812, dpr=2) and `desktop-1440` (1440×900) projects |
| `visual-regression.e2e.ts`    | 4-test suite: Landing Page, Wallet Modal, Role Dashboard, Pixel Snapshot                           |
| `diff-generator.ts`           | `VisualDiffReporter` — accumulates layout metrics and generates HTML + JSON diff report            |

### Running locally

```bash
# Run visual regression suite (compare against stored baselines)
npm run test:visual

# Update baselines after intentional UI changes
npm run test:visual:update

# View HTML diff report after a run
open test-results/visual-regression/visual-regression-report.html
```

### How it works

```mermaid
flowchart LR
  A["Developer / Dedicated Visual Run"] --> B["npm run test:visual"]
  B --> C["mobile-375 project\n375×812px · dpr=2 · isMobile"]
  B --> D["desktop-1440 project\n1440×900px · dpr=1"]
  C --> E["visual-regression.e2e.ts"]
  D --> E
  E --> F["Landing Page Layout"]
  E --> G["Wallet Modal Containment"]
  E --> H["Role Dashboard Grid vs Stack"]
  E --> I["toHaveScreenshot Pixel Check"]
  F & G & H --> J["VisualDiffReporter\nCollects metrics + base64 screenshots"]
  I --> K["Baseline PNGs in __snapshots__"]
  J --> L["HTML Diff Report\ntest-results/visual-regression/"]
  L --> M{"Layout breaks?"}
  M -- "No overflow / within threshold" --> N["PASS"]
  M -- "Overflow detected / pixel diff > 5%" --> O["FAIL + diff artifact"]
```

### Baseline snapshots

Snapshots are stored in `tests/e2e/__snapshots__/` per project:

- `mobile-375/landing-page-baseline.png`
- `desktop-1440/landing-page-baseline.png`

Run `npm run test:visual:update` to regenerate baselines after deliberate UI changes.
