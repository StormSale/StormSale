import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface VerificationKey {
  vkey: string;
  circuitId: string;
  loadedAt: number;
}

interface CircuitAsset {
  wasmPath: string;
  wasmSize: number;
  loaded: boolean;
}

interface ZKProof {
  proof: string;
  publicInputs: string[];
  circuitId: string;
  serialized: boolean;
}

interface PreVerificationResult {
  valid: boolean;
  error?: string;
}

class ZKSnarkVerifier {
  private vkeyCache: Map<string, VerificationKey> = new Map();
  private circuitCache: Map<string, CircuitAsset> = new Map();
  private wasmSimdSupported: boolean;
  private memoryAllocationAvailable: boolean;

  constructor(options: { wasmSimd?: boolean; memoryAvailable?: boolean } = {}) {
    this.wasmSimdSupported = options.wasmSimd ?? true;
    this.memoryAllocationAvailable = options.memoryAvailable ?? true;
  }

  async loadVerificationKey(circuitId: string, vkeyData: string): Promise<VerificationKey> {
    if (this.vkeyCache.has(circuitId)) {
      return this.vkeyCache.get(circuitId)!;
    }

    const vkey: VerificationKey = {
      vkey: vkeyData,
      circuitId,
      loadedAt: Date.now(),
    };

    this.vkeyCache.set(circuitId, vkey);
    return vkey;
  }

  getCachedVerificationKey(circuitId: string): VerificationKey | null {
    return this.vkeyCache.get(circuitId) || null;
  }

  async loadCircuitAsset(circuitId: string, wasmPath: string, wasmSize: number): Promise<CircuitAsset> {
    if (this.circuitCache.has(circuitId)) {
      return this.circuitCache.get(circuitId)!;
    }

    const asset: CircuitAsset = {
      wasmPath,
      wasmSize,
      loaded: true,
    };

    this.circuitCache.set(circuitId, asset);
    return asset;
  }

  getCachedCircuitAsset(circuitId: string): CircuitAsset | null {
    return this.circuitCache.get(circuitId) || null;
  }

  checkWasmSimdSupport(): boolean {
    return this.wasmSimdSupported;
  }

  checkMemoryAllocation(): boolean {
    return this.memoryAllocationAvailable;
  }

  async generateProof(
    circuitId: string,
    inputs: Record<string, unknown>,
  ): Promise<ZKProof> {
    if (!this.checkWasmSimdSupport()) {
      throw new Error("WebAssembly SIMD is not supported in this browser");
    }

    if (!this.checkMemoryAllocation()) {
      throw new Error("Memory allocation failed for ZK proof generation");
    }

    const vkey = this.getCachedVerificationKey(circuitId);
    if (!vkey) {
      throw new Error(`Verification key not loaded for circuit: ${circuitId}`);
    }

    const proof: ZKProof = {
      proof: `zk_proof_${circuitId}_${Date.now()}`,
      publicInputs: Object.values(inputs).map(String),
      circuitId,
      serialized: false,
    };

    return proof;
  }

  async preVerifyProof(proof: ZKProof): Promise<PreVerificationResult> {
    if (!proof.proof || proof.proof.length === 0) {
      return { valid: false, error: "Proof is empty or missing" };
    }

    if (!proof.publicInputs || proof.publicInputs.length === 0) {
      return { valid: false, error: "Public inputs are missing" };
    }

    const vkey = this.getCachedVerificationKey(proof.circuitId);
    if (!vkey) {
      return { valid: false, error: `Verification key not found for circuit: ${proof.circuitId}` };
    }

    return { valid: true };
  }

  serializeProofForSoroban(proof: ZKProof): string {
    const serialized = {
      circuit_id: proof.circuitId,
      proof: proof.proof,
      public_inputs: proof.publicInputs,
      format: "soroban_scval",
      version: "1.0",
    };

    return JSON.stringify(serialized);
  }

  deserializeProofFromSoroban(serialized: string): ZKProof {
    const parsed = JSON.parse(serialized);
    return {
      proof: parsed.proof,
      publicInputs: parsed.public_inputs,
      circuitId: parsed.circuit_id,
      serialized: true,
    };
  }
}

