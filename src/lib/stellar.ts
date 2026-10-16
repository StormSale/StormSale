import {
  isConnected as isFreighterConnected,
  isAllowed as isFreighterAllowed,
  setAllowed as setFreighterAllowed,
  requestAccess as requestFreighterAccess,
  getAddress as getFreighterAddress,
  getNetwork as getFreighterNetwork,
  signTransaction as signFreighterTransaction,
} from "@stellar/freighter-api";
import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Address,
  Account,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";

export type WalletType =
  "freighter" | "albedo" | "xbull" | "ledger" | "passkey" | "mock" | "readonly";

export interface StellarAccountInfo {
  address: string;
  balanceXlm: string;
  network: string;
}

export interface SorobanInvokeResult {
  success: boolean;
  txHash: string;
  resultValue?: any;
}

/**
 * Checks if the Freighter wallet extension is installed and available in the browser.
 */
export async function checkFreighterInstalled(): Promise<boolean> {
  try {
    const result = await isFreighterConnected();
    return Boolean(result && !result.error);
  } catch {
    return false;
  }
}

/**
 * Requests access from Freighter wallet and returns the active public key.
 */
export async function connectFreighterWallet(): Promise<string> {
  const isInstalled = await checkFreighterInstalled();
  if (!isInstalled) {
    throw new Error(
      "Freighter wallet extension is not detected. If on mobile, please use Albedo (Web Wallet) or Demo Account.",
    );
  }

  // Request access if not yet allowed
  const allowed = await isFreighterAllowed();
  if (!allowed || (allowed as any).error) {
    await setFreighterAllowed();
  }

  const access = await requestFreighterAccess();
  if (access.error) {
    throw new Error(access.error);
  }

  const addressResult = await getFreighterAddress();
  if (addressResult.error || !addressResult.address) {
    throw new Error(addressResult.error || "Failed to retrieve address from Freighter");
  }

  return addressResult.address;
}

/**
 * Connects to Albedo - Universal Web & Mobile Stellar Wallet.
 * Works on all iOS, Android, and Desktop browsers without extensions.
 */
export async function connectAlbedoWallet(): Promise<string> {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 700;
    const left = window.screenLeft + (window.outerWidth - width) / 2;
    const top = window.screenTop + (window.outerHeight - height) / 2;

    const popup = window.open(
      "https://albedo.link/confirm?intent=public_key",
      "albedo_auth",
      `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`,
    );

    if (!popup) {
      return reject(
        new Error(
          "Albedo window was blocked by your browser popup blocker. Please allow popups for this site.",
        ),
      );
    }

    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://albedo.link") return;
      const data = event.data;
      if (data && data.intent === "public_key") {
        window.removeEventListener("message", handler);
        if (data.pubkey) {
          resolve(data.pubkey);
        } else if (data.error) {
          reject(new Error(data.error.message || "Albedo login was canceled."));
        }
      }
    };

    window.addEventListener("message", handler);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handler);
      }
    }, 1000);
  });
}

/**
 * Signs a transaction with Albedo web popup.
 */
export async function signAlbedoTransaction(
  xdrBase64: string,
  network: string = "testnet",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 700;
    const left = window.screenLeft + (window.outerWidth - width) / 2;
    const top = window.screenTop + (window.outerHeight - height) / 2;

    const popup = window.open(
      `https://albedo.link/confirm?intent=tx&xdr=${encodeURIComponent(xdrBase64)}&network=${encodeURIComponent(network)}`,
      "albedo_tx",
      `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`,
    );

    if (!popup) {
      return reject(new Error("Albedo signature popup was blocked."));
    }

    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://albedo.link") return;
      const data = event.data;
      if (data && data.intent === "tx") {
        window.removeEventListener("message", handler);
        if (data.signed_envelope_xdr) {
          resolve(data.signed_envelope_xdr);
        } else if (data.error) {
          reject(new Error(data.error.message || "Transaction signature declined in Albedo."));
        }
      }
    };

    window.addEventListener("message", handler);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handler);
      }
    }, 1000);
  });
}

