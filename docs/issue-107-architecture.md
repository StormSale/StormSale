# Issue #107: Automated Escrow Top-Up Logic

## Architectural Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Advertiser as Advertiser (UI)
    participant Monitor as AutoTopUp Engine (escrowTopUp.ts)
    participant Storage as Browser localStorage
    participant Context as Web3Context
    participant Soroban as Stellar Soroban Contract

    Note over Advertiser,Monitor: 1. Configuration & Threshold Setup
    Advertiser->>Monitor: Save Auto-Refill Config (Threshold %/XLM, Refill Amount, Safety Caps)
    Monitor->>Storage: Persist AutoTopUpConfig per campaign
    
    Note over Monitor,Context: 2. Trigger-Based Balance Evaluation
    Monitor->>Monitor: evaluateAutoTopUpTrigger(campaign, config, currentAllowance)
    alt Balance <= Threshold AND Top-Up Enabled
        Monitor->>Context: Check Pre-Authorized Allowance (tokenAllowance)
        alt Allowance < Top-Up Deposit Amount (Deficit)
            Context-->>Advertiser: Low Allowance Alert / Request Approval Modal
            Advertiser->>Soroban: approveTokenContractCall(allowanceDeposit)
            Soroban-->>Context: Allowance Updated
        end
        Note over Monitor,Soroban: 3. Execution of Escrow Top-Up
        Monitor->>Context: topUpCampaignEscrow(campaignId, topUpAmount)
        Context->>Soroban: top_up_escrow(advertiser, campaignId, amount)
        Soroban-->>Context: Escrow Balance Increased & Transaction Hash
        Context-->>Advertiser: Notification Banner & Real-time Progress Bar Updated
    else Balance > Threshold
        Monitor-->>Advertiser: Escrow Healthy (No Action Needed)
    end
```

## System Architecture Overview

1. **User-Defined Trigger Thresholds:**
   - Supports both `percentage` of max budget (e.g., refill when escrow drops below 10%–25%) and `fixed` token amounts (e.g., refill when balance drops below 500 XLM).
   - Allows setting configurable `topUpAmount` and daily refill limits (`maxTopUpsPerDay`).

2. **Pre-Authorized Allowance Handling:**
   - Inspects the advertiser's on-chain Soroban token allowance before triggering transactions.
   - If an allowance deficit exists (`allowance < topUpAmount`), the engine prevents failed transactions and prompts 1-click token pre-authorization via `approveTokenContractCall`.

3. **Autonomous Top-Up Execution:**
   - Invokes `top_up_escrow` on the Soroban escrow contract or local simulator.
   - Syncs real-time state with `Web3Context` and updates UI indicators, progress bars, and toast notifications.
