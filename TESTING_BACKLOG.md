# 🧪 StormSale Frontend Pre-Production Testing Roadmap & Backlog

This document tracks the **100 verified testing issues** created for the **`dev` branch** to advance the StormSale dApp frontend into its comprehensive testing phase before production release.

Target Repository: [StormSale/StormSale](https://github.com/StormSale/StormSale)  
Target Branch: `dev`  
Status: **Active Testing Phase**

---

## 📊 Testing Pillars Overview

| Pillar    | Focus Area                                                    | Issue Count | Complexity Distribution        |
| --------- | ------------------------------------------------------------- | ----------- | ------------------------------ |
| 1         | Web3, Stellar Wallet Kit & Soroban Integration                | 13          | 4 Low, 6 Medium, 3 High        |
| 2         | B2B Enterprise Multi-Seat, Organization & RBAC                | 13          | 3 Low, 7 Medium, 3 High        |
| 3         | B2C Two-Tier Referral Network & Affiliate UI                  | 13          | 6 Low, 6 Medium, 1 High        |
| 4         | Batch Sale Logging, Merkle Proofs & ZK Verifier               | 12          | 1 Low, 6 Medium, 5 High        |
| 5         | Real-Time Fraud Telemetry, Anomaly Detection & Bot Defense    | 12          | 4 Low, 5 Medium, 3 High        |
| 6         | End-to-End User Journey Tests (Playwright / Vitest E2E)       | 13          | 4 Low, 5 Medium, 4 High        |
| 7         | Performance, Concurrency, Caching & Memory Profiling          | 12          | 4 Low, 5 Medium, 3 High        |
| 8         | Security, Accessibility (WCAG 2.1 AA), Mobile & Cross-Browser | 12          | 5 Low, 4 Medium, 3 High        |
| **Total** | **Pre-Production Testing Suite**                              | **100**     | **27 Low, 44 Medium, 29 High** |

---

## 📋 Complete Issue Catalog (Issues #420 – #519)

| #   | Issue ID                                                  | Title                                                                                    | Labels / Pillar                                   | Complexity | Status |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------- | ------ |
| 1   | [#420](https://github.com/StormSale/StormSale/issues/420) | test(web3): suite for Stellar Wallet Kit multi-wallet connector state machine            | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 2   | [#421](https://github.com/StormSale/StormSale/issues/421) | test(web3): unit tests for Soroban RPC network failover and endpoint fallback            | `frontend`, `testing`, `web3`, `infra`            | **High**   | Open   |
| 3   | [#422](https://github.com/StormSale/StormSale/issues/422) | test(web3): simulation and gas estimation failure handling test suite                    | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 4   | [#423](https://github.com/StormSale/StormSale/issues/423) | test(web3): Ledger hardware wallet WebUSB and WebHID bridge test suite                   | `frontend`, `testing`, `web3`                     | **High**   | Open   |
| 5   | [#424](https://github.com/StormSale/StormSale/issues/424) | test(web3): Soroban contract event streaming and subscription race condition tests       | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 6   | [#425](https://github.com/StormSale/StormSale/issues/425) | test(web3): multi-signature transaction approval and status tracking tests               | `frontend`, `testing`, `web3`, `b2b`              | **High**   | Open   |
| 7   | [#426](https://github.com/StormSale/StormSale/issues/426) | test(web3): transaction fee surge pricing and dynamic base fee adjustment tests          | `frontend`, `testing`, `web3`                     | **Low**    | Open   |
| 8   | [#427](https://github.com/StormSale/StormSale/issues/427) | test(web3): Sep-0010 Stellar Web Authentication JWT lifecycle test suite                 | `frontend`, `testing`, `web3`, `security`         | **Medium** | Open   |
| 9   | [#428](https://github.com/StormSale/StormSale/issues/428) | test(web3): account merge and sub-account balance synchronization tests                  | `frontend`, `testing`, `web3`                     | **Low**    | Open   |
| 10  | [#429](https://github.com/StormSale/StormSale/issues/429) | test(web3): Soroban transaction replay protection and nonce tracking tests               | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 11  | [#430](https://github.com/StormSale/StormSale/issues/430) | test(web3): testnet to mainnet network switcher and alert boundary tests                 | `frontend`, `testing`, `web3`, `ui`               | **Low**    | Open   |
| 12  | [#431](https://github.com/StormSale/StormSale/issues/431) | test(web3): SEP-0007 URI scheme handler and QR code generator tests                      | `frontend`, `testing`, `web3`                     | **Low**    | Open   |
| 13  | [#432](https://github.com/StormSale/StormSale/issues/432) | test(web3): smart contract invocation batching and execution order tests                 | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 14  | [#433](https://github.com/StormSale/StormSale/issues/433) | test(b2b): multi-seat organization switching and session isolation test suite            | `frontend`, `testing`, `b2b`                      | **High**   | Open   |
| 15  | [#434](https://github.com/StormSale/StormSale/issues/434) | test(b2b): role-based UI component guards test suite (Owner, Admin, Manager, Auditor)    | `frontend`, `testing`, `b2b`, `security`          | **Medium** | Open   |
| 16  | [#435](https://github.com/StormSale/StormSale/issues/435) | test(b2b): member invitation lifecycle and seat allocation limits tests                  | `frontend`, `testing`, `b2b`                      | **Medium** | Open   |
| 17  | [#436](https://github.com/StormSale/StormSale/issues/436) | test(b2b): enterprise API key creation, scoping and secret reveal tests                  | `frontend`, `testing`, `b2b`, `security`          | **Medium** | Open   |
| 18  | [#437](https://github.com/StormSale/StormSale/issues/437) | test(b2b): bulk campaign CSV upload parser and validation preview tests                  | `frontend`, `testing`, `b2b`                      | **High**   | Open   |
| 19  | [#438](https://github.com/StormSale/StormSale/issues/438) | test(b2b): enterprise billing statement and tax invoice PDF export tests                 | `frontend`, `testing`, `b2b`                      | **Medium** | Open   |
| 20  | [#439](https://github.com/StormSale/StormSale/issues/439) | test(b2b): enterprise webhook endpoint configuration and ping test suite                 | `frontend`, `testing`, `b2b`                      | **Medium** | Open   |
| 21  | [#440](https://github.com/StormSale/StormSale/issues/440) | test(b2b): enterprise audit log filter, search and JSON export test suite                | `frontend`, `testing`, `b2b`, `auditor`           | **Low**    | Open   |
| 22  | [#441](https://github.com/StormSale/StormSale/issues/441) | test(b2b): enterprise SLA monitoring widget and RPC latency ping tests                   | `frontend`, `testing`, `b2b`, `ui`                | **Low**    | Open   |
| 23  | [#442](https://github.com/StormSale/StormSale/issues/442) | test(b2b): custom domain and whitelabel branding configuration tests                     | `frontend`, `testing`, `b2b`, `ui`                | **Medium** | Open   |
| 24  | [#443](https://github.com/StormSale/StormSale/issues/443) | test(b2b): enterprise escrow deposit and auto-replenish threshold tests                  | `frontend`, `testing`, `b2b`                      | **Medium** | Open   |
| 25  | [#444](https://github.com/StormSale/StormSale/issues/444) | test(b2b): enterprise bulk affiliate payout distribution wizard tests                    | `frontend`, `testing`, `b2b`                      | **High**   | Open   |
| 26  | [#445](https://github.com/StormSale/StormSale/issues/445) | test(b2b): organization KYC/KYB compliance status badge and upload tests                 | `frontend`, `testing`, `b2b`, `security`          | **Low**    | Open   |
| 27  | [#446](https://github.com/StormSale/StormSale/issues/446) | test(b2c): two-tier referral code URL parser and attribution persistence tests           | `frontend`, `testing`, `b2c`, `affiliate`         | **Medium** | Open   |
| 28  | [#447](https://github.com/StormSale/StormSale/issues/447) | test(b2c): affiliate tier progression and real-time commission calculator tests          | `frontend`, `testing`, `b2c`, `affiliate`         | **Medium** | Open   |
| 29  | [#448](https://github.com/StormSale/StormSale/issues/448) | test(b2c): dynamic referral link and branded QR code generator tests                     | `frontend`, `testing`, `b2c`, `ui`                | **Low**    | Open   |
| 30  | [#449](https://github.com/StormSale/StormSale/issues/449) | test(b2c): affiliate instant commission claim and micro-payout test suite                | `frontend`, `testing`, `b2c`, `affiliate`, `web3` | **Medium** | Open   |
| 31  | [#450](https://github.com/StormSale/StormSale/issues/450) | test(b2c): social share card preview and Web Share API integration tests                 | `frontend`, `testing`, `b2c`, `ui`                | **Low**    | Open   |
| 32  | [#451](https://github.com/StormSale/StormSale/issues/451) | test(b2c): affiliate sub-network tree visualization component tests                      | `frontend`, `testing`, `b2c`, `ui`                | **Medium** | Closed |
| 33  | [#452](https://github.com/StormSale/StormSale/issues/452) | test(b2c): consumer discount voucher and promotional code redemption tests               | `frontend`, `testing`, `b2c`                      | **Low**    | Open   |
| 34  | [#453](https://github.com/StormSale/StormSale/issues/453) | test(b2c): affiliate real-time earnings toast notifications test suite                   | `frontend`, `testing`, `b2c`, `ui`                | **Low**    | Open   |
| 35  | [#454](https://github.com/StormSale/StormSale/issues/454) | test(b2c): consumer mobile checkout touch and swipe interaction tests                    | `frontend`, `testing`, `b2c`, `ui`                | **Medium** | Open   |
| 36  | [#455](https://github.com/StormSale/StormSale/issues/455) | test(b2c): affiliate leaderboard ranking and gamification badges tests                   | `frontend`, `testing`, `b2c`, `ui`                | **Low**    | Open   |
| 37  | [#456](https://github.com/StormSale/StormSale/issues/456) | test(b2c): consumer purchase dispute initiation and evidence upload tests                | `frontend`, `testing`, `b2c`, `auditor`           | **Medium** | Open   |
| 38  | [#457](https://github.com/StormSale/StormSale/issues/457) | test(b2c): affiliate tax form submission and withholding confirmation tests              | `frontend`, `testing`, `b2c`                      | **Low**    | Open   |
| 39  | [#458](https://github.com/StormSale/StormSale/issues/458) | test(b2c): consumer feedback and verified purchase review submission tests               | `frontend`, `testing`, `b2c`, `ui`                | **Low**    | Open   |
| 40  | [#459](https://github.com/StormSale/StormSale/issues/459) | test(zk-proofs): client-side Merkle proof generator and tree validator test suite        | `frontend`, `testing`, `web3`                     | **High**   | Open   |
| 41  | [#460](https://github.com/StormSale/StormSale/issues/460) | test(zk-proofs): client-side ZK-SNARK proof verification for private allocations         | `frontend`, `testing`, `web3`, `security`         | **High**   | Open   |
| 42  | [#461](https://github.com/StormSale/StormSale/issues/461) | test(batch-sales): large-scale batch allocation chunking and packing test suite          | `frontend`, `testing`, `b2b`                      | **High**   | Open   |
| 43  | [#462](https://github.com/StormSale/StormSale/issues/462) | test(batch-sales): cryptographic signature validation of advertiser sale manifests       | `frontend`, `testing`, `security`, `auditor`      | **Medium** | Open   |
| 44  | [#463](https://github.com/StormSale/StormSale/issues/463) | test(batch-sales): IndexedDB offline batch draft storage and synchronization tests       | `frontend`, `testing`, `infra`                    | **Medium** | Open   |
| 45  | [#464](https://github.com/StormSale/StormSale/issues/464) | test(batch-sales): batch sale price curve and bonding curve math tests                   | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 46  | [#465](https://github.com/StormSale/StormSale/issues/465) | test(batch-sales): CSV export of batch execution receipts and proof hashes               | `frontend`, `testing`, `auditor`                  | **Low**    | Open   |
| 47  | [#466](https://github.com/StormSale/StormSale/issues/466) | test(batch-sales): multi-asset batch sale payment split calculations                     | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 48  | [#467](https://github.com/StormSale/StormSale/issues/467) | test(zk-proofs): zero-knowledge proof generation error recovery and UX feedback          | `frontend`, `testing`, `ui`                       | **Medium** | Open   |
| 49  | [#468](https://github.com/StormSale/StormSale/issues/468) | test(batch-sales): batch cancellation and escrow refund rollback tests                   | `frontend`, `testing`, `web3`                     | **Medium** | Open   |
| 50  | [#469](https://github.com/StormSale/StormSale/issues/469) | test(zk-proofs): Web Worker thread pooling for concurrent proof verification             | `frontend`, `testing`, `infra`                    | **High**   | Open   |
| 51  | [#470](https://github.com/StormSale/StormSale/issues/470) | test(batch-sales): audit trail Merkle root publication to Horizon test suite             | `frontend`, `testing`, `auditor`                  | **Medium** | Open   |
| 52  | [#471](https://github.com/StormSale/StormSale/issues/471) | test(fraud-defense): synthetic bot detection and headless browser flag test suite        | `frontend`, `testing`, `security`                 | **High**   | Open   |
| 53  | [#472](https://github.com/StormSale/StormSale/issues/472) | test(fraud-defense): client rate limiter and burst request backoff interceptor tests     | `frontend`, `testing`, `security`                 | **Medium** | Open   |
| 54  | [#473](https://github.com/StormSale/StormSale/issues/473) | test(fraud-defense): Sybil attack detection and restricted mode banner tests             | `frontend`, `testing`, `security`, `ui`           | **Medium** | Open   |
| 55  | [#474](https://github.com/StormSale/StormSale/issues/474) | test(fraud-defense): privacy-preserving canvas and audio fingerprint hash tests          | `frontend`, `testing`, `security`                 | **Medium** | Open   |
| 56  | [#475](https://github.com/StormSale/StormSale/issues/475) | test(fraud-defense): anti-tamper client analytics payload HMAC signature tests           | `frontend`, `testing`, `security`                 | **Medium** | Open   |
| 57  | [#476](https://github.com/StormSale/StormSale/issues/476) | test(fraud-defense): IP geo-fencing compliance and restricted jurisdiction modal tests   | `frontend`, `testing`, `security`, `ui`           | **Low**    | Open   |
| 58  | [#477](https://github.com/StormSale/StormSale/issues/477) | test(fraud-defense): proof-of-work client challenge modal for abnormal traffic           | `frontend`, `testing`, `security`, `ui`           | **High**   | Open   |
| 59  | [#478](https://github.com/StormSale/StormSale/issues/478) | test(fraud-defense): click hijacking and iframe embedding defense tests                  | `frontend`, `testing`, `security`                 | **Low**    | Open   |
| 60  | [#479](https://github.com/StormSale/StormSale/issues/479) | test(fraud-defense): rapid coupon enumeration and brute-force lockout tests              | `frontend`, `testing`, `b2c`, `security`          | **Low**    | Open   |
| 61  | [#480](https://github.com/StormSale/StormSale/issues/480) | test(fraud-defense): anomalous transaction volume threshold warning tests                | `frontend`, `testing`, `security`, `ui`           | **Low**    | Open   |
| 62  | [#481](https://github.com/StormSale/StormSale/issues/481) | test(fraud-defense): malicious referral redirect and open redirect protection tests      | `frontend`, `testing`, `security`                 | **Medium** | Open   |
| 63  | [#482](https://github.com/StormSale/StormSale/issues/482) | test(fraud-defense): telemetry event schema validation and error reporting tests         | `frontend`, `testing`, `infra`                    | **Low**    | Open   |
| 64  | [#483](https://github.com/StormSale/StormSale/issues/483) | test(e2e): complete Advertiser campaign creation wizard journey                          | `frontend`, `testing`, `advertiser`               | **High**   | Open   |
| 65  | [#484](https://github.com/StormSale/StormSale/issues/484) | test(e2e): complete Affiliate onboarding, link sharing and reward claim journey          | `frontend`, `testing`, `affiliate`                | **High**   | Open   |
| 66  | [#485](https://github.com/StormSale/StormSale/issues/485) | test(e2e): Auditor cryptographic evidence pack download and verification journey         | `frontend`, `testing`, `auditor`                  | **Medium** | Open   |
| 67  | [#486](https://github.com/StormSale/StormSale/issues/486) | test(e2e): multi-currency checkout journey with asset path payments (XLM, USDC, EURC)    | `frontend`, `testing`, `web3`                     | **High**   | Open   |
| 68  | [#487](https://github.com/StormSale/StormSale/issues/487) | test(e2e): session restore and active state recovery after browser reload                | `frontend`, `testing`                             | **Medium** | Open   |
| 69  | [#488](https://github.com/StormSale/StormSale/issues/488) | test(e2e): offline network recovery and transaction retry journey                        | `frontend`, `testing`                             | **Medium** | Open   |
| 70  | [#489](https://github.com/StormSale/StormSale/issues/489) | test(e2e): B2B enterprise multi-seat team member invitation and onboarding               | `frontend`, `testing`, `b2b`                      | **High**   | Open   |
| 71  | [#490](https://github.com/StormSale/StormSale/issues/490) | test(e2e): affiliate dispute resolution and mediation journey                            | `frontend`, `testing`, `affiliate`, `auditor`     | **Medium** | Open   |
| 72  | [#491](https://github.com/StormSale/StormSale/issues/491) | test(e2e): dark/light theme switching and visual regression baseline tests               | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 73  | [#492](https://github.com/StormSale/StormSale/issues/492) | test(e2e): responsive mobile viewport drawer navigation journey                          | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 74  | [#493](https://github.com/StormSale/StormSale/issues/493) | test(e2e): search, filter and pagination user journey in Marketplace                     | `frontend`, `testing`, `ui`                       | **Medium** | Open   |
| 75  | [#494](https://github.com/StormSale/StormSale/issues/494) | test(e2e): export and download compliance reports journey                                | `frontend`, `testing`, `auditor`                  | **Low**    | Open   |
| 76  | [#495](https://github.com/StormSale/StormSale/issues/495) | test(e2e): 404 not found and server error boundary recovery journey                      | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 77  | [#496](https://github.com/StormSale/StormSale/issues/496) | test(perf): IndexedDB campaign catalog caching and LRU eviction policy tests             | `frontend`, `testing`, `infra`                    | **Medium** | Open   |
| 78  | [#497](https://github.com/StormSale/StormSale/issues/497) | test(perf): virtualized table rendering tests for 50,000+ campaign and audit rows        | `frontend`, `testing`, `ui`                       | **High**   | Open   |
| 79  | [#498](https://github.com/StormSale/StormSale/issues/498) | test(perf): React component re-render stress tests during rapid Soroban events           | `frontend`, `testing`                             | **Medium** | Open   |
| 80  | [#499](https://github.com/StormSale/StormSale/issues/499) | test(perf): memory leak profiling on long-running WebSocket and polling hooks            | `frontend`, `testing`, `infra`                    | **High**   | Open   |
| 81  | [#500](https://github.com/StormSale/StormSale/issues/500) | test(perf): bundle size budget and dynamic code-splitting chunk audit                    | `frontend`, `testing`, `infra`                    | **Medium** | Open   |
| 82  | [#501](https://github.com/StormSale/StormSale/issues/501) | test(perf): image optimization, WebP fallback and responsive srcset tests                | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 83  | [#502](https://github.com/StormSale/StormSale/issues/502) | test(perf): Web Vitals metrics collector and performance threshold tests                 | `frontend`, `testing`, `infra`                    | **Low**    | Open   |
| 84  | [#503](https://github.com/StormSale/StormSale/issues/503) | test(perf): Service Worker offline asset caching and cache invalidation tests            | `frontend`, `testing`, `infra`                    | **Medium** | Open   |
| 85  | [#504](https://github.com/StormSale/StormSale/issues/504) | test(perf): HTTP/2 multiplexing and concurrent API request pipelining tests              | `frontend`, `testing`, `infra`                    | **Low**    | Open   |
| 86  | [#505](https://github.com/StormSale/StormSale/issues/505) | test(perf): cryptographic hashing performance benchmarks in Web Worker                   | `frontend`, `testing`                             | **Medium** | Open   |
| 87  | [#506](https://github.com/StormSale/StormSale/issues/506) | test(perf): client-side search indexing and fuzzy filter performance tests               | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 88  | [#507](https://github.com/StormSale/StormSale/issues/507) | test(perf): SVG and canvas chart animation frame rate performance tests                  | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 89  | [#508](https://github.com/StormSale/StormSale/issues/508) | test(security): strict Content Security Policy (CSP) compliance and zero-eval test suite | `frontend`, `testing`, `security`                 | **Medium** | Open   |
| 90  | [#509](https://github.com/StormSale/StormSale/issues/509) | test(security): user-generated HTML and Markdown XSS sanitization tests                  | `frontend`, `testing`, `security`                 | **Medium** | Open   |
| 91  | [#510](https://github.com/StormSale/StormSale/issues/510) | test(security): sensitive data zeroization and memory clearance test suite               | `frontend`, `testing`, `security`                 | **High**   | Open   |
| 92  | [#511](https://github.com/StormSale/StormSale/issues/511) | test(a11y): WCAG 2.1 AA keyboard navigation and focus trapping across modals             | `frontend`, `testing`, `ui`                       | **Medium** | Open   |
| 93  | [#512](https://github.com/StormSale/StormSale/issues/512) | test(a11y): screen reader ARIA live region announcements for transaction status          | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 94  | [#513](https://github.com/StormSale/StormSale/issues/513) | test(a11y): color contrast ratio compliance audit across dark and light modes            | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 95  | [#514](https://github.com/StormSale/StormSale/issues/514) | test(mobile): viewport meta tag, touch target sizing and safe area inset tests           | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 96  | [#515](https://github.com/StormSale/StormSale/issues/515) | test(cross-browser): Web Crypto API polyfill and Safari WebAssembly fallback tests       | `frontend`, `testing`                             | **Medium** | Open   |
| 97  | [#516](https://github.com/StormSale/StormSale/issues/516) | test(security): dependency supply chain integrity and lockfile audit tests               | `frontend`, `testing`, `security`, `infra`        | **High**   | Open   |
| 98  | [#517](https://github.com/StormSale/StormSale/issues/517) | test(security): LocalStorage and SessionStorage quota and tamper detection tests         | `frontend`, `testing`, `security`                 | **Medium** | Open   |
| 99  | [#518](https://github.com/StormSale/StormSale/issues/518) | test(a11y): screen reader table semantics and header association tests                   | `frontend`, `testing`, `ui`                       | **Low**    | Open   |
| 100 | [#519](https://github.com/StormSale/StormSale/issues/519) | test(cross-browser): clipboard API permissions and fallback copy execution tests         | `frontend`, `testing`, `ui`                       | **Low**    | Open   |

---

## 🛠️ Validation & Execution Commands

Run the test suites locally using the following scripts:

```bash
# Run all unit and integration test suites
npm test

# Run targeted Web3 wallet connector tests
npm test src/tests/web3-wallet-connector.test.ts

# Run CSP and malware defense compliance suites
npm test src/tests/csp.test.ts src/tests/malware-defense.test.ts

# Run End-to-End user journeys via Playwright
npm run test:e2e

# Production build verification
npm run build
```
