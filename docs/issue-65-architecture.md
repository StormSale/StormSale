# Issue #65: Contract Integrity Verification UI Architecture

## 1. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Auditor as User / Auditor
    participant Header as Header (UI Indicator)
    participant Engine as contractIntegrity Engine
    participant Registry as Authoritative Registry (VERIFIED_CONTRACT_REGISTRY)
    participant Modal as ContractIntegrityModal

    Note over Header,Engine: 1. Automated Initialization & Integrity Verification
    Header->>Engine: checkContractIntegrity(undefined, network)
    Engine->>Registry: getExpectedContractAddress(network)
    Registry-->>Engine: Authoritative Contract Address
    alt Configured Address matches Authoritative Address
        Engine-->>Header: { status: 'verified', isVerified: true }
        Header->>Header: Render green "Verified" Contract Indicator
    else Configured Address != Authoritative Address (Mismatch)
        Engine-->>Header: { status: 'mismatch', isVerified: false, reason }
        Header->>Header: Render red/amber pulsating "Mismatch" Indicator
        Header->>Modal: Auto-open Contract Integrity Warning Modal
    end

    Note over Auditor,Modal: 2. Auditor Interaction & Warning Modal
    Auditor->>Header: Click "Verified" or "Mismatch" Indicator
    Header->>Modal: Open ContractIntegrityModal
    Modal-->>Auditor: Display Configured vs Expected Comparison & Security Alert

    Note over Auditor,Engine: 3. Remediation & Restore
    alt User clicks "Reset to Verified Address"
        Auditor->>Modal: Click "Reset to Verified Address"
        Modal->>Engine: setContractAddressOverride(null)
        Engine->>Header: Notify subscribers of verified state
        Header->>Header: Restore green "Verified" status
        Modal-->>Auditor: Close modal
    end
```

## 2. Component Flowchart

```mermaid
flowchart TD
    A["Application Mount / Network Switch"] --> B["checkContractIntegrity()"]
    B --> C{"Format Valid?<br/>(C... 56 chars)"}
    C -- No --> D["Status: invalid_format"]
    C -- Yes --> E{"Matches Authoritative<br/>Registry?"}
    E -- Yes --> F["Status: verified"]
    E -- No --> G["Status: mismatch"]

    F --> H["Header: Green 'Verified' Badge"]
    G --> I["Header: Pulsating 'Mismatch' Badge"]
    D --> I

    I --> J["Auto-Trigger ContractIntegrityModal"]
    H --> K["User Clicks Indicator"]
    K --> L["Inspect Contract Audit & Explorer Link"]
    J --> M["Security Warning & Address Comparison"]
    M --> N["Reset to Authoritative Address"]
    N --> F
```

## 3. System Architecture & Safety Guarantees

1. **Automated Verification Guard:**
   - Evaluates active runtime contract addresses against authoritative hardcoded constants (`VERIFIED_CONTRACT_REGISTRY`) per network (`TESTNET`, `PUBLIC`).
   - Ensures strict 56-character RFC 4648 Base32 contract key validation (`C...`).

2. **Visual Feedback in Header:**
   - **Verified State:** Sleek, unobtrusive emerald pill with `ShieldCheck` icon, displaying `"Verified"` and verified address tooltip.
   - **Mismatch State:** High-visibility rose pulsating badge with `ShieldAlert` icon, displaying `"Mismatch"` to immediately flag potential address spoofing or rogue escrow deployments.

3. **Interactive Warning Modal:**
   - Displays side-by-side comparison between the runtime configured address and the authoritative registry.
   - Provides 1-click clipboard copy for both addresses and direct deep-linking to the Stellar Expert block explorer.
   - Includes a 1-click `"Reset to Verified Address"` action to instantly restore the authoritative contract address.
