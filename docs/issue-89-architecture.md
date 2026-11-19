# Issue #89: Mock Web3 Connection Logic & Chain-Switch Architecture

## 1. Architectural Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Test Suite
    participant UI as Web3Provider (Web3Context)
    participant Engine as Multi-Wallet Provider Adapter
    participant Sanctions as Sanction Screening (assertNotSanctioned)
    participant Storage as Encrypted Storage (purgeOnLogout)
    participant Network as Network & RPC Fallback Manager

    Note over User,UI: 1. Connection Lifecycle
    User->>UI: connectWallet(connectorType, customAddress?)
    alt Connector is Mock
        UI->>UI: Set mock demo address (GASTORMSALE7...) & 10,000 XLM
        UI->>UI: Set network = "TESTNET" & isStellarNetwork = true
    else Connector is External (Freighter / Albedo / xBull / Ledger / Passkey)
        UI->>Engine: Connect via provider SDK / bridge
        Engine-->>UI: Return public key & active network
    end

    UI->>Sanctions: assertNotSanctioned(address, "wallet-connect")
    alt Address is Flagged
        Sanctions-->>UI: Throw Sanction Violation Error
        UI-->>User: Abort Connection & Clear Credentials
    else Address Approved
        UI->>UI: Set isConnected = true, update balances & sync backend
        UI-->>User: Connection Established
    end

    Note over User,Network: 2. Chain-Switch & RPC Failover
    User->>UI: switchToStellarNetwork()
    UI->>Network: Set network to TESTNET & verify RPC health
    Network-->>UI: isStellarNetwork = true
    User->>Network: simulateRpcFailover(reason)
    Network->>Network: Rotate active endpoint & log failover event
    Network-->>UI: Update activeRpcEndpoint & history

    Note over User,Storage: 3. Disconnection & State Purge
    User->>UI: disconnectWallet()
    UI->>UI: Reset userAddress, role, balances, and multiSig state
    UI->>Storage: purgeOnLogout() (Wipes encrypted cache & local session residue)
    Storage-->>UI: Dispatch stormsale:security-logout-purged
    UI-->>User: Disconnected & Cache Fully Purged
```

## 2. Component Structure Overview

```mermaid
flowchart TD
    subgraph Web3Context ["Web3Context & Provider"]
        A["Web3Provider"] --> B["State: userAddress, isConnected, network, xlmBalance"]
        A --> C["Connectors: mock, freighter, albedo, xbull, ledger, passkey, readonly"]
        A --> D["Chain-Switch: switchToStellarNetwork(), checkStellarNetwork()"]
        A --> E["RPC Fallback: switchRpcEndpoint(), simulateRpcFailover()"]
    end

    subgraph Adapters ["Simulated & On-Chain Adapters"]
        C --> M["Mock Provider (Demo 10,000 XLM)"]
        C --> F["Freighter / Albedo / xBull SDKs"]
        C --> L["Ledger Bridge (BIP-44 Derivation)"]
        C --> P["Passkey Signer (WebAuthn / PRF)"]
    end

    subgraph Security ["Security & Persistence Guards"]
        B --> S["Sanctions Enforcement (OFAC / Risk)"]
        B --> K["Encrypted Cache Purge (purgeOnLogout)"]
        D --> N["Stellar Horizon & Soroban RPC Nodes"]
    end
```

## 3. System Architecture & Testing Coverage

1. **Mock Connection & Zero-Dependency Simulation:**
   - Provides deterministic testnet demo accounts (`GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777`) initialized with 10,000 XLM for instantaneous integration testing without live testnet faucet rate limits.
   - Allows testing of simulated token allowance approval (`approveTokenAllowance`) and escrow top-ups in isolated sandbox environments.

2. **Full Multi-Wallet Connector Coverage:**
   - Covers all supported wallet connector modes (`freighter`, `albedo`, `xbull`, `ledger`, `passkey`, `readonly`, `mock`).
   - Simulates hardware Ledger BIP derivation path modifications (`44'/148'/0'`).
   - Validates proper exception handling when extensions are absent or addresses are missing/sanctioned.

3. **Chain-Switch Logic & Network Validation:**
   - Evaluates `isStellarNetwork` against `TESTNET` and `PUBLIC` network identifiers.
   - Provides `switchToStellarNetwork()` to return the frontend to the correct target network.
   - Tests Horizon connectivity checks and explorer deep-linking utilities.

4. **Resilient RPC Failover:**
   - Verifies seamless failover transitions between primary Soroban RPC endpoints, backup enterprise nodes, and custom developer endpoints.
   - Confirms real-time event recording in `rpcFailoverHistory`.

5. **Security Logout & Storage Purge:**
   - Guarantees that `disconnectWallet()` wipes active connection context, nullifies multisig authorizations, and invokes `purgeOnLogout()` to eliminate encrypted local cache residue.
