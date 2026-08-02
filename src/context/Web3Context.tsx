import { createContext, useContext, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import { ethers } from "ethers";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { walletConnectConfig, CHAINS } from "../config/walletConnect";
import { registerUser } from "../utils/api";

// Replace inline ABI arrays with imports from ABI JSON files in the same folder.
// Update filenames below if your ABI files are named differently (e.g. './Factory.json', './factoryABI.json', './Campaign.json', etc).
// The wrapper handles either direct ABI array exports or objects containing { abi: [...] }.
import factoryJson from "../context/AffiliateFactory.json";
import campaignJson from "../context/Campaign.json";

const FACTORY_ABI =
  factoryJson && (factoryJson as any).abi ? (factoryJson as any).abi : (factoryJson as any);
const CAMPAIGN_ABI =
  campaignJson && (campaignJson as any).abi ? (campaignJson as any).abi : (campaignJson as any);

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface Web3ContextType {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  userAddress: string | null;
  userRole: string | null;
  factoryContract: ethers.Contract | null;
  campaignContracts: Map<string, ethers.Contract>;
  connectWallet: (connectorType?: "metamask" | "walletconnect") => Promise<void>;
  disconnectWallet: () => void;
  updateUserRole: (role: string) => Promise<void>;
  getCampaignContract: (address: string) => ethers.Contract;
  switchToStellarNetwork: () => Promise<boolean>;
  isConnected: boolean;
  isStellarNetwork: boolean;
  connectorType: "metamask" | "walletconnect" | null;
}

// Add a ref to ensure WalletConnect init runs only once per component instance
const Web3Context = createContext<Web3ContextType | undefined>(undefined);

// TODO: Add your deployed contract address and ABI
const FACTORY_ADDRESS = "0x573B4bf300b4B5244832fc7A40F64344c999c445";

export function Web3Provider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [factoryContract, setFactoryContract] = useState<ethers.Contract | null>(null);
  const [campaignContracts, setCampaignContracts] = useState<Map<string, ethers.Contract>>(
    new Map(),
  );
  const [isConnected, setIsConnected] = useState(false);
  const [isStellarNetwork, setIsStellarNetwork] = useState(false);
  const [connectorType, setConnectorType] = useState<"metamask" | "walletconnect" | null>(null);
  const [walletConnectProvider, setWalletConnectProvider] = useState<InstanceType<
    typeof EthereumProvider
  > | null>(null);
  const wcInitRef = useRef(false); // <- added: prevents re-init within same mount
  const wcConnectingRef = useRef(false); // <- added: prevents concurrent connect() calls

  // Notification helper
  // Initialize WalletConnect (guarded to avoid double Init() calls)
  useEffect(
    () => {
      let mounted = true;

      const initializeWalletConnect = async () => {
        // prevent repeated initialization in same instance
        if (wcInitRef.current) return;
        wcInitRef.current = true;

        try {
          // reuse existing provider (HMR / StrictMode)
          if ((window as any).__STORMSALE_WC_PROVIDER__) {
            const existing = (window as any).__STORMSALE_WC_PROVIDER__;
            if (mounted) setWalletConnectProvider(existing);
            return;
          }

          const provider = await EthereumProvider.init({
            projectId: walletConnectConfig.projectId,
            chains: [CHAINS.stellar.id],
            showQrModal: true,
            qrModalOptions: {
              themeMode: "dark",
              themeVariables: {
                "--wcm-accent-color": "#10b981",
                "--wcm-accent-fill-color": "#ffffff",
              },
            },
            methods: ["eth_sendTransaction", "personal_sign"],
            events: ["chainChanged", "accountsChanged"],
          });

          // store globally for reuse across mounts / HMR
          (window as any).__STORMSALE_WC_PROVIDER__ = provider;

          if (mounted) setWalletConnectProvider(provider);

          // attach events only once
          if (!(provider as any).__stormsale_events_attached) {
            provider.on("accountsChanged", (accounts: string[]) => {
              if (accounts.length === 0) {
                disconnectWallet();
              } else {
                setUserAddress(accounts[0]);
                registerUser(accounts[0])
                  .then((user) => {
                    if (user && user.role) setUserRole(user.role);
                  })
                  .catch(console.error);
              }
            });

            provider.on("chainChanged", (chainId: string) => {
              console.log("Chain changed:", chainId);
              setIsStellarNetwork(parseInt(chainId, 16) === CHAINS.stellar.id);
            });

            provider.on("disconnect", () => {
              disconnectWallet();
            });

            (provider as any).__stormsale_events_attached = true;
          }
        } catch (error) {
          // keep a clear log but avoid re-initializing repeatedly
          console.error("Error initializing WalletConnect:", error);
        }
      };

      initializeWalletConnect();
      return () => {
        mounted = false;
      };
    },
    [/* intentional: run once */],
  );

  const connectWallet = async (connectorType: "metamask" | "walletconnect" = "metamask") => {
    try {
      if (connectorType === "metamask") {
        await connectMetaMask();
      } else if (connectorType === "walletconnect" && walletConnectProvider) {
        await connectWalletConnect();
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      throw error;
    }
  };

  const connectMetaMask = async () => {
    if (typeof window.ethereum !== "undefined") {
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const newSigner = await newProvider.getSigner();
      const address = await newSigner.getAddress();

      setProvider(newProvider);
      setSigner(newSigner);
      setUserAddress(address);
      setIsConnected(true);
      setConnectorType("metamask");

      registerUser(address)
        .then((user) => {
          if (user && user.role) setUserRole(user.role);
        })
        .catch(console.error);

      // Load contracts after connection
      await loadContracts(newSigner);
    } else {
      throw new Error("Please install MetaMask!");
    }
  };

  // Guarded WalletConnect connect — prevents concurrent connects and reuses session if available
  const connectWalletConnect = async () => {
    if (!walletConnectProvider) {
      throw new Error("WalletConnect not initialized");
    }

    // prevent concurrent connect attempts
    if (wcConnectingRef.current) {
      console.warn("WalletConnect connect already in progress");
      return;
    }

    // quick session check: if already connected, reuse
    const hasSession = Boolean(
      (walletConnectProvider as any).session?.length || (walletConnectProvider as any).connected,
    );
    if (hasSession) {
      try {
        wcConnectingRef.current = true;
        const accounts = (await walletConnectProvider.request({
          method: "eth_accounts",
        })) as string[];
        if (accounts && accounts.length > 0) {
          const newProvider = new ethers.BrowserProvider(walletConnectProvider);
          const newSigner = await newProvider.getSigner();
          const address = accounts[0];

          setProvider(newProvider);
          setSigner(newSigner);
          setUserAddress(address);
          setIsConnected(true);
          setConnectorType("walletconnect");

          registerUser(address)
            .then((user) => {
              if (user && user.role) setUserRole(user.role);
            })
            .catch(console.error);

          await loadContracts(newSigner);
        }
        return;
      } catch (err) {
        console.warn(
          "Existing WalletConnect session check failed, will attempt fresh connect",
          err,
        );
        // fallthrough to fresh connect below
      } finally {
        wcConnectingRef.current = false;
      }
    }

    // perform fresh connect
    (window as any).__STORMSALE_WC_CONNECTING__ = true;
    wcConnectingRef.current = true;
    try {
      await walletConnectProvider.connect();

      const accounts = (await walletConnectProvider.request({
        method: "eth_accounts",
      })) as string[];
      if (accounts && accounts.length > 0) {
        const newProvider = new ethers.BrowserProvider(walletConnectProvider);
        const newSigner = await newProvider.getSigner();
        const address = accounts[0];

        setProvider(newProvider);
        setSigner(newSigner);
        setUserAddress(address);
        setIsConnected(true);
        setConnectorType("walletconnect");

        registerUser(address)
          .then((user) => {
            if (user && user.role) setUserRole(user.role);
          })
          .catch(console.error);

        await loadContracts(newSigner);
      }
    } catch (error) {
      console.error("Error connecting with WalletConnect:", error);
      throw error;
    } finally {
      (window as any).__STORMSALE_WC_CONNECTING__ = false;
      wcConnectingRef.current = false;
    }
  };

  const disconnectWallet = async () => {
    if (connectorType === "walletconnect" && walletConnectProvider) {
      try {
        await walletConnectProvider.disconnect();
      } catch (error) {
        console.error("Error disconnecting WalletConnect:", error);
      }
    }

    setProvider(null);
    setSigner(null);
    setUserAddress(null);
    setFactoryContract(null);
    setCampaignContracts(new Map());
    setIsConnected(false);
    setConnectorType(null);
    setUserRole(null);
  };

  const updateUserRole = async (role: string) => {
    if (!userAddress) return;
    try {
      const user = await registerUser(userAddress, role);
      if (user && user.role) {
        setUserRole(user.role);
      }
    } catch (error) {
      console.error("Failed to update user role:", error);
    }
  };

  const loadContracts = async (currentSigner: ethers.Signer) => {
    try {
      // Load factory contract
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, currentSigner);
      setFactoryContract(factory);
    } catch (error) {
      console.error("Error loading contracts:", error);
    }
  };

  const getCampaignContract = (address: string): ethers.Contract => {
    if (campaignContracts.has(address)) {
      return campaignContracts.get(address)!;
    }

    if (!signer) {
      throw new Error("Signer not available");
    }

    const campaignContract = new ethers.Contract(address, CAMPAIGN_ABI, signer);
    const newCampaignContracts = new Map(campaignContracts);
    newCampaignContracts.set(address, campaignContract);
    setCampaignContracts(newCampaignContracts);

    return campaignContract;
  };

  useEffect(() => {
    // Listen for account changes (MetaMask)
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          connectMetaMask();
        }
      });
    }
  }, []);

  const switchToStellarNetwork = async () => {
    try {
      if (typeof window.ethereum !== "undefined") {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${CHAINS.stellar.id.toString(16)}`,
              chainName: CHAINS.stellar.name,
              rpcUrls: [CHAINS.stellar.rpcUrl],
              blockExplorerUrls: [CHAINS.stellar.blockExplorer],
              nativeCurrency: {
                name: "XLM",
                symbol: "XLM",
                decimals: 18,
              },
            },
          ],
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error switching network:", error);
      return false;
    }
  };

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        userAddress,
        userRole,
        factoryContract,
        campaignContracts,
        connectWallet,
        disconnectWallet,
        updateUserRole,
        getCampaignContract,
        switchToStellarNetwork,
        isConnected,
        isStellarNetwork,
        connectorType,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

// HMR-friendly hook export
export function useWeb3(): Web3ContextType {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
