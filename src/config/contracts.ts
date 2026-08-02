// Contract addresses on Stellar network
export const CONTRACT_ADDRESSES = {
  // REPLACE WITH YOUR ACTUAL DEPLOYED ADDRESSES
  AFFILIATE_FACTORY: "0x573B4bf300b4B5244832fc7A40F64344c999c445",
  XLM_TOKEN: "0x2477C1Cf9a36845b793602Ac949C8fB15Dd802ef",

  // Optional: Add any pre-deployed campaign addresses
  SAMPLE_CAMPAIGN: "0xYourCampaignAddressHere",
};

// Stellar Network Configuration
export const STELLAR_NETWORK = {
  chainId: 1046, // Replace with actual Stellar chain ID
  chainName: "Stellar Testnet",
  nativeCurrency: {
    name: "XLM",
    symbol: "XLM",
    decimals: 18,
  },
  rpcUrls: ["https://relay.awakening.xlmscan.com"], // Replace with actual RPC
  blockExplorerUrls: ["https://explorer.stellar.network"], // Replace with actual explorer
};

// WalletConnect Configuration
export const WALLETCONNECT_CONFIG = {
  projectId: "79aaf32eee7f421c29f132a4c3f1e5f6", // From walletconnect.com
  metadata: {
    name: "StormSale",
    description: "Secure Web3 Affiliate Platform on Stellar",
    url: "https://yourdomain.com",
    icons: ["https://yourdomain.com/logo.png"],
  },
};