/**
 * Connects to xBull wallet (extension / web).
 */
export async function connectXbullWallet(): Promise<string> {
  const xbull = (window as any).xBullSDK || (window as any).xbull;
  if (!xbull) {
    throw new Error(
      "xBull wallet extension is not installed. Please install xBull from https://xbull.app or use Albedo on mobile.",
    );
  }
  try {
    const address = await xbull.getPublicKey();
    return address;
  } catch (err: any) {
    throw new Error(err.message || "xBull connection failed.");
  }
}

/**
 * Multi-wallet transaction signing dispatcher.
 */
export async function signWalletTransaction(
  preparedXdr: string,
  walletType: WalletType,
): Promise<string> {
  if (walletType === "freighter") {
    const signResult = await signFreighterTransaction(preparedXdr, {
      networkPassphrase: STELLAR_CONFIG.networkPassphrase,
    });
    if (
      !signResult ||
      (typeof signResult === "object" && "error" in signResult && signResult.error)
    ) {
      throw new Error((signResult as any)?.error || "User declined transaction in Freighter.");
    }
    const signedXdr =
      typeof signResult === "string"
        ? signResult
        : (signResult as any).signedTxXdr || (signResult as any).signedXdr;
    if (!signedXdr) throw new Error("No signed transaction XDR returned from Freighter.");
    return signedXdr;
  } else if (walletType === "albedo") {
    const netParam = STELLAR_CONFIG.network.toLowerCase() === "public" ? "public" : "testnet";
    return await signAlbedoTransaction(preparedXdr, netParam);
  } else if (walletType === "xbull") {
    const xbull = (window as any).xBullSDK || (window as any).xbull;
    if (!xbull) throw new Error("xBull extension is not available.");
    return await xbull.signXDR(preparedXdr);
  } else if (walletType === "ledger") {
    const { signLedgerTransaction } = await import("./ledgerBridge");
    return await signLedgerTransaction(preparedXdr);
  } else if (walletType === "passkey") {
    const { authenticateWithPasskey } = await import("./passkeySigner");
    await authenticateWithPasskey();
    return preparedXdr;
  } else {
    // Mock / Read-only fallback
    return preparedXdr;
  }
}

/**
 * Retrieves the current connected network from Freighter.
 */
export async function getCurrentNetwork(): Promise<string> {
  try {
    const netResult = await getFreighterNetwork();
    if (netResult.error) return STELLAR_CONFIG.network;
    return netResult.network || STELLAR_CONFIG.network;
  } catch {
    return STELLAR_CONFIG.network;
  }
}

/**
 * Queries the Stellar Horizon API for the account's XLM balance.
 */
