/**
 * Platform-wide on-chain activity index.
 *
 * Every StormSale contract interaction lands in a Stellar ledger, so each
 * record carries the `blockNumber` (ledger sequence) it was finalized in. The
 * ledger explorer uses these numbers to filter platform data by block range.
 *
 * NOTE: sample/indexed data — in production this feed is served by the
 * metadata indexing API and mirrored from Soroban RPC events.
 */

export type LedgerEventType =
  | "Campaign Deployed"
  | "Sale Logged"
  | "Commission Escrowed"
  | "Payout Claimed"
  | "Audit Access Granted";

export type LedgerEventStatus = "Confirmed" | "Settled" | "Pending";

export interface PlatformLedgerEntry {
  id: string;
  /** Stellar ledger sequence number this event was finalized in. */
  blockNumber: number;
  txHash: string;
  event: LedgerEventType;
  campaign: string;
  amount: string;
  status: LedgerEventStatus;
  timestamp: string;
}

/** Most recent indexed ledger (head of the chain for this dataset). */
export const LATEST_LEDGER = 6_120_940;

/** Oldest indexed ledger in this dataset. */
export const EARLIEST_LEDGER = 6_118_046;

export const PLATFORM_LEDGER: PlatformLedgerEntry[] = [
  {
    id: "evt-001",
    blockNumber: 6_120_940,
    txHash: "8f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    event: "Commission Escrowed",
    campaign: "Tech Gadgets Pro",
    amount: "450 XLM",
    status: "Settled",
    timestamp: "2026-10-16 14:02",
  },
  {
    id: "evt-002",
    blockNumber: 6_120_862,
    txHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    event: "Sale Logged",
    campaign: "Web3 Masterclass",
    amount: "1,200 XLM",
    status: "Confirmed",
    timestamp: "2026-10-16 13:47",
  },
  {
    id: "evt-003",
    blockNumber: 6_120_731,
    txHash: "c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8",
    event: "Payout Claimed",
    campaign: "Tech Gadgets Pro",
    amount: "45 XLM",
    status: "Settled",
    timestamp: "2026-10-16 13:19",
  },
  {
    id: "evt-004",
    blockNumber: 6_120_604,
    txHash: "3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829",
    event: "Audit Access Granted",
    campaign: "Crypto Tools Suite",
    amount: "—",
    status: "Confirmed",
    timestamp: "2026-10-16 12:52",
  },
  {
    id: "evt-005",
    blockNumber: 6_120_487,
    txHash: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
    event: "Sale Logged",
    campaign: "DeFi Starter Pack",
    amount: "860 XLM",
    status: "Confirmed",
    timestamp: "2026-10-16 12:28",
  },
  {
    id: "evt-006",
    blockNumber: 6_120_315,
    txHash: "f7e6d5c4b3a291807162534435261708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    event: "Commission Escrowed",
    campaign: "DeFi Starter Pack",
    amount: "86 XLM",
    status: "Settled",
    timestamp: "2026-10-16 11:55",
  },
  {
    id: "evt-007",
    blockNumber: 6_120_188,
    txHash: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
    event: "Campaign Deployed",
    campaign: "NFT Drop Alpha",
    amount: "5,000 XLM",
    status: "Confirmed",
    timestamp: "2026-10-16 11:31",
  },
  {
    id: "evt-008",
    blockNumber: 6_120_044,
    txHash: "5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d",
    event: "Sale Logged",
    campaign: "Tech Gadgets Pro",
    amount: "2,400 XLM",
    status: "Pending",
    timestamp: "2026-10-16 10:58",
  },
  {
    id: "evt-009",
    blockNumber: 6_119_911,
    txHash: "9c8b7a6f5e4d3c2b1a0918273645465768899aabbccddeeff0011223344556677",
    event: "Payout Claimed",
    campaign: "Web3 Masterclass",
    amount: "180 XLM",
    status: "Settled",
    timestamp: "2026-10-16 10:24",
  },
  {
    id: "evt-010",
    blockNumber: 6_119_774,
    txHash: "b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5",
    event: "Audit Access Granted",
    campaign: "Web3 Masterclass",
    amount: "—",
    status: "Confirmed",
    timestamp: "2026-10-16 09:51",
  },
  {
    id: "evt-011",
    blockNumber: 6_119_602,
    txHash: "c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2",
    event: "Sale Logged",
    campaign: "Crypto Tools Suite",
    amount: "540 XLM",
    status: "Confirmed",
    timestamp: "2026-10-16 09:12",
  },
  {
    id: "evt-012",
    blockNumber: 6_119_455,
    txHash: "e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    event: "Commission Escrowed",
    campaign: "Crypto Tools Suite",
    amount: "64.8 XLM",
    status: "Settled",
    timestamp: "2026-10-16 08:38",
  },
  {
    id: "evt-013",
    blockNumber: 6_119_303,
    txHash: "2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a",
    event: "Sale Logged",
    campaign: "Summer Sale 2024",
    amount: "310 XLM",
    status: "Confirmed",
    timestamp: "2026-10-16 08:01",
  },
  {
    id: "evt-014",
    blockNumber: 6_119_140,
    txHash: "4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c",
    event: "Payout Claimed",
    campaign: "DeFi Starter Pack",
    amount: "92 XLM",
    status: "Settled",
    timestamp: "2026-10-15 22:47",
  },
  {
    id: "evt-015",
    blockNumber: 6_118_988,
    txHash: "6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e",
    event: "Campaign Deployed",
    campaign: "Web3 Masterclass",
    amount: "8,000 XLM",
    status: "Confirmed",
    timestamp: "2026-10-15 21:56",
  },
  {
    id: "evt-016",
    blockNumber: 6_118_812,
    txHash: "8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70",
    event: "Sale Logged",
    campaign: "NFT Drop Alpha",
    amount: "1,750 XLM",
    status: "Pending",
    timestamp: "2026-10-15 21:12",
  },
  {
    id: "evt-017",
    blockNumber: 6_118_641,
    txHash: "a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a",
    event: "Commission Escrowed",
    campaign: "NFT Drop Alpha",
    amount: "210 XLM",
    status: "Settled",
    timestamp: "2026-10-15 20:29",
  },
  {
    id: "evt-018",
    blockNumber: 6_118_470,
    txHash: "b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3",
    event: "Audit Access Granted",
    campaign: "Tech Gadgets Pro",
    amount: "—",
    status: "Confirmed",
    timestamp: "2026-10-15 19:48",
  },
  {
    id: "evt-019",
    blockNumber: 6_118_288,
    txHash: "c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4",
    event: "Sale Logged",
    campaign: "Summer Sale 2024",
    amount: "78 XLM",
    status: "Confirmed",
    timestamp: "2026-10-15 19:05",
  },
  {
    id: "evt-020",
    blockNumber: 6_118_046,
    txHash: "d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5",
    event: "Payout Claimed",
    campaign: "Summer Sale 2024",
    amount: "7.8 XLM",
    status: "Settled",
    timestamp: "2026-10-15 18:11",
  },
];

/** Full range covered by the indexed platform dataset. */
export const PLATFORM_LEDGER_BOUNDS = {
  from: EARLIEST_LEDGER,
  to: LATEST_LEDGER,
};
