export type TerminologyCategory = "stellar" | "smart-contracts" | "security" | "affiliate" | "defi";

export interface TerminologyItem {
  id: string;
  term: string;
  aliases: string[];
  category: TerminologyCategory;
  shortDefinition: string;
  fullDefinition: string;
  learnMoreUrl?: string;
  examples?: string[];
}

export const TERMINOLOGY_CATEGORIES: Record<
  TerminologyCategory,
  { label: string; description: string }
> = {
  stellar: {
    label: "Stellar Network",
    description: "Core primitives and native assets powering the Stellar ecosystem.",
  },
  "smart-contracts": {
    label: "Smart Contracts",
    description: "Soroban-based contract logic, state management, and escrow mechanisms.",
  },
  security: {
    label: "Security & Audits",
    description: "Cryptographic signers, hardware bridges, and SOC 2 compliance verification.",
  },
  affiliate: {
    label: "Affiliate & Attribution",
    description: "Commission structures, conversion tracking, and automated payout flows.",
  },
  defi: {
    label: "DeFi & Settlement",
    description: "Decentralized liquidity, slippage tolerance, and atomic asset swaps.",
  },
};

export const TERMINOLOGY_DICTIONARY: Record<string, TerminologyItem> = {
  xlm: {
    id: "xlm",
    term: "Stellar Lumens (XLM)",
    aliases: ["xlm", "lumen", "lumens", "native asset"],
    category: "stellar",
    shortDefinition:
      "The native utility cryptocurrency of Stellar, used for transaction gas fees and account reserve requirements.",
    fullDefinition:
      "Stellar Lumens (XLM) are the native token of the Stellar blockchain. Lumens are required to pay transaction fees (typically fractions of a cent) and to meet the minimum balance reserves required for holding accounts and trustlines.",
    learnMoreUrl: "https://developers.stellar.org/docs/fundamentals-and-concepts/lumens",
    examples: ["Paying transaction fees", "Base reserve staking", "Direct peer-to-peer settlement"],
  },
  soroban: {
    id: "soroban",
    term: "Soroban Smart Contracts",
    aliases: ["soroban", "wasm contract", "stellar contracts", "smart contract"],
    category: "smart-contracts",
    shortDefinition:
      "Stellar's high-performance WebAssembly (Wasm) smart contract execution platform designed for speed and predictable fees.",
    fullDefinition:
      "Soroban is the developer-friendly, high-performance smart contract engine built natively into the Stellar protocol. It runs compiled WebAssembly bytecodes, supports state archival, and offers predictable resource metering for enterprise applications.",
    learnMoreUrl: "https://soroban.stellar.org/docs",
    examples: [
      "Escrow automation",
      "Multi-tier affiliate commission disbursement",
      "Token routing",
    ],
  },
  escrow: {
    id: "escrow",
    term: "Escrow Contract",
    aliases: ["escrow", "campaign escrow", "locked funds", "escrow pool"],
    category: "smart-contracts",
    shortDefinition:
      "A non-custodial Soroban contract that holds advertiser campaign deposits and releases commission payouts once clearing conditions are met.",
    fullDefinition:
      "The StormSale Escrow Contract guarantees safe settlement between advertisers and marketers. Funds are locked into an automated on-chain escrow upon campaign initialization, eliminating advertiser default risk and ensuring marketers are reliably compensated upon verified conversion clearing.",
    learnMoreUrl: "https://developers.stellar.org/docs/learn/smart-contract-internals",
    examples: ["Campaign funding buffer", "Automatic affiliate claim settlement"],
  },
  clearing_period: {
    id: "clearing_period",
    term: "Clearing Period",
    aliases: ["clearing period", "clearing", "lockup duration", "settlement delay"],
    category: "affiliate",
    shortDefinition:
      "The designated quarantine duration before recorded affiliate commissions transition from pending to withdrawable.",
    fullDefinition:
      "A configurable verification window (measured in seconds or blocks) designed to protect advertisers against transaction reversals, refunds, chargebacks, or fraudulent clicks. Once the clearing period expires without disputes, affiliates can immediately claim payouts.",
    examples: ["7-day refund hold", "14-day subscription trial buffer"],
  },
  commission_rate: {
    id: "commission_rate",
    term: "Commission Rate",
    aliases: ["commission", "commission rate", "payout rate", "affiliate reward"],
    category: "affiliate",
    shortDefinition:
      "The predefined percentage or fixed bounty allocated to affiliates for generating verified customer acquisitions.",
    fullDefinition:
      "The agreed compensation model coded into the campaign contract. Advertisers define the commission percentage or flat XLM fee that is mathematically split and escrowed when an attributed purchase transaction is recorded.",
    examples: ["15% revenue share", "50 XLM CPA per signup"],
  },
  allowance: {
    id: "allowance",
    term: "Token Allowance",
    aliases: ["allowance", "token approval", "token allowance", "spender permission"],
    category: "smart-contracts",
    shortDefinition:
      "The on-chain authorization granting the escrow smart contract permission to debit a specific token quota from the advertiser's wallet.",
    fullDefinition:
      "Following the SEP-41 token standard, advertisers must approve an allowance before the campaign contract can draw down funds to establish the escrow pool. This ensures non-custodial wallet security without granting open-ended access to total balances.",
    examples: ["Approving 1,000 XLM for Campaign #4", "Revoking spender allowance"],
  },
  passkey: {
    id: "passkey",
    term: "Passkey Signer (WebAuthn)",
    aliases: ["passkey", "webauthn", "biometric signing", "fido2"],
    category: "security",
    shortDefinition:
      "Biometric and hardware device authentication standard enabling non-custodial transaction signing without seed phrases.",
    fullDefinition:
      "WebAuthn passkeys allow users to sign Stellar and Soroban transactions using Face ID, Touch ID, or Windows Hello. Public keys are registered on-chain via smart account signers, eliminating the risks of seed phrase loss or phishing.",
    learnMoreUrl: "https://developers.stellar.org/docs/build/smart-contracts/wallets/passkeys",
    examples: ["One-touch TouchID claim approval", "Hardware-backed key derivation"],
  },
  merkle_proof: {
    id: "merkle_proof",
    term: "Merkle Proof / Batch Claim",
    aliases: ["merkle proof", "merkle tree", "batch claim", "cryptographic proof"],
    category: "security",
    shortDefinition:
      "A cryptographic tree structure enabling thousands of affiliate payout claims to be settled in a single verifiable transaction.",
    fullDefinition:
      "Merkle trees hash thousands of individual sales and commissions into a single 32-byte root recorded on Stellar. Affiliates present a lightweight Merkle proof to claim their share, minimizing on-chain gas costs by over 90%.",
    examples: ["Claiming 100 campaign payouts in 1 transaction", "Root integrity validation"],
  },
  soc2: {
    id: "soc2",
    term: "SOC 2 Type II Evidence",
    aliases: ["soc 2", "soc2", "audit evidence", "compliance pack"],
    category: "security",
    shortDefinition:
      "Cryptographically signed audit trail proving strict adherence to enterprise security, confidentiality, and integrity controls.",
    fullDefinition:
      "StormSale packages on-chain transaction hashes, role-based access events, and cryptographic signatures into verifiable compliance archives adhering to AICPA SOC 2 Type II trust services criteria.",
    examples: ["Exporting quarterly compliance archive", "Audit hash verification"],
  },
  ledger_bridge: {
    id: "ledger_bridge",
    term: "Ledger Hardware Bridge",
    aliases: ["ledger", "hardware wallet", "webhid", "ledger bridge"],
    category: "security",
    shortDefinition:
      "Direct browser-to-hardware communication channel via WebHID for signing transactions in cold storage.",
    fullDefinition:
      "The Ledger bridge provides direct integration with physical hardware devices (Ledger Nano S/X/Plus) via the WebHID API, guaranteeing that private keys never enter memory on the host computer.",
    examples: ["Cold-storage advertiser funding", "High-value auditor verification"],
  },
  walletconnect: {
    id: "walletconnect",
    term: "WalletConnect",
    aliases: ["walletconnect", "wc", "mobile wallet link"],
    category: "stellar",
    shortDefinition:
      "An open standard bridging desktop decentralized applications with mobile crypto wallets through encrypted QR relays.",
    fullDefinition:
      "WalletConnect establishes an encrypted peer-to-peer session between the StormSale dApp and mobile Stellar wallets (such as LOBSTR or xBull). Transactions are approved directly on the user's mobile device.",
    learnMoreUrl: "https://walletconnect.com",
    examples: ["Scanning QR code from mobile wallet", "Cross-device session persistence"],
  },
  slippage: {
    id: "slippage",
    term: "Slippage Tolerance",
    aliases: ["slippage", "price impact", "slippage tolerance"],
    category: "defi",
    shortDefinition:
      "The maximum permissible percentage deviation between an order's expected price and its final execution price on-chain.",
    fullDefinition:
      "In decentralized liquidity pools, price movements occurring between transaction broadcasting and block confirmation can cause price shifts. A slippage tolerance safeguards users by aborting transactions if the final rate exceeds the preset bound.",
    examples: ["0.5% default tolerance for stable conversions", "High-volatility trade guard"],
  },
  gas_fee: {
    id: "gas_fee",
    term: "Transaction / Gas Fee",
    aliases: ["gas", "gas fee", "transaction fee", "base fee", "resource fee"],
    category: "stellar",
    shortDefinition:
      "The nominal micro-fee paid to network validators to process, meter, and sequence an on-chain transaction.",
    fullDefinition:
      "Stellar transactions incur minimal fees measured in stroops (0.00001 XLM). For Soroban smart contracts, resource fees cover CPU instructions, memory allocation, and ledger read/write storage bytes.",
    learnMoreUrl: "https://developers.stellar.org/docs/fundamentals-and-concepts/fees-and-metering",
    examples: ["100 stroop network fee", "Soroban contract execution footprint"],
  },
  stroop: {
    id: "stroop",
    term: "Stroop",
    aliases: ["stroop", "stroops", "micro-xlm"],
    category: "stellar",
    shortDefinition:
      "The smallest unit of a Stellar Lumen, equal to 0.0000001 XLM (one ten-millionth of a Lumen).",
    fullDefinition:
      "Analogous to a satoshi on Bitcoin, 1 XLM equals 10,000,000 stroops. All base ledger calculations and fee bids on Stellar are mathematically executed in stroops to eliminate floating-point rounding errors.",
    examples: ["100 stroops base fee", "1 XLM = 10,000,000 stroops"],
  },
  multisig: {
    id: "multisig",
    term: "Multi-Signature (Multi-Sig)",
    aliases: ["multisig", "multi-sig", "multisignature", "threshold signing"],
    category: "security",
    shortDefinition:
      "A security authorization scheme requiring signatures from multiple distinct cryptographic keys before an operation executes.",
    fullDefinition:
      "Stellar native multi-sig allows accounts to set customizable signer weights and thresholds (low, medium, high). Enterprise campaigns and auditor actions utilize multi-sig to prevent single-point-of-failure compromise.",
    learnMoreUrl: "https://developers.stellar.org/docs/fundamentals-and-concepts/multisig",
    examples: ["2-of-3 board member escrow release", "High-threshold admin transfers"],
  },
  trustline: {
    id: "trustline",
    term: "Stellar Trustline",
    aliases: ["trustline", "asset trust", "trust line"],
    category: "stellar",
    shortDefinition:
      "An explicit account authorization consenting to hold a specific non-native asset or stablecoin (e.g., USDC, EURC).",
    fullDefinition:
      "On Stellar, accounts cannot be spammed with arbitrary tokens. An account must establish a trustline to an issuing anchor, locking a 0.5 XLM base reserve to signal acceptance of that token asset.",
    learnMoreUrl: "https://developers.stellar.org/docs/fundamentals-and-concepts/trustlines",
    examples: ["USDC trustline setup", "Asset balance boundary"],
  },
  webhook: {
    id: "webhook",
    term: "HMAC Signed Webhook",
    aliases: ["webhook", "conversion webhook", "hmac webhook", "event webhook"],
    category: "affiliate",
    shortDefinition:
      "A cryptographically hashed HTTP notification dispatched when off-chain customer conversions occur.",
    fullDefinition:
      "Advertisers' e-commerce backends dispatch signed HMAC-SHA256 payloads to the StormSale relay when checkouts occur. The signature authenticates that the event originated from a trusted merchant without tampering.",
    examples: ["Shopify order payment trigger", "SaaS subscription renewal webhook"],
  },
  non_custodial: {
    id: "non_custodial",
    term: "Non-Custodial Architecture",
    aliases: ["non-custodial", "self-custody", "trustless"],
    category: "security",
    shortDefinition:
      "Design principle ensuring that users retain complete cryptographic control over their private keys and deposited assets.",
    fullDefinition:
      "StormSale operates on 100% self-custody principles. At no point does StormSale or any intermediate operator hold private keys or arbitrary withdrawal powers over user balances or campaign escrows.",
    examples: ["Direct client-side transaction signing", "Smart contract autonomous enforcement"],
  },
};

