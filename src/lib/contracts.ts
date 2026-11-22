export function getContractAddress(passphrase: string): string {
  if (passphrase.includes("Test")) {
    return "C_TESTNET_CONTRACT_ADDRESS_1234567890";
  }
  return "C_MAINNET_CONTRACT_ADDRESS_1234567890";
}

export function isValidStellarAddress(address: string): boolean {
  return typeof address === "string" && address.length >= 10;
}