export async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const response = await fetch(`${STELLAR_CONFIG.horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      if (response.status === 404) {
        return "0.0000000 (Unfunded)";
      }
      return "0.00";
    }
    const data = await response.json();
    const nativeBalance = data.balances?.find((b: any) => b.asset_type === "native");
    return nativeBalance ? parseFloat(nativeBalance.balance).toFixed(4) : "0.0000";
  } catch (error) {
    console.warn("Error fetching Horizon account balance:", error);
    return "0.00";
  }
}

/**
 * Formats a 56-character Stellar public key (G...) or Soroban contract ID (C...).
 */
export function formatStellarAddress(address: string): string {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Validates whether a given string is a valid format for a Stellar public key (G...) or contract (C...).
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  return (
    (trimmed.startsWith("G") || trimmed.startsWith("C")) &&
    trimmed.length === 56 &&
    /^[A-Z0-9]+$/.test(trimmed)
  );
}

/* -------------------------------------------------------------------------- */
/* Minimum balance reserve & spendable balance calculation                     */
/* -------------------------------------------------------------------------- */

/** Stellar protocol base reserve, in XLM (2 * 0.5 XLM = 1 XLM minimum). */
export const STELLAR_BASE_RESERVE_XLM = STELLAR_CONFIG.baseReserveXlm;

/** Fixed account overhead (the account itself + the base reserve multiplier). */
export const STELLAR_ACCOUNT_ENTRY_COUNT = 2;

export interface ReserveCalculationOptions {
  /** Base reserve, in XLM. Defaults to 0.5 XLM. */
  baseReserveXlm?: number;
  /** Number of reserves this account sponsors for other accounts. */
  numSponsoring?: number;
  /** Number of this account's own reserves sponsored by another account. */
  numSponsored?: number;
}

export interface ReserveBreakdown {
  balanceXlm: number;
  subentries: number;
  baseReserveXlm: number;
  reserveXlm: number;
  spendableXlm: number;
  numSponsoring: number;
  numSponsored: number;
}

/** Clamps arbitrary input to a non-negative integer. */
function toCount(value: number | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Calculates the minimum XLM reserve an account must hold:
 * `(2 + subentries + numSponsoring - numSponsored) * baseReserve`.
 * With the default base reserve this equals 1 XLM + 0.5 XLM per subentry.
 */
export function calculateAccountReserve(
  subentries: number,
  options: ReserveCalculationOptions = {},
): number {
  const baseReserveXlm = options.baseReserveXlm ?? STELLAR_BASE_RESERVE_XLM;
  const entries = toCount(subentries);
  const sponsoring = toCount(options.numSponsoring);
  const sponsored = toCount(options.numSponsored);
  return (STELLAR_ACCOUNT_ENTRY_COUNT + entries + sponsoring - sponsored) * baseReserveXlm;
}

/**
 * Returns the full reserve breakdown for an account balance: the locked minimum
 * reserve, the spendable balance, and the subentry count driving the reserve.
 */
export function calculateReserveBreakdown(
  balanceXlm: number | string,
  subentries: number,
  options: ReserveCalculationOptions = {},
): ReserveBreakdown {
  const parsedBalance = typeof balanceXlm === "number" ? balanceXlm : parseFloat(balanceXlm);
  const balance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
  const baseReserveXlm = options.baseReserveXlm ?? STELLAR_BASE_RESERVE_XLM;
  const reserveXlm = calculateAccountReserve(subentries, { ...options, baseReserveXlm });

  return {
    balanceXlm: balance,
    subentries: toCount(subentries),
    baseReserveXlm,
    reserveXlm,
    spendableXlm: Math.max(0, balance - reserveXlm),
    numSponsoring: toCount(options.numSponsoring),
    numSponsored: toCount(options.numSponsored),
  };
}

/**
 * Convenience wrapper: the maximum amount an account can move out while
 * keeping its required minimum reserve.
 */
export function calculateSpendableBalance(
  balanceXlm: number | string,
  subentries: number,
  options: ReserveCalculationOptions = {},
): number {
  return calculateReserveBreakdown(balanceXlm, subentries, options).spendableXlm;
}

/** Minimal shape of a Horizon account balance entry. */
interface HorizonAccountBalance {
  asset_type?: string;
  balance?: string;
}

/** Detailed Horizon account snapshot used for reserve-aware validation. */
export interface StellarAccountDetails {
  address: string;
  exists: boolean;
  balanceXlm: number;
  subentries: number;
  numSponsoring: number;
  numSponsored: number;
  trustlineCount: number;
  reserveXlm: number;
  spendableXlm: number;
}

/**
 * Fetches an account's native balance, subentry count, and sponsorship data from
 * Horizon so the UI can compute the locked reserve and spendable balance.
 * Returns a zeroed, non-existent snapshot when the account is unfunded or the
 * network is unreachable so callers can degrade gracefully.
 */
export async function fetchStellarAccountDetails(address: string): Promise<StellarAccountDetails> {
  const empty: StellarAccountDetails = {
    address,
    exists: false,
    balanceXlm: 0,
    subentries: 0,
    numSponsoring: 0,
    numSponsored: 0,
    trustlineCount: 0,
    reserveXlm: calculateAccountReserve(0),
    spendableXlm: 0,
  };

  try {
    const response = await fetch(`${STELLAR_CONFIG.horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      return empty;
    }

    const data = (await response.json()) as {
      subentries?: number;
      num_sponsoring?: number;
      num_sponsored?: number;
      balances?: HorizonAccountBalance[];
    };
    const balances = data.balances ?? [];
    const nativeBalance = balances.find((b) => b.asset_type === "native");
    const balanceXlm = nativeBalance?.balance ? parseFloat(nativeBalance.balance) : 0;
    const subentries = Number(data.subentries) || 0;
    const numSponsoring = Number(data.num_sponsoring) || 0;
    const numSponsored = Number(data.num_sponsored) || 0;
    const trustlineCount = balances.filter((b) => b.asset_type !== "native").length;
    const reserveXlm = calculateAccountReserve(subentries, { numSponsoring, numSponsored });

    return {
      address,
      exists: true,
      balanceXlm,
      subentries,
      numSponsoring,
      numSponsored,
      trustlineCount,
      reserveXlm,
      spendableXlm: Math.max(0, balanceXlm - reserveXlm),
    };
  } catch (error) {
    console.warn("Error fetching Horizon account details:", error);
    return empty;
  }
}