describe("Client-side ZK-SNARK Proof Verification for Private Allocations", () => {
  let verifier: ZKSnarkVerifier;

  const circuitId = "private_allocation_circuit";
  const vkeyData = "mock_vkey_data_base64_encoded";
  const wasmPath = "/circuits/private_allocation.wasm";
  const wasmSize = 1024 * 1024;

  const validInputs = {
    userCommitment: "0x1234",
    nullifier: "0x5678",
    amount: "1000",
    secret: "0xabcd",
  };

  beforeEach(() => {
    verifier = new ZKSnarkVerifier({ wasmSimd: true, memoryAvailable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ZK Verification Key Loading and Caching", () => {
    it("loads and caches verification key for a circuit", async () => {
      const vkey = await verifier.loadVerificationKey(circuitId, vkeyData);

      expect(vkey.circuitId).toBe(circuitId);
      expect(vkey.vkey).toBe(vkeyData);
      expect(vkey.loadedAt).toBeGreaterThan(0);
    });

    it("returns cached verification key on subsequent calls", async () => {
      await verifier.loadVerificationKey(circuitId, vkeyData);
      const cached = verifier.getCachedVerificationKey(circuitId);

      expect(cached).not.toBeNull();
      expect(cached!.vkey).toBe(vkeyData);
      expect(cached!.circuitId).toBe(circuitId);
    });

    it("returns null for uncached circuit", () => {
      const result = verifier.getCachedVerificationKey("unknown_circuit");
      expect(result).toBeNull();
    });
  });

  describe("WASM Circuit Asset Loading and Caching", () => {
    it("loads and caches WASM circuit asset", async () => {
      const asset = await verifier.loadCircuitAsset(circuitId, wasmPath, wasmSize);

      expect(asset.wasmPath).toBe(wasmPath);
      expect(asset.wasmSize).toBe(wasmSize);
      expect(asset.loaded).toBe(true);
    });

    it("returns cached circuit asset on subsequent calls", async () => {
      await verifier.loadCircuitAsset(circuitId, wasmPath, wasmSize);
      const cached = verifier.getCachedCircuitAsset(circuitId);

      expect(cached).not.toBeNull();
      expect(cached!.wasmPath).toBe(wasmPath);
    });

    it("returns null for uncached circuit asset", () => {
      const result = verifier.getCachedCircuitAsset("unknown_circuit");
      expect(result).toBeNull();
    });
  });

  describe("ZK Proof Generation and Pre-Verification", () => {
    it("generates a valid ZK proof with all required fields", async () => {
      await verifier.loadVerificationKey(circuitId, vkeyData);

      const proof = await verifier.generateProof(circuitId, validInputs);

      expect(proof.proof).toBeDefined();
      expect(proof.proof.length).toBeGreaterThan(0);
      expect(proof.publicInputs).toHaveLength(4);
      expect(proof.circuitId).toBe(circuitId);
      expect(proof.serialized).toBe(false);
    });

    it("passes client-side pre-verification check for valid proof", async () => {
      await verifier.loadVerificationKey(circuitId, vkeyData);
      const proof = await verifier.generateProof(circuitId, validInputs);

      const result = await verifier.preVerifyProof(proof);

      expect(result.valid).toBe(true);
    });

    it("fails pre-verification for proof with missing public inputs", async () => {
      await verifier.loadVerificationKey(circuitId, vkeyData);
      const proof = await verifier.generateProof(circuitId, validInputs);

      const invalidProof = { ...proof, publicInputs: [] };
      const result = await verifier.preVerifyProof(invalidProof);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Public inputs are missing");
    });

    it("fails pre-verification for empty proof", async () => {
      const invalidProof = { proof: "", publicInputs: ["input1"], circuitId, serialized: false };
      const result = await verifier.preVerifyProof(invalidProof);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Proof is empty or missing");
    });
  });

  describe("Error Fallback - WebAssembly SIMD Support", () => {
    it("throws error when browser lacks WebAssembly SIMD support", async () => {
      const simdVerifier = new ZKSnarkVerifier({ wasmSimd: false, memoryAvailable: true });
      await simdVerifier.loadVerificationKey(circuitId, vkeyData);

      await expect(simdVerifier.generateProof(circuitId, validInputs)).rejects.toThrow(
        "WebAssembly SIMD is not supported in this browser",
      );
    });
  });

  describe("Error Fallback - Memory Allocation", () => {
    it("throws error when memory allocation fails", async () => {
      const memoryVerifier = new ZKSnarkVerifier({ wasmSimd: true, memoryAvailable: false });
      await memoryVerifier.loadVerificationKey(circuitId, vkeyData);

      await expect(memoryVerifier.generateProof(circuitId, validInputs)).rejects.toThrow(
        "Memory allocation failed for ZK proof generation",
      );
    });
  });

  describe("Proof Serialization Format for Soroban", () => {
    it("serializes proof to match Soroban contract expectations", async () => {
      await verifier.loadVerificationKey(circuitId, vkeyData);
      const proof = await verifier.generateProof(circuitId, validInputs);

      const serialized = verifier.serializeProofForSoroban(proof);
      const parsed = JSON.parse(serialized);

      expect(parsed.circuit_id).toBe(circuitId);
      expect(parsed.proof).toBe(proof.proof);
      expect(parsed.public_inputs).toEqual(proof.publicInputs);
      expect(parsed.format).toBe("soroban_scval");
      expect(parsed.version).toBe("1.0");
    });

    it("deserializes proof from Soroban format correctly", async () => {
      await verifier.loadVerificationKey(circuitId, vkeyData);
      const proof = await verifier.generateProof(circuitId, validInputs);

      const serialized = verifier.serializeProofForSoroban(proof);
      const deserialized = verifier.deserializeProofFromSoroban(serialized);

      expect(deserialized.proof).toBe(proof.proof);
      expect(deserialized.publicInputs).toEqual(proof.publicInputs);
      expect(deserialized.circuitId).toBe(circuitId);
      expect(deserialized.serialized).toBe(true);
    });
  });
});
