import { decryptPayload, encryptPayload, generateAESKey, unwrapAESKey, wrapAESKey } from "./crypto";

export type CryptoWorkerOperation =
  "generate-key" | "encrypt" | "decrypt" | "wrap-key" | "unwrap-key";

export interface CryptoWorkerRequest {
  id: number;
  operation: CryptoWorkerOperation;
  payload?: object;
  encryptedPayload?: string;
  key?: CryptoKey;
  wrappedKey?: string;
  identifier?: string;
}

export interface CryptoWorkerResponse {
  id: number;
  result?: CryptoKey | object | string;
  error?: string;
}

export async function handleCryptoWorkerRequest(
  request: CryptoWorkerRequest,
): Promise<CryptoWorkerResponse> {
  try {
    switch (request.operation) {
      case "generate-key":
        return { id: request.id, result: await generateAESKey() };
      case "encrypt":
        if (!request.payload || !request.key) throw new Error("Missing encryption input.");
        return {
          id: request.id,
          result: await encryptPayload(request.payload, request.key),
        };
      case "decrypt":
        if (!request.encryptedPayload || !request.key) {
          throw new Error("Missing decryption input.");
        }
        return {
          id: request.id,
          result: await decryptPayload(request.encryptedPayload, request.key),
        };
      case "wrap-key":
        if (!request.key || !request.identifier) throw new Error("Missing key-wrap input.");
        return {
          id: request.id,
          result: await wrapAESKey(request.key, request.identifier),
        };
      case "unwrap-key":
        if (!request.wrappedKey || !request.identifier) {
          throw new Error("Missing key-unwrap input.");
        }
        return {
          id: request.id,
          result: await unwrapAESKey(request.wrappedKey, request.identifier),
        };
    }
  } catch (error) {
    return {
      id: request.id,
      error: error instanceof Error ? error.message : "Cryptographic operation failed.",
    };
  }
}
