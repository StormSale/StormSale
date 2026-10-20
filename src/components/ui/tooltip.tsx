import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { HelpCircle, ExternalLink, BookOpen } from "lucide-react";
import { cn } from "../../lib/utils";

// ---------------------------------------------------------------------------
// Core Radix Tooltip Primitives (300ms hover delay, collision detection)
// ---------------------------------------------------------------------------

export type TooltipProviderProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>;

/**
 * Root TooltipProvider with 300ms default hover delay matching platform specifications.
 */
export function TooltipProvider({
  delayDuration = 300,
  skipDelayDuration = 150,
  ...props
}: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

export type TooltipProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;

export function Tooltip({ delayDuration = 300, ...props }: TooltipProps) {
  return <TooltipPrimitive.Root delayDuration={delayDuration} {...props} />;
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipPortal = TooltipPrimitive.Portal;

export const TooltipArrow = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Arrow>
>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Arrow
    ref={ref}
    className={cn("fill-white dark:fill-zinc-900", className)}
    {...props}
  />
));
TooltipArrow.displayName = TooltipPrimitive.Arrow.displayName;

export interface TooltipContentProps extends React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
> {
  showArrow?: boolean;
}

/**
 * TooltipContent with automatic viewport collision detection, customizable offset,
 * and dark/zinc-800 themed glassmorphism styling.
 */
export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    {
      className,
      sideOffset = 6,
      collisionPadding = 8,
      avoidCollisions = true,
      showArrow = true,
      children,
      ...props
    },
    ref,
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions={avoidCollisions}
        className={cn(
          "z-50 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-3.5 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 shadow-xl shadow-zinc-950/10 dark:shadow-black/40",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-1.5 data-[side=top]:slide-in-from-bottom-1.5 data-[side=left]:slide-in-from-right-1.5 data-[side=right]:slide-in-from-left-1.5",
          className,
        )}
        {...props}
      >
        {children}
        {showArrow && <TooltipArrow />}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// ---------------------------------------------------------------------------
// Global Terminology Dictionary
// ---------------------------------------------------------------------------

export interface TermDefinition {
  name: string;
  category:
    "Stellar / Protocol" | "Security / Cryptography" | "Role / Access" | "Platform / Finance";
  definition: string;
  shortDescription: string;
  learnMoreUrl?: string;
  relatedTerms?: string[];
}

