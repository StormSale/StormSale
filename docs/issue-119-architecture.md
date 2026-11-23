# Architecture: Automated SAC Token Allowance Delegation & TTL Extension (#119)

## Overview

This document specifies the architectural implementation of **Automated Soroban Asset Contract (SAC) Token Allowance Delegation & Storage TTL Extension** for StormSale. This ensures that advertiser USDC/EURC stablecoin escrows are never disrupted by exhausted token spending allowances or archived due to expiring state rent.

---

## Architectural Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Advertiser
    participant Dashboard as Advertiser Dashboard / CampaignsList
    participant EscrowEngine as Escrow & Allowance Engine (escrowTopUp.ts)
    participant TTLEngine as Soroban State Rent Engine (contractTTL.ts)
    participant SAC as Soroban Asset Contract (USDC/EURC)
    participant RPC as Soroban RPC Server

    rect rgb(240, 248, 255)
        Note over Advertiser,EscrowEngine: Automated SAC Allowance Delegation Flow
        Advertiser->>Dashboard: Trigger Campaign Escrow Top-Up (or Auto-Trigger)
        Dashboard->>EscrowEngine: executeEscrowTopUpWithAllowanceCheck(amount, assetCode)
        EscrowEngine->>SAC: Query current allowance for advertiser
        alt Allowance < Required Top-Up Amount
            EscrowEngine->>RPC: simulateTransaction(SAC.approve)
            RPC-->>EscrowEngine: Return simulation resource fee & validity
            EscrowEngine->>SAC: approve(owner, spender=EscrowContract, amount, expirationLedger)
            SAC-->>EscrowEngine: Allowance approved on-chain
        end
        EscrowEngine->>RPC: invokeSorobanMethod(top_up_escrow)
        RPC-->>Dashboard: Escrow successfully topped up
    end

    rect rgb(255, 248, 240)
        Note over Dashboard,TTLEngine: State TTL Countdown & Automated Extension Flow
        Dashboard->>TTLEngine: fetchContractInstanceTTL(contractAddress)
        TTLEngine->>RPC: getLedgerEntries(contractFootprint)
        RPC-->>TTLEngine: liveUntilLedgerSeq & latestLedger
        TTLEngine->>Dashboard: Return ContractTTLInfo (remainingLedgers, status)
        
        alt remainingLedgers < 50,000 (Warning) or < 10,000 (Critical)
            Dashboard->>Advertiser: Render Visual Countdown & Warning Alert
            Advertiser->>TTLEngine: 1-Click Extend (or checkAndAutoExtendTTL)
            TTLEngine->>RPC: simulateTransaction(extendFootprintTtl)
            RPC-->>Dashboard: Render simulation feedback (Estimated Fee, Footprint)
            TTLEngine->>RPC: extendFootprintTtl(extendTo=500,000 ledgers)
            RPC-->>Dashboard: State rent extended by 500k ledgers (~28.9 days)
        end
    end
```

---

## Core Components

### 1. Automated SAC Token Allowance Delegation (`escrowTopUp.ts`)
- **Allowance Pre-Verification**: Evaluates `currentAllowance` against the requested top-up amount for native XLM and Circle SAC tokens (USDC, EURC).
- **Automated Delegation**: When a deficit exists and automated approval is permitted, invokes `approveTokenContractCall` for the deficit amount with Soroban simulation and sequence expiration offset.
- **Simulation Feedback**: Yields `simulationFeedback` metrics confirming resource fees and on-chain pre-conditions before executing `top_up_escrow`.

### 2. Soroban State Rent & TTL Engine (`contractTTL.ts`)
- **TTL Health Classifier**: Categorizes contracts into `healthy` (>= 50,000 ledgers), `warning` (< 50,000 ledgers), `critical` (< 10,000 ledgers), and `archived` (<= 0 ledgers).
- **Simulation Feedback (`simulateExtendContractTTL`)**: Runs non-mutating `simulateTransaction` on `Operation.extendFootprintTtl` to provide accurate resource fee estimates to the user.
- **Automated Extension Trigger (`checkAndAutoExtendTTL`)**: Evaluates storage TTL against `WARNING_TTL_THRESHOLD_LEDGERS` (50,000 ledgers) and automatically triggers an extension transaction if remaining lifetime is low.

### 3. UI Visual Health Indicator & Restorer (`ContractTTLRestorer.tsx` & `ContractTTLBadge.tsx`)
- Displays real-time ledger countdown and human-readable time remaining (e.g. `42,000 ledgers (~2d 10h)`).
- Renders an actionable warning banner whenever TTL dips below 50,000 ledgers.
- Provides 1-click extension controls (+100k, +250k, +500k ledgers) with live simulation feedback.
