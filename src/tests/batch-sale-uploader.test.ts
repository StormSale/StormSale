import { describe, it, expect } from "vitest";
import {
  parseBatchCsv,
  parseBatchJson,
  validateStellarAddress,
  parseSaleAmount,
  parseTimestamp,
  generateSampleCSV,
  generateSampleJSON,
  detectHeaders,
  validateBatchSaleRow,
  BatchRowSchema,
  SAMPLE_STELLAR_KEYS,
} from "../lib/batchSaleParser";
import {
  sha256,
  hashSaleLeaf,
  computeMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
  createSaleLeafString,
} from "../lib/merkleTree";

describe("Batch Sale Conversion Uploader with CSV/JSON Parsing & Merkle Verification", () => {
  describe("Cryptographic Merkle Tree Engine", () => {
    it("should compute accurate SHA-256 hashes", () => {
      // Standard NIST test vectors
      expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
      expect(sha256("hello")).toBe(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      );
    });

    it("should compute deterministic Merkle roots for empty and single-leaf batches", () => {
      const emptyTree = computeMerkleTree([]);
      expect(emptyTree.root).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
      expect(emptyTree.totalValidSales).toBe(0);

      const leaf1 = hashSaleLeaf("ORD-1", SAMPLE_STELLAR_KEYS[0], 100, "2026-10-17T12:00:00.000Z");
      const singleTree = computeMerkleTree([leaf1], 100);
      expect(singleTree.root).toBe(`0x${leaf1}`);
      expect(singleTree.leaves.length).toBe(1);
    });

    it("should compute Merkle root and verify cryptographic proofs for odd and even leaf counts", () => {
      const leaves = [
        hashSaleLeaf("ORD-1", SAMPLE_STELLAR_KEYS[0], 50, "2026-10-17T10:00:00.000Z"),
        hashSaleLeaf("ORD-2", SAMPLE_STELLAR_KEYS[1], 120, "2026-10-17T11:00:00.000Z"),
        hashSaleLeaf("ORD-3", SAMPLE_STELLAR_KEYS[2], 85, "2026-10-17T12:00:00.000Z"),
      ];

      const tree = computeMerkleTree(leaves, 255);
      expect(tree.root.startsWith("0x")).toBe(true);
      expect(tree.root.length).toBe(66); // "0x" + 64 hex chars

      // Verify audit proof for each leaf in the 3-leaf tree
      for (let i = 0; i < leaves.length; i++) {
        const proof = getMerkleProof(leaves, i);
        expect(proof.length).toBeGreaterThan(0);
        const isValid = verifyMerkleProof(leaves[i], proof, tree.root);
        expect(isValid).toBe(true);
      }

      // Tampered leaf must fail verification
      const fakeLeaf = sha256("TAMPERED_RECORD_ATTEMPT");
      const fakeProof = getMerkleProof(leaves, 0);
      expect(verifyMerkleProof(fakeLeaf, fakeProof, tree.root)).toBe(false);
    });

    it("should verify canonical leaf string format consistency", () => {
      const canonical = createSaleLeafString(
        "ORD-99",
        SAMPLE_STELLAR_KEYS[0],
        45.5,
        "2026-10-17T12:00:00.000Z",
      );
      expect(canonical).toBe(
        `ORD-99:${SAMPLE_STELLAR_KEYS[0]}:45.5000000:2026-10-17T12:00:00.000Z`,
      );
    });
  });

  describe("Header Detection & Column Normalization", () => {
    it("should detect required columns regardless of casing or formatting", () => {
      const standardHeaders = ["Order ID", "Affiliate Address", "Sale Amount", "Timestamp"];
      const detected = detectHeaders(standardHeaders);
      expect(detected.orderIdKey).toBe("Order ID");
      expect(detected.affiliateKey).toBe("Affiliate Address");
      expect(detected.amountKey).toBe("Sale Amount");
      expect(detected.timestampKey).toBe("Timestamp");

      const snakeCase = ["order_id", "affiliate_address", "amount_xlm", "created_at"];
      const detectedSnake = detectHeaders(snakeCase);
      expect(detectedSnake.orderIdKey).toBe("order_id");
      expect(detectedSnake.affiliateKey).toBe("affiliate_address");
      expect(detectedSnake.amountKey).toBe("amount_xlm");
      expect(detectedSnake.timestampKey).toBe("created_at");
    });
  });

  describe("Field-Level & Schema Validations", () => {
    it("should validate Stellar Ed25519 public keys correctly", () => {
      for (const validKey of SAMPLE_STELLAR_KEYS) {
        expect(validateStellarAddress(validKey)).toBe(true);
      }

      // Invalid cases
      expect(validateStellarAddress("")).toBe(false);
      expect(validateStellarAddress("GBAD")).toBe(false);
      expect(
        validateStellarAddress("SA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F"),
      ).toBe(false); // Secret key starting with S
      expect(validateStellarAddress("0x71C84167b33ab71c0057156502b7738Bbd30E8C8")).toBe(false); // EVM address
    });

    it("should parse and validate sale amounts", () => {
      expect(parseSaleAmount(100).isValid).toBe(true);
      expect(parseSaleAmount("125.50").isValid).toBe(true);
      expect(parseSaleAmount("45.50 XLM").value).toBe(45.5);
      expect(parseSaleAmount("$1,200.50").value).toBe(1200.5);

      // Invalid amounts
      expect(parseSaleAmount(0).isValid).toBe(false);
      expect(parseSaleAmount(-15).isValid).toBe(false);
      expect(parseSaleAmount("abc").isValid).toBe(false);
      expect(parseSaleAmount("").isValid).toBe(false);
      expect(parseSaleAmount(20000000).isValid).toBe(false); // Exceeds 10M limit
    });

    it("should parse and normalize ISO and Unix timestamps", () => {
      const iso = "2026-10-17T14:30:00.000Z";
      expect(parseTimestamp(iso).isValid).toBe(true);

      const unixSeconds = "1729170000";
      const parsedUnix = parseTimestamp(unixSeconds);
      expect(parsedUnix.isValid).toBe(true);
      expect(parsedUnix.iso).toBe(new Date(1729170000 * 1000).toISOString());

      expect(parseTimestamp("invalid-date-string").isValid).toBe(false);
      expect(parseTimestamp("").isValid).toBe(false);
    });

    it("should validate strict Zod BatchRowSchema directly", () => {
      const validPayload = {
        orderId: "ORD-1234",
        affiliateAddress: SAMPLE_STELLAR_KEYS[0],
        saleAmount: 150.75,
        timestamp: "2026-10-17T12:00:00.000Z",
      };
      const result = BatchRowSchema.safeParse(validPayload);
      expect(result.success).toBe(true);

      // Invalid address in schema
      const invalidAddress = { ...validPayload, affiliateAddress: "GBOGUS_KEY" };
      expect(BatchRowSchema.safeParse(invalidAddress).success).toBe(false);

      // Negative amount in schema
      const negativeAmount = { ...validPayload, saleAmount: -10 };
      expect(BatchRowSchema.safeParse(negativeAmount).success).toBe(false);
    });

    it("should validate single row and generate leaf hash with validateBatchSaleRow", () => {
      const validRow = validateBatchSaleRow(
        "ORD-55",
        SAMPLE_STELLAR_KEYS[1],
        "75.50 XLM",
        "2026-10-17T12:00:00.000Z",
        1,
      );
      expect(validRow.status).toBe("valid");
      expect(validRow.errors.length).toBe(0);
      expect(validRow.leafHash).toBeDefined();

      const malformedRow = validateBatchSaleRow("", "NOT_A_KEY", "-50.00", "BAD_DATE", 2);
      expect(malformedRow.status).toBe("malformed");
      expect(malformedRow.errors.length).toBe(4); // orderId, affiliateAddress, saleAmount, timestamp
      expect(malformedRow.leafHash).toBeUndefined();
    });
  });

  describe("50+ Order CSV Batch Processing", () => {
    it("should parse a 50+ order CSV file and compute Merkle tree", async () => {
      const sampleCsv = generateSampleCSV(55, false);
      const result = await parseBatchCsv(sampleCsv);

      expect(result.totalRows).toBe(55);
      expect(result.validCount).toBe(55);
      expect(result.malformedCount).toBe(0);
      expect(result.hasRequiredColumns).toBe(true);
      expect(result.totalValidAmountXlm).toBeGreaterThan(500);

      expect(result.merkleTree).toBeDefined();
      expect(result.merkleTree?.root.startsWith("0x")).toBe(true);
      expect(result.merkleTree?.leaves.length).toBe(55);
      expect(result.merkleTree?.depth).toBeGreaterThanOrEqual(6);

      // Verify every leaf in the 55-row batch can be cryptographically verified against the root
      const leaves = result.merkleTree!.leaves;
      for (let i = 0; i < leaves.length; i++) {
        const proof = getMerkleProof(leaves, i);
        const valid = verifyMerkleProof(leaves[i], proof, result.merkleTree!.root);
        expect(valid).toBe(true);
      }
    });

    it("should flag malformed rows in preview table data without aborting valid rows", async () => {
      const sampleCsvWithMalformed = generateSampleCSV(52, true);
      const result = await parseBatchCsv(sampleCsvWithMalformed);

      expect(result.totalRows).toBe(52);
      expect(result.malformedCount).toBe(3); // Rows 5, 12, 20
      expect(result.validCount).toBe(49);

      // Verify malformed row flagging
      const malformedRows = result.rows.filter((r) => r.status === "malformed");
      expect(malformedRows.length).toBe(3);

      const badAddressRow = malformedRows.find((r) => r.rowNumber === 5);
      expect(badAddressRow?.errors.some((e) => e.field === "affiliateAddress")).toBe(true);

      const negativeAmountRow = malformedRows.find((r) => r.rowNumber === 12);
      expect(negativeAmountRow?.errors.some((e) => e.field === "saleAmount")).toBe(true);

      const badTimestampRow = malformedRows.find((r) => r.rowNumber === 20);
      expect(badTimestampRow?.errors.some((e) => e.field === "timestamp")).toBe(true);

      // Merkle tree computes across all valid rows
      expect(result.merkleTree).toBeDefined();
      expect(result.merkleTree?.totalValidSales).toBe(49);
    });

    it("should reject CSV missing required columns with descriptive errors", async () => {
      const invalidCsv = "Order ID,Sale Amount\nORD-1,100\nORD-2,200";
      const result = await parseBatchCsv(invalidCsv);

      expect(result.hasRequiredColumns).toBe(false);
      expect(result.missingColumns).toContain("Affiliate Address");
      expect(result.missingColumns).toContain("Timestamp");
      expect(result.malformedCount).toBe(2);
      expect(result.validCount).toBe(0);
    });

    it("should handle empty CSV input gracefully", async () => {
      const result = await parseBatchCsv("");
      expect(result.totalRows).toBe(0);
      expect(result.validCount).toBe(0);
      expect(result.hasRequiredColumns).toBe(false);
    });
  });

  describe("50+ Order JSON Batch Processing", () => {
    it("should parse 50+ order JSON payload and verify schema", async () => {
      const sampleJson = generateSampleJSON(50, false);
      const result = await parseBatchJson(sampleJson);

      expect(result.totalRows).toBe(50);
      expect(result.validCount).toBe(50);
      expect(result.malformedCount).toBe(0);
      expect(result.merkleTree).toBeDefined();
      expect(result.merkleTree?.root.startsWith("0x")).toBe(true);
    });

    it("should support direct JSON array and object container structures", async () => {
      const directArray = [
        {
          "Order ID": "ORD-1",
          "Affiliate Address": SAMPLE_STELLAR_KEYS[0],
          "Sale Amount": 100,
          Timestamp: "2026-10-17T12:00:00.000Z",
        },
      ];
      const resArray = await parseBatchJson(JSON.stringify(directArray));
      expect(resArray.validCount).toBe(1);

      const objectSales = {
        sales: directArray,
      };
      const resSales = await parseBatchJson(JSON.stringify(objectSales));
      expect(resSales.validCount).toBe(1);
    });

    it("should handle malformed JSON syntax gracefully", async () => {
      const brokenJson = "{ orders: [ invalid json ...";
      const result = await parseBatchJson(brokenJson);

      expect(result.validCount).toBe(0);
      expect(result.malformedCount).toBe(1);
      expect(result.rows[0].errors[0].message).toContain("Failed to parse JSON file");
    });
  });
});