export const TERMINOLOGY_DICTIONARY: Record<string, TermDefinition> = {
  XLM: {
    name: "Stellar Lumens (XLM)",
    category: "Stellar / Protocol",
    shortDescription: "Native asset of the Stellar decentralized network.",
    definition:
      "XLM is the native utility token of the Stellar blockchain. It is used to pay transaction fees, maintain account minimum reserves, and fund smart-contract escrow pools on StormSale.",
    learnMoreUrl: "https://developers.stellar.org/docs/fundamentals-and-concepts/lumens",
    relatedTerms: ["Soroban", "Escrow"],
  },
  SOROBAN: {
    name: "Soroban Smart Contracts",
    category: "Stellar / Protocol",
    shortDescription: "Turing-complete WebAssembly smart contract platform on Stellar.",
    definition:
      "Soroban is Stellar's native smart-contract engine. StormSale compiles affiliate escrow rules, commission rate calculators, and clearing timers to Soroban WebAssembly (Wasm) bytecode executed trustlessly on-chain.",
    learnMoreUrl: "https://soroban.stellar.org/docs",
    relatedTerms: ["XLM", "Clearing Period", "Escrow"],
  },
  "SEP-0010": {
    name: "SEP-0010 Authentication",
    category: "Security / Cryptography",
    shortDescription: "Stellar standard for cryptographic web authentication.",
    definition:
      "Stellar Ecosystem Proposal 0010 specifies challenge-response cryptographic login. Wallets sign a temporary challenge transaction via Freighter to prove public key ownership and establish secure sessions.",
    learnMoreUrl: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md",
    relatedTerms: ["Freighter", "Auditor"],
  },
  ESCROW: {
    name: "Smart Contract Escrow",
    category: "Platform / Finance",
    shortDescription: "Trustless locked budget pool for affiliate payouts.",
    definition:
      "An automated smart contract holding advertiser funds in trust. Once verified conversion milestones or clearing periods mature, the contract distributes commissions directly to the affiliate's wallet without centralized custody.",
    relatedTerms: ["Soroban", "Clearing Period", "Advertiser"],
  },
  FREIGHTER: {
    name: "Freighter Wallet",
    category: "Stellar / Protocol",
    shortDescription: "Non-custodial browser wallet extension for Stellar and Soroban.",
    definition:
      "A secure, self-custodial browser extension that manages Stellar cryptographic keys, signs contract invocations, and enables one-click dApp authentication.",
    learnMoreUrl: "https://www.freighter.app/",
    relatedTerms: ["SEP-0010", "Albedo"],
  },
  "MERKLE TREE": {
    name: "Merkle Tree Batch Proof",
    category: "Security / Cryptography",
    shortDescription: "Binary hash tree for high-throughput conversion verification.",
    definition:
      "A cryptographic tree structure where each leaf represents a customer conversion hash. It enables proving that a specific conversion is included in an on-chain batch with logarithmic proof size and zero-knowledge privacy.",
    relatedTerms: ["Auditor", "Soroban"],
  },
  "CLEARING PERIOD": {
    name: "Clearing Period",
    category: "Platform / Finance",
    shortDescription: "Maturity delay allowing fraud screening prior to commission payout.",
    definition:
      "A designated time delay (e.g., 7 days or 14 days) during which logged sales are audited for refunds or fraudulent activity before affiliate commission balances become mature for on-chain withdrawal.",
    relatedTerms: ["Escrow", "Auditor"],
  },
  "COMMISSION SPLIT": {
    name: "Commission Split",
    category: "Platform / Finance",
    shortDescription: "Algorithmic revenue sharing among campaign partners.",
    definition:
      "A programmable distribution rule executed on-chain that splits affiliate bounties between primary affiliates, referrers, sub-affiliates, or platform revenue shares in a single atomic transaction.",
    relatedTerms: ["Affiliate", "Escrow"],
  },
  COHORT: {
    name: "Affiliate Cohort Analysis",
    category: "Platform / Finance",
    shortDescription: "Performance aggregation segmented by signup window or traffic channel.",
    definition:
      "A grouping of affiliates or conversions joined during a specific timeframe or traffic tier, enabling advertisers to analyze long-term retention, ROI, and conversion efficiency.",
    relatedTerms: ["Advertiser", "Affiliate"],
  },
  "MULTI-SIG": {
    name: "Multi-Signature Authorization",
    category: "Security / Cryptography",
    shortDescription: "Requirement of multiple distinct cryptographic signatures.",
    definition:
      "A security mechanism where sensitive operations—such as early escrow refunds or parameter alterations—require M-of-N signed approvals from independent advertiser and auditor keys.",
    relatedTerms: ["Auditor", "Advertiser"],
  },
  AUDITOR: {
    name: "Auditor Role",
    category: "Role / Access",
    shortDescription: "Independent compliance entity with encrypted inspection permissions.",
    definition:
      "A verified role equipped with specialized cryptographic keys to inspect encrypted sale hashes, verify Merkle trees, and confirm regulatory compliance without altering state or draining funds.",
    relatedTerms: ["Advertiser", "Affiliate", "Merkle Tree"],
  },
  ADVERTISER: {
    name: "Advertiser Role",
    category: "Role / Access",
    shortDescription: "Campaign creator and escrow funding authority.",
    definition:
      "The primary merchant entity that creates marketing campaigns, deploys Soroban escrow contracts, funds promotional budgets, and sets commission structures.",
    relatedTerms: ["Affiliate", "Auditor", "Escrow"],
  },
  AFFILIATE: {
    name: "Affiliate Role",
    category: "Role / Access",
    shortDescription: "Growth marketer earning automated on-chain bounties.",
    definition:
      "A partner or marketer who joins published campaigns, generates tracked referral links, and claims matured commission payouts directly to their Stellar wallet.",
    relatedTerms: ["Advertiser", "Commission Split", "Clearing Period"],
  },
  PASSKEY: {
    name: "WebAuthn / Passkey Signer",
    category: "Security / Cryptography",
    shortDescription: "Biometric hardware-backed key for seamless wallet onboarding.",
    definition:
      "FIDO2 biometric authentication (TouchID, FaceID, Windows Hello) that generates cryptographic keys stored in secure hardware enclaves, removing the need for manual seed phrases.",
    relatedTerms: ["Freighter", "Albedo"],
  },
  ALBEDO: {
    name: "Albedo Web Signer",
    category: "Stellar / Protocol",
    shortDescription: "Browser-based delegate signer for mobile and extensionless devices.",
    definition:
      "A web-based Stellar signing tool that allows users to authorize transactions without installing extensions or sharing private keys.",
    learnMoreUrl: "https://albedo.link/",
    relatedTerms: ["Freighter", "xBull"],
  },
  XBULL: {
    name: "xBull Wallet",
    category: "Stellar / Protocol",
    shortDescription: "Multi-platform non-custodial wallet for power users.",
    definition:
      "A cross-platform non-custodial wallet supporting hardware key integration, advanced account management, and multi-network switching on Stellar.",
    learnMoreUrl: "https://xbull.app/",
    relatedTerms: ["Freighter", "Albedo"],
  },
  SAC: {
    name: "Stellar Asset Contract (SAC)",
    category: "Stellar / Protocol",
    shortDescription: "Soroban interface for native Stellar assets and stablecoins.",
    definition:
      "A built-in contract wrapper that exposes classic Stellar trustline assets (USDC, EURC, XLM) to Soroban smart contracts, enabling seamless token allowances and escrow locking.",
    relatedTerms: ["Soroban", "XLM"],
  },
  FRIENDBOT: {
    name: "Friendbot Faucet",
    category: "Stellar / Protocol",
    shortDescription: "Stellar testnet account creation and XLM funding service.",
    definition:
      "A developer faucet hosted by the Stellar Development Foundation that funds newly generated testnet keypairs with test XLM for sandbox experimentation.",
    learnMoreUrl:
      "https://developers.stellar.org/docs/fundamentals-and-concepts/testnet-and-local-network",
    relatedTerms: ["XLM"],
  },
};