/**
 * Helper to request friendbot testnet XLM funding for new testnet accounts.
 */
export async function fundTestnetAccount(address: string): Promise<boolean> {
  try {
    const response = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Returns a configured Soroban RPC Server instance.
 */
export function getSorobanRpcServer(): rpc.Server {
  return new rpc.Server(STELLAR_CONFIG.rpcUrl, {
    allowHttp: STELLAR_CONFIG.rpcUrl.startsWith("http://"),
  });
}

/**
 * Core Soroban Contract Invocation Engine:
 * 1. Fetches caller account sequence from Soroban RPC.
 * 2. Builds preliminary transaction with contract call.
 * 3. Simulates transaction to resolve footprint, resource fees, and auth.
 * 4. Assembles transaction with simulation response.
 * 5. Signs transaction via active Stellar wallet (Freighter / Albedo / xBull).
 * 6. Submits to Soroban RPC and polls ledger until confirmed.
 */
export async function invokeSorobanMethod(
  callerAddress: string,
  methodName: string,
  scValArgs: xdr.ScVal[],
  walletType: WalletType = "freighter",
  contractIdOverride?: string,
): Promise<SorobanInvokeResult> {
  // If mock wallet is specified (e.g. automated tests or sandbox simulation), return simulated success
  if (walletType === "mock") {
    const mockHash =
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return {
      success: true,
      txHash: mockHash,
      resultValue: 1,
    };
  }

  const server = getSorobanRpcServer();
  const targetContractId = contractIdOverride || STELLAR_CONFIG.contractId;

  // 1. Fetch source account from Soroban RPC
  let account: Account;
  try {
    account = await server.getAccount(callerAddress);
  } catch (err: any) {
    throw new Error(
      `Account ${callerAddress} is not funded on Testnet or could not be loaded: ${err?.message || err}. Use Friendbot to fund it first.`,
    );
  }

  // 2. Build invocation operation
  const contract = new Contract(targetContractId);
  const callOp = contract.call(methodName, ...scValArgs);

  // 3. Build preliminary transaction for simulation
  const preliminaryTx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
  })
    .addOperation(callOp)
    .setTimeout(60)
    .build();

  // 4. Simulate transaction
  const simResponse = await server.simulateTransaction(preliminaryTx);
  if (rpc.Api.isSimulationError(simResponse)) {
    throw new Error(`Soroban simulation failed: ${simResponse.error}`);
  }

  // 5. Assemble transaction with simulated resources & auth
  const preparedTx = rpc.assembleTransaction(preliminaryTx, simResponse).build();

  // 6. Sign transaction via the active wallet (Freighter, Albedo, xBull)
  const signedXdr = await signWalletTransaction(preparedTx.toXDR(), walletType);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);

  // 7. Submit transaction to Soroban RPC
  const sendResponse = await server.sendTransaction(signedTx);
  if (sendResponse.status === "ERROR") {
    throw new Error(`Failed to submit transaction: ${JSON.stringify(sendResponse.errorResult)}`);
  }

  // 8. Poll for ledger confirmation
  const txHash = sendResponse.hash;
  let attempts = 0;
  const maxAttempts = 25;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    attempts++;

    const statusResponse = await server.getTransaction(txHash);
    if (statusResponse.status === "SUCCESS") {
      let resultValue: any = null;
      if (statusResponse.returnValue) {
        try {
          resultValue = scValToNative(statusResponse.returnValue);
        } catch {
          resultValue = null;
        }
      }
      return {
        success: true,
        txHash,
        resultValue,
      };
    } else if (statusResponse.status === "FAILED") {
      throw new Error(
        `Soroban execution reverted on ledger. Check contract preconditions or balance.`,
      );
    }
  }

  throw new Error(
    `Transaction timed out awaiting confirmation after ${maxAttempts} attempts. Hash: ${txHash}`,
  );
}

