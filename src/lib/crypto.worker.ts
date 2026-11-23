import {
  handleCryptoWorkerRequest,
  type CryptoWorkerRequest,
  type CryptoWorkerResponse,
} from "./cryptoWorkerProtocol";

interface CryptoWorkerScope {
  onmessage: ((event: MessageEvent<CryptoWorkerRequest>) => void) | null;
  postMessage(message: CryptoWorkerResponse): void;
}

const workerScope = globalThis as unknown as CryptoWorkerScope;

workerScope.onmessage = (event) => {
  void handleCryptoWorkerRequest(event.data).then((response) => {
    workerScope.postMessage(response);
  });
};
