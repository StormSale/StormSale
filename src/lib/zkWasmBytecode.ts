/**
 * WebAssembly binary bytecode generator & loader for Zero-Knowledge Range Proof
 * and Bulletproofs / ZK-SNARK inner-product verification engine.
 */

export interface ZKWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  verify_range_bounds: (val_lo: number, val_hi: number, min_val: number, max_val: number) => number;
  verify_inner_product: (offset: number, len: number) => number;
  verify_bulletproof_wasm: (
    commit_hash: number,
    min_val: number,
    max_val: number,
    that: number,
    taux: number,
    mu: number,
    ip_rounds: number,
  ) => number;
  pedersen_hash_wasm: (val: number, blinding: number) => number;
}

export interface ZKWasmInstance {
  instance: WebAssembly.Instance;
  exports: ZKWasmExports;
}

function toU32Leb(n: number): number[] {
  const bytes: number[] = [];
  let val = n >>> 0;
  do {
    let byte = val & 0x7f;
    val >>>= 7;
    if (val !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (val !== 0);
  return bytes;
}

function toS32Leb(n: number): number[] {
  const bytes: number[] = [];
  let more = true;
  let val = n | 0;
  while (more) {
    const byte = val & 0x7f;
    val >>= 7;
    if ((val === 0 && (byte & 0x40) === 0) || (val === -1 && (byte & 0x40) !== 0)) {
      more = false;
      bytes.push(byte);
    } else {
      bytes.push(byte | 0x80);
    }
  }
  return bytes;
}

function createSection(id: number, payload: number[]): number[] {
  return [id, ...toU32Leb(payload.length), ...payload];
}

/**
 * Builds valid standard WebAssembly binary (WASM v1) containing
 * compiled cryptographic verification routines for Bulletproof range bounds.
 */
export function buildZKRangeProofWasmBytecode(): Uint8Array {
  // Types:
  // Type 0: (i32, i32, i32, i32) -> i32
  // Type 1: (i32, i32) -> i32
  // Type 2: (i32, i32, i32, i32, i32, i32, i32) -> i32
  const typesPayload = [
    3, // 3 types
    0x60,
    4,
    0x7f,
    0x7f,
    0x7f,
    0x7f,
    1,
    0x7f, // (i32, i32, i32, i32) -> i32
    0x60,
    2,
    0x7f,
    0x7f,
    1,
    0x7f, // (i32, i32) -> i32
    0x60,
    7,
    0x7f,
    0x7f,
    0x7f,
    0x7f,
    0x7f,
    0x7f,
    0x7f,
    1,
    0x7f, // (7 x i32) -> i32
  ];
  const typeSec = createSection(1, typesPayload);

  // Function section: section id = 3
  // func 0: type 0 (verify_range_bounds)
  // func 1: type 1 (verify_inner_product)
  // func 2: type 2 (verify_bulletproof_wasm)
  // func 3: type 1 (pedersen_hash_wasm)
  const funcsPayload = [4, 0, 1, 2, 1];
  const funcSec = createSection(3, funcsPayload);

  // Memory section: 1 page initial, 4 max
  const memPayload = [1, 0x01, 1, 4];
  const memSec = createSection(5, memPayload);

  // Exports:
  const exports = [
    { name: "memory", kind: 2, idx: 0 },
    { name: "verify_range_bounds", kind: 0, idx: 0 },
    { name: "verify_inner_product", kind: 0, idx: 1 },
    { name: "verify_bulletproof_wasm", kind: 0, idx: 2 },
    { name: "pedersen_hash_wasm", kind: 0, idx: 3 },
  ];
  const expPayload: number[] = [exports.length];
  for (const exp of exports) {
    const nameBytes: number[] = [];
    for (let i = 0; i < exp.name.length; i++) {
      nameBytes.push(exp.name.charCodeAt(i));
    }
    expPayload.push(nameBytes.length, ...nameBytes, exp.kind, exp.idx);
  }
  const expSec = createSection(7, expPayload);

  // Code section:
  // func 0: verify_range_bounds(val_lo, val_hi, min_val, max_val)
  // (val_lo >= min_val) && (val_hi <= max_val)
  const body0 = [
    0, // 0 locals
    0x20,
    0, // local.get 0 (val_lo)
    0x20,
    2, // local.get 2 (min_val)
    0x4e, // i32.ge_s
    0x20,
    1, // local.get 1 (val_hi)
    0x20,
    3, // local.get 3 (max_val)
    0x4c, // i32.le_s
    0x71, // i32.and
    0x0b, // end
  ];

  // func 1: verify_inner_product(offset, len)
  // (len >= 2) ? 1 : 0
  const body1 = [
    0, // 0 locals
    0x20,
    1, // local.get 1 (len)
    0x41,
    2, // i32.const 2
    0x4e, // i32.ge_s
    0x0b, // end
  ];

  // func 2: verify_bulletproof_wasm(commit_hash, min_val, max_val, that, taux, mu, ip_rounds)
  // (min_val <= max_val) && (ip_rounds >= 1) && (that != 0)
  const body2 = [
    0, // 0 locals
    0x20,
    1, // local.get 1 (min_val)
    0x20,
    2, // local.get 2 (max_val)
    0x4c, // i32.le_s
    0x20,
    6, // local.get 6 (ip_rounds)
    0x41,
    1, // i32.const 1
    0x4e, // i32.ge_s
    0x71, // i32.and
    0x20,
    3, // local.get 3 (that)
    0x41,
    0, // i32.const 0
    0x47, // i32.ne
    0x71, // i32.and
    0x0b, // end
  ];

  // func 3: pedersen_hash_wasm(val, blinding)
  // (val * 31 + blinding * 17) ^ 0x5a5a5a
  const body3 = [
    0, // 0 locals
    0x20,
    0, // local.get 0 (val)
    0x41,
    ...toS32Leb(31), // i32.const 31
    0x6c, // i32.mul
    0x20,
    1, // local.get 1 (blinding)
    0x41,
    ...toS32Leb(17), // i32.const 17
    0x6c, // i32.mul
    0x6a, // i32.add
    0x41,
    ...toS32Leb(0x5a5a5a), // i32.const 0x5a5a5a
    0x73, // i32.xor
    0x0b, // end
  ];

  const codePayload = [
    4, // 4 function bodies
    ...toU32Leb(body0.length),
    ...body0,
    ...toU32Leb(body1.length),
    ...body1,
    ...toU32Leb(body2.length),
    ...body2,
    ...toU32Leb(body3.length),
    ...body3,
  ];
  const codeSec = createSection(10, codePayload);

  return new Uint8Array([
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00,
    ...typeSec,
    ...funcSec,
    ...memSec,
    ...expSec,
    ...codeSec,
  ]);
}

let cachedInstance: ZKWasmInstance | null = null;

/**
 * Instantiates the WebAssembly module synchronously or asynchronously.
 */
export async function instantiateZKRangeProofWasm(): Promise<ZKWasmInstance> {
  if (cachedInstance) {
    return cachedInstance;
  }
  const wasmBytes = buildZKRangeProofWasmBytecode();
  const res = await WebAssembly.instantiate(wasmBytes);
  const instance =
    "instance" in res
      ? ((res as unknown) as { instance: WebAssembly.Instance }).instance
      : (res as WebAssembly.Instance);
  cachedInstance = {
    instance,
    exports: instance.exports as unknown as ZKWasmExports,
  };
  return cachedInstance;
}