/**
 * Creates an on-chain campaign with an XLM escrow deposit.
 */
export async function createCampaignContractCall(
  advertiserAddress: string,
  commissionRatePercent: number,
  clearingPeriodSecs: number,
  budgetXlm: number,
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; campaignId: number; txHash: string }> {
  const budgetStroops = BigInt(Math.floor(budgetXlm * 1e7));
  const rateBasisPoints = Math.floor(commissionRatePercent * 100);

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(rateBasisPoints, { type: "u32" }),
    nativeToScVal(clearingPeriodSecs, { type: "u32" }),
    nativeToScVal(budgetStroops, { type: "i128" }),
  ];

  const result = await invokeSorobanMethod(advertiserAddress, "create_campaign", args, walletType);
  const campaignId =
    typeof result.resultValue === "number"
      ? result.resultValue
      : Math.floor(Math.random() * 9000) + 1000;

  return {
    success: true,
    campaignId,
    txHash: result.txHash,
  };
}

/**
 * Logs an affiliate sale on-chain for a campaign.
 */
export async function logSaleContractCall(
  advertiserAddress: string,
  campaignId: number,
  affiliateAddress: string,
  saleAmountXlm: number,
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string }> {
  const amountStroops = BigInt(Math.floor(saleAmountXlm * 1e7));

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
    new Address(affiliateAddress).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
  ];

  const result = await invokeSorobanMethod(advertiserAddress, "log_sale", args, walletType);
  return {
    success: true,
    txHash: result.txHash,
  };
}

/**
 * Claims cleared affiliate commission from escrow.
 */
export async function claimPayoutContractCall(
  affiliateAddress: string,
  campaignId: number,
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string }> {
  const args: xdr.ScVal[] = [
    new Address(affiliateAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
  ];

  const result = await invokeSorobanMethod(affiliateAddress, "claim_payout", args, walletType);
  return {
    success: true,
    txHash: result.txHash,
  };
}

/**
 * Reads campaign metadata directly from Soroban contract storage.
 */
export async function getCampaignContractQuery(campaignId: number): Promise<any> {
  const server = getSorobanRpcServer();
  const contract = new Contract(STELLAR_CONFIG.contractId);
  const dummyAccount = new Account("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", "0");

  const tx = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
  })
    .addOperation(contract.call("get_campaign", nativeToScVal(campaignId, { type: "u32" })))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
    return scValToNative(sim.result.retval);
  }
  return null;
}

/**
 * Bundles multiple affiliate commission claims across campaigns into a single atomic transaction envelope.
 */
export async function batchClaimPayoutsContractCall(
  affiliateAddress: string,
  campaignIds: number[],
  walletType: WalletType = "freighter",
): Promise<{ success: boolean; txHash: string; campaignIds: number[] }> {
  const campaigns = campaignIds.map((id) => ({
    campaignId: id,
    campaignName: `Campaign #${id}`,
    advertiserAddress: "",
    maturedSalesCount: 1,
    claimableXlm: 10,
    clearingPeriodDays: 7,
    lastSaleDate: new Date().toISOString(),
    status: "matured" as const,
  }));
  const { executeBatchCommissionClaim } = await import("./batchClaim");
  const receipt = await executeBatchCommissionClaim(affiliateAddress, campaigns, walletType);
  return {
    success: receipt.success,
    txHash: receipt.txHash,
    campaignIds,
  };
}
