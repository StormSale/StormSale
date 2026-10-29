export type BatchSaleRowValidationStatus = "valid" | "malformed";

export type OnChainRowStatus = "idle" | "pending" | "success" | "error";

export interface BatchSaleValidationError {
  field: "orderId" | "affiliateAddress" | "saleAmount" | "timestamp" | "general";
  message: string;
}

export interface ValidatedBatchSaleRow {
  id: string; // Unique row identifier e.g. "row-1"
  rowNumber: number; // 1-indexed row position in file
  orderId: string;
  affiliateAddress: string;
  saleAmount: number; // Parsed numeric amount in XLM
  saleAmountRaw: string;
  timestamp: string; // Normalized ISO 8601 string
  timestampRaw: string;
  status: BatchSaleRowValidationStatus;
  errors: BatchSaleValidationError[];
  leafHash?: string; // SHA-256 leaf hash for Merkle tree computation
  onChainStatus?: OnChainRowStatus;
  txHash?: string;
  errorMessage?: string;
}

export interface MerkleProofStep {
  position: "left" | "right";
  hash: string;
}

export interface MerkleTreeResult {
  root: string; // 0x-prefixed 64-char hex string
  rootWithoutPrefix: string;
  leaves: string[];
  totalValidSales: number;
  totalAmountXlm: number;
  depth: number;
}

export interface BatchParseResult {
  rows: ValidatedBatchSaleRow[];
  totalRows: number;
  validCount: number;
  malformedCount: number;
  totalValidAmountXlm: number;
  hasRequiredColumns: boolean;
  missingColumns: string[];
  columnMapping: {
    orderIdColumn?: string;
    affiliateAddressColumn?: string;
    saleAmountColumn?: string;
    timestampColumn?: string;
  };
  merkleTree?: MerkleTreeResult;
}

export interface BatchLoggingProgress {
  total: number;
  current: number; // 1-based index currently being processed
  percent: number;
  currentOrderId?: string;
  successCount: number;
  failCount: number;
  isLogging: boolean;
  isPaused: boolean;
  isComplete: boolean;
}

export interface BatchAuditManifest {
  manifestVersion: "1.0.0";
  batchId: string;
  generatedAt: string;
  campaignId: number | string;
  merkleRoot: string;
  totalRows: number;
  validCount: number;
  malformedCount: number;
  totalVolumeXlm: number;
  sales: Array<{
    rowNumber: number;
    orderId: string;
    affiliateAddress: string;
    saleAmountXlm: number;
    timestamp: string;
    leafHash: string;
    proof: MerkleProofStep[];
    onChainStatus?: OnChainRowStatus;
    txHash?: string;
  }>;
}