/**
 * Normalizes query string for case-insensitive and punctuation-tolerant matching.
 */
function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[-_\s]+/g, " ");
}

/**
 * Retrieve a terminology item by key, term name, or alias.
 */
export function getTerminologyItem(query: string): TerminologyItem | undefined {
  if (!query) return undefined;
  const clean = normalizeKey(query);

  // Direct ID check
  if (TERMINOLOGY_DICTIONARY[clean]) {
    return TERMINOLOGY_DICTIONARY[clean];
  }

  // Exact or alias match
  for (const item of Object.values(TERMINOLOGY_DICTIONARY)) {
    if (normalizeKey(item.id) === clean) return item;
    if (normalizeKey(item.term) === clean) return item;
    if (item.aliases.some((alias) => normalizeKey(alias) === clean)) {
      return item;
    }
  }

  // Partial / substring match on ID or term
  for (const item of Object.values(TERMINOLOGY_DICTIONARY)) {
    if (normalizeKey(item.id).includes(clean) || clean.includes(normalizeKey(item.id))) {
      return item;
    }
    if (normalizeKey(item.term).includes(clean) || clean.includes(normalizeKey(item.term))) {
      return item;
    }
  }

  return undefined;
}

/**
 * Returns all terminology items sorted alphabetically by term.
 */
export function getAllTerminology(): TerminologyItem[] {
  return Object.values(TERMINOLOGY_DICTIONARY).sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * Filter terminology items by category.
 */
export function getTerminologyByCategory(category: TerminologyCategory): TerminologyItem[] {
  return getAllTerminology().filter((item) => item.category === category);
}

/**
 * Search terminology items matching a free-text search query across term, aliases, and definitions.
 */
export function searchTerminology(query: string): TerminologyItem[] {
  if (!query || !query.trim()) {
    return getAllTerminology();
  }
  const clean = normalizeKey(query);
  return getAllTerminology().filter((item) => {
    return (
      normalizeKey(item.term).includes(clean) ||
      normalizeKey(item.shortDefinition).includes(clean) ||
      normalizeKey(item.fullDefinition).includes(clean) ||
      item.aliases.some((alias) => normalizeKey(alias).includes(clean))
    );
  });
}
