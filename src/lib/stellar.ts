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
      "Freighter wallet is not detected. Please install the Freighter browser extension from https://www.freighter.app/",
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
 * 5. Signs transaction via Freighter wallet extension.
 * 6. Submits to Soroban RPC and polls ledger until confirmed.
 */
export async function invokeSorobanMethod(
  callerAddress: string,
  methodName: string,
  scValArgs: xdr.ScVal[],
  contractIdOverride?: string,
): Promise<SorobanInvokeResult> {
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

  // 6. Sign transaction via Freighter extension
  const signResult = await signFreighterTransaction(preparedTx.toXDR(), {
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
  });

  if (
    !signResult ||
    (typeof signResult === "object" && "error" in signResult && signResult.error)
  ) {
    const errMsg = (signResult as any)?.error || "User declined transaction in Freighter.";
    throw new Error(errMsg);
  }

  const signedXdr =
    typeof signResult === "string"
      ? signResult
      : (signResult as any).signedTxXdr || (signResult as any).signedXdr;

  if (!signedXdr) {
    throw new Error("No signed transaction XDR returned from Freighter.");
  }

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
 * Function signature: create_campaign(advertiser: Address, commission_rate: u32, clearing_period: u32, budget: i128) -> u32
 */
export async function createCampaignContractCall(
  advertiserAddress: string,
  commissionRatePercent: number,
  clearingPeriodSecs: number,
  budgetXlm: number,
): Promise<{ success: boolean; campaignId: number; txHash: string }> {
  // Convert XLM to stroops (1 XLM = 10^7 stroops)
  const budgetStroops = BigInt(Math.floor(budgetXlm * 1e7));
  const rateBasisPoints = Math.floor(commissionRatePercent * 100);

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(rateBasisPoints, { type: "u32" }),
    nativeToScVal(clearingPeriodSecs, { type: "u32" }),
    nativeToScVal(budgetStroops, { type: "i128" }),
  ];

  const result = await invokeSorobanMethod(advertiserAddress, "create_campaign", args);
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
 * Function signature: log_sale(advertiser: Address, campaign_id: u32, affiliate: Address, amount: i128) -> ()
 */
export async function logSaleContractCall(
  advertiserAddress: string,
  campaignId: number,
  affiliateAddress: string,
  saleAmountXlm: number,
): Promise<{ success: boolean; txHash: string }> {
  const amountStroops = BigInt(Math.floor(saleAmountXlm * 1e7));

  const args: xdr.ScVal[] = [
    new Address(advertiserAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
    new Address(affiliateAddress).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
  ];

  const result = await invokeSorobanMethod(advertiserAddress, "log_sale", args);
  return {
    success: true,
    txHash: result.txHash,
  };
}

/**
 * Claims cleared affiliate commission from escrow.
 * Function signature: claim_payout(affiliate: Address, campaign_id: u32) -> ()
 */
export async function claimPayoutContractCall(
  affiliateAddress: string,
  campaignId: number,
): Promise<{ success: boolean; txHash: string }> {
  const args: xdr.ScVal[] = [
    new Address(affiliateAddress).toScVal(),
    nativeToScVal(campaignId, { type: "u32" }),
  ];

  const result = await invokeSorobanMethod(affiliateAddress, "claim_payout", args);
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
