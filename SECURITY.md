# Security Policy

## 🛡 Overview

The StormSale security and core engineering teams take the security of our decentralized affiliate platform, web application, and user assets with utmost seriousness. This document outlines our security practices, supported versions, threat model, and the process for responsibly reporting vulnerabilities.

---

## 📦 Supported Versions

We actively maintain and provide security patches for the following versions of the StormSale web client:

| Version | Supported          | Status                                  |
| :------ | :----------------- | :-------------------------------------- |
| 1.0.x   | :white_check_mark: | Currently supported (Active production) |
| < 1.0.0 | :x:                | Deprecated / End-of-Life                |

---

## 🔒 Threat Model & Web3 Security Architecture

StormSale implements defense-in-depth principles specifically tailored for decentralized finance and Web3 applications:

### 1. Zero Private Key Storage & Client Isolation

- **Non-Custodial Architecture**: StormSale never prompts for, accesses, stores, or transmits users' private keys, recovery seed phrases, or wallet mnemonics.
- **Hardware & Extension Isolation**: All transaction signing is delegated strictly to authorized Stellar wallet extensions or Web protocols ([Freighter](https://www.freighter.app/), [Albedo](https://albedo.link/), [xBull](https://xbull.app/)). Private keys never leave the secure boundary of the user's wallet software.

### 2. Transaction Construction Integrity

- Before invoking wallet signature prompts, the client-side transaction builder validates:
  - Caller address format (strictly 56-character base32 Stellar public keys `G...`).
  - Commission bounds ($1\%$ to $50\%$).
  - Clearing periods and budget caps.
  - Target Soroban contract address validity.

### 3. RPC & Network Endpoint Integrity

- The client communicates only with verified Soroban RPC and Stellar Horizon endpoints (defaulting to official SDF infrastructure).
- Network passphrases (`Test SDF Network ; September 2015` or `Public Global Stellar Network ; September 2015`) are explicitly enforced to prevent cross-network transaction replay attacks.

### 4. Cross-Site Scripting (XSS) & Content Security

- User-supplied inputs (campaign titles, descriptions, referral tags) are sanitized before rendering.
- Modern React JSX escaping is strictly enforced to neutralize DOM-based injection vectors.

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability or suspect a potential security flaw in the StormSale frontend, please report it immediately through **coordinated responsible disclosure**.

### ⚠️ Critical Rule: Do NOT Disclose Publicly

**Please do NOT open public GitHub issues, discussions, or pull requests for undisclosed vulnerabilities.** Public disclosure exposes users and assets before a fix can be prepared and deployed.

### 📬 How to Report

- **Primary Security Email**: `security@stormsale.io`
- **Secondary / Direct Contact**: `abujulaybeeb08@gmail.com`
- **Encrypted Communication (PGP)**: Available upon request via email.
- **GitHub Private Vulnerability Reporting**: You may submit a private advisory directly via the **Security** tab of this repository on GitHub.

### 📋 What to Include in Your Submission

To help us triage and resolve your report quickly, please include:

1. **Title**: Clear summary of the vulnerability.
2. **Severity**: Your assessment of the impact (Critical, High, Medium, Low).
3. **Affected Component**: Affected route, component, utility, or wallet integration.
4. **Step-by-Step Reproduction**: Detailed steps, proof-of-concept (PoC) code, or browser console traces.
5. **Impact Analysis**: What an attacker could achieve (e.g., unauthorized transaction prompt, phishing vector, UI spoofing).
6. **Suggested Remediation**: Recommended patch or code fix (optional but appreciated).

---

## ⏱️ Response Timelines & SLA

We are committed to rapid response and coordinated resolution:

| Milestone                  | Target SLA                | Description                                                                 |
| :------------------------- | :------------------------ | :-------------------------------------------------------------------------- |
| **Initial Acknowledgment** | **Within 24 hours**       | Confirmation of receipt and assignment of a lead security engineer.         |
| **Triage & Validation**    | **Within 72 hours**       | Initial assessment and severity determination.                              |
| **Status Updates**         | **Every 3 business days** | Progress updates while a remediation is developed and tested.               |
| **Public Disclosure**      | **Coordinated**           | Public disclosure occurs only after the fix has been deployed and verified. |

---

## ⚖️ Vulnerability Severity Classification

| Severity     | Definition & Examples                                                                                                                                       |
| :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | Phishing bypass leading to unintended wallet drain; arbitrary client-side code execution altering recipient addresses in transaction XDRs.                  |
| **High**     | Circumvention of client-side validation leading to failed transactions with loss of user gas fees; persistent cross-site scripting (XSS) on campaign pages. |
| **Medium**   | Denial of service (DoS) in local storage; client-side cryptographic hashing mismatches; leakage of non-sensitive analytics data.                            |
| **Low**      | Minor UI spoofing without financial risk; outdated non-exploitable dependencies in development tooling.                                                     |

---

## 🤝 Safe Harbor Policy

We consider security research conducted under this policy to be authorized. We will not pursue legal action against researchers who:

- Act in good faith to avoid privacy violations, destruction of data, and interruption or degradation of StormSale services.
- Keep vulnerability details confidential until an official patch has been deployed and released.
- Do not exploit a vulnerability beyond what is strictly necessary to demonstrate a proof of concept.
- Give us reasonable time to remediate the vulnerability before public disclosure.