/**
 * Normalizes term input and retrieves definition from global dictionary.
 */
export function getTermDefinition(term: string): TermDefinition | null {
  if (!term || typeof term !== "string") return null;
  const normalized = term.trim().toUpperCase();

  if (TERMINOLOGY_DICTIONARY[normalized]) {
    return TERMINOLOGY_DICTIONARY[normalized];
  }

  // Substring or alias matching
  const matchingKey = Object.keys(TERMINOLOGY_DICTIONARY).find(
    (key) => key === normalized || normalized.includes(key) || key.includes(normalized),
  );

  return matchingKey ? TERMINOLOGY_DICTIONARY[matchingKey] : null;
}

// ---------------------------------------------------------------------------
// High-Level Terminology Tooltip Component
// ---------------------------------------------------------------------------

export interface TerminologyTooltipProps {
  term: string;
  children?: React.ReactNode;
  showIcon?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
  customDescription?: string;
}

/**
 * Contextual Tooltip component connected to the global terminology dictionary.
 * Features 300ms hover delay, collision detection, and accessible WAI-ARIA tags.
 */
export function TerminologyTooltip({
  term,
  children,
  showIcon = false,
  side = "top",
  align = "center",
  className,
  customDescription,
}: TerminologyTooltipProps) {
  const definition = getTermDefinition(term);
  const displayText = children || term;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="button"
            aria-label={`Terminology guide for ${term}`}
            className={cn(
              "inline-flex items-center gap-1 cursor-help border-b border-dotted border-indigo-400 dark:border-indigo-500 font-medium transition-colors hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm",
              className,
            )}
          >
            {displayText}
            {showIcon && (
              <HelpCircle className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          avoidCollisions={true}
          collisionPadding={12}
          className="max-w-xs sm:max-w-sm p-4 space-y-2 text-left bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <span className="font-bold text-sm text-zinc-900 dark:text-white">
              {definition?.name || term}
            </span>
            {definition?.category && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40">
                {definition.category}
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {customDescription || definition?.definition || "Definition not found in dictionary."}
          </p>

          {definition?.learnMoreUrl && (
            <div className="pt-1 flex items-center justify-between text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              <a
                href={definition.learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                Stellar Documentation
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Terminology Glossary / Guide Component
// ---------------------------------------------------------------------------

export interface TerminologyGuideProps {
  filterCategory?: TermDefinition["category"];
  searchTerm?: string;
  className?: string;
}

export function TerminologyGuide({
  filterCategory,
  searchTerm = "",
  className,
}: TerminologyGuideProps) {
  const terms = Object.entries(TERMINOLOGY_DICTIONARY).filter(([key, def]) => {
    const matchesCategory = !filterCategory || def.category === filterCategory;
    const matchesSearch =
      !searchTerm ||
      key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      def.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      def.definition.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <BookOpen className="w-5 h-5 text-indigo-500" />
        <h3 className="font-bold text-base text-zinc-900 dark:text-white">
          Platform Terminology Guide
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {terms.map(([key, def]) => (
          <div
            key={key}
            className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{def.name}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {def.category}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
              {def.shortDescription}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
