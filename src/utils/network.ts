const CONTRACT_ADDRESSES = {
  network: {
    // replace these values with your real network settings
    chainId: 1046,
    chainName: "Stellar",
    rpcUrl: "https://relay.awakening.xlmscan.com",
    blockExplorer: "https://explorer.stellar.network",
  },
};

export const switchToStellarNetwork = async () => {
  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: `0x${CONTRACT_ADDRESSES.network.chainId.toString(16)}`,
          chainName: CONTRACT_ADDRESSES.network.chainName,
          rpcUrls: [CONTRACT_ADDRESSES.network.rpcUrl],
          blockExplorerUrls: [CONTRACT_ADDRESSES.network.blockExplorer],
          nativeCurrency: {
            name: "XLM",
            symbol: "XLM",
            decimals: 18,
          },
        },
      ],
    });
    return true;
  } catch (error) {
    console.error("Error adding Stellar network:", error);
    return false;
  }
};
