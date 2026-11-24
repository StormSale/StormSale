/**
 * Stellar Wallet Kit Multi-Wallet Connector State Machine
 * Coordinates connection lifecycles, user-initiated disconnections,
 * rejections, auto-reconnection, and account switching events across
 * Freighter, xBull, Albedo, Hana, and WalletConnect.
 */

export type WalletConnectionState =
  "idle" | "connecting" | "connected" | "disconnecting" | "disconnected";

export type SupportedWalletType = "freighter" | "xbull" | "albedo" | "hana" | "walletconnect";

export interface WalletSession {
  walletType: SupportedWalletType;
  address: string;
  sessionToken: string;
  network?: string;
  connectedAt: number;
  expiresAt?: number;
}

export interface WalletConnectorContext {
  state: WalletConnectionState;
  walletType: SupportedWalletType | null;
  address: string | null;
  network: string;
  error: string | null;
  session: WalletSession | null;
}

export type StateChangeHandler = (
  state: WalletConnectionState,
  context: WalletConnectorContext,
) => void;

export type AccountChangeHandler = (newAddress: string) => void;
export type DisconnectHandler = (reason?: string) => void;

export const WALLET_SESSION_STORAGE_KEY = "stormsale_stellar_wallet_session";

export interface WalletAdapter {
  id: SupportedWalletType;
  name: string;
  isAvailable: () => Promise<boolean> | boolean;
  connect: () => Promise<{ address: string; network?: string }>;
  disconnect?: () => Promise<void> | void;
  onAccountChange?: (handler: (newAddress: string) => void) => () => void;
  onDisconnect?: (handler: (reason?: string) => void) => () => void;
}

export class StellarWalletConnectorStateMachine {
  private state: WalletConnectionState = "idle";
  private activeWalletType: SupportedWalletType | null = null;
  private activeAddress: string | null = null;
  private activeNetwork: string = "TESTNET";
  private activeSession: WalletSession | null = null;
  private lastError: string | null = null;

  private stateListeners: Set<StateChangeHandler> = new Set();
  private accountListeners: Set<AccountChangeHandler> = new Set();
  private disconnectListeners: Set<DisconnectHandler> = new Set();

  private registeredAdapters: Map<SupportedWalletType, WalletAdapter> = new Map();
  private activeAdapterCleanup: (() => void)[] = [];
  private kitInstance: any = null;

  constructor(options?: { kit?: any; initialNetwork?: string; autoRestore?: boolean }) {
    if (options?.kit) {
      this.kitInstance = options.kit;
    }
    if (options?.initialNetwork) {
      this.activeNetwork = options.initialNetwork;
    }

    if (options?.autoRestore !== false) {
      this.restoreSessionFromStorage();
    }
  }

  // ---------------------------------------------------------------------------
  // Adapter Registration
  // ---------------------------------------------------------------------------

  public registerAdapter(adapter: WalletAdapter): void {
    this.registeredAdapters.set(adapter.id, adapter);
  }

  public setStellarWalletsKit(kit: any): void {
    this.kitInstance = kit;
  }

  // ---------------------------------------------------------------------------
  // State Accessors
  // ---------------------------------------------------------------------------

  public getState(): WalletConnectionState {
    return this.state;
  }

  public getContext(): WalletConnectorContext {
    return {
      state: this.state,
      walletType: this.activeWalletType,
      address: this.activeAddress,
      network: this.activeNetwork,
      error: this.lastError,
      session: this.activeSession,
    };
  }

  public getAddress(): string | null {
    return this.activeAddress;
  }

  public getWalletType(): SupportedWalletType | null {
    return this.activeWalletType;
  }

  public isConnected(): boolean {
    return this.state === "connected" && Boolean(this.activeAddress);
  }

  // ---------------------------------------------------------------------------
  // Subscription Handlers
  // ---------------------------------------------------------------------------

  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateListeners.add(handler);
    handler(this.state, this.getContext());
    return () => this.stateListeners.delete(handler);
  }

  public onAccountChange(handler: AccountChangeHandler): () => void {
    this.accountListeners.add(handler);
    return () => this.accountListeners.delete(handler);
  }

  public onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectListeners.add(handler);
    return () => this.disconnectListeners.delete(handler);
  }

  private transitionTo(newState: WalletConnectionState, error: string | null = null): void {
    this.state = newState;
    this.lastError = error;
    const ctx = this.getContext();
    this.stateListeners.forEach((listener) => {
      try {
        listener(newState, ctx);
      } catch (e) {
        console.error("Error in wallet state listener:", e);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Connects to a supported wallet adapter (freighter, xbull, albedo, hana, walletconnect).
   * Transitions: idle -> connecting -> connected (or idle on error/rejection).
   */
  public async connect(walletType: SupportedWalletType): Promise<string> {
    if (this.state === "connecting") {
      throw new Error(`Already connecting to ${this.activeWalletType || walletType}`);
    }

    this.activeWalletType = walletType;
    this.transitionTo("connecting");

    try {
      let address: string = "";
      let network: string = this.activeNetwork;

      // 1. If StellarWalletsKit instance exists, delegate to it
      if (this.kitInstance) {
        if (typeof this.kitInstance.setWallet === "function") {
          await this.kitInstance.setWallet(walletType);
        }
        if (typeof this.kitInstance.getPublicKey === "function") {
          address = await this.kitInstance.getPublicKey();
        } else if (typeof this.kitInstance.connect === "function") {
          const res = await this.kitInstance.connect();
          address = typeof res === "string" ? res : res.address || res.publicKey;
        }
      }
      // 2. Otherwise check custom registered adapter
      else if (this.registeredAdapters.has(walletType)) {
        const adapter = this.registeredAdapters.get(walletType)!;
        const isAvail = await adapter.isAvailable();
        if (!isAvail) {
          throw new Error(`${adapter.name} extension or wallet is not available.`);
        }
        const res = await adapter.connect();
        address = res.address;
        if (res.network) network = res.network;

        // Wire event listeners from adapter
        if (adapter.onAccountChange) {
          const unbind = adapter.onAccountChange((newAddress) => {
            this.handleAccountSwitch(newAddress);
          });
          this.activeAdapterCleanup.push(unbind);
        }

        if (adapter.onDisconnect) {
          const unbind = adapter.onDisconnect((reason) => {
            this.handleUnexpectedDisconnect(reason);
          });
          this.activeAdapterCleanup.push(unbind);
        }
      }
      // 3. Fallback to direct window / API resolution
      else {
        address = await this.connectDirectAdapter(walletType);
      }

      if (!address || typeof address !== "string") {
        throw new Error(`Failed to retrieve public key from ${walletType}`);
      }

      this.activeAddress = address;
      this.activeNetwork = network;

      // Generate and persist valid session
      const session: WalletSession = {
        walletType,
        address,
        sessionToken: this.generateSessionToken(address, walletType),
        network,
        connectedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      };
      this.activeSession = session;
      this.saveSessionToStorage(session);

      this.transitionTo("connected");
      return address;
    } catch (err: any) {
      const errMsg = this.classifyWalletError(err, walletType);
      this.activeWalletType = null;
      this.activeAddress = null;
      this.activeSession = null;
      this.transitionTo("idle", errMsg);
      throw new Error(errMsg, { cause: err });
    }
  }

  /**
   * Disconnects current wallet connection.
   * Transitions: connected -> disconnecting -> disconnected.
   */
  public async disconnect(reason: string = "User initiated disconnect"): Promise<void> {
    if (this.state === "disconnected" || this.state === "idle") {
      return;
    }

    this.transitionTo("disconnecting");

    try {
      // 1. StellarWalletsKit disconnect
      if (this.kitInstance && typeof this.kitInstance.disconnect === "function") {
        await this.kitInstance.disconnect();
      }

      // 2. Custom adapter disconnect
      if (this.activeWalletType && this.registeredAdapters.has(this.activeWalletType)) {
        const adapter = this.registeredAdapters.get(this.activeWalletType);
        if (adapter?.disconnect) {
          await adapter.disconnect();
        }
      }
    } catch (e) {
      console.warn("Adapter disconnect error (ignored):", e);
    } finally {
      this.cleanupActiveListeners();
      this.clearSessionFromStorage();

      this.activeAddress = null;
      this.activeWalletType = null;
      this.activeSession = null;

      this.transitionTo("disconnected");

      this.disconnectListeners.forEach((listener) => {
        try {
          listener(reason);
        } catch (e) {
          console.error("Error in disconnect listener:", e);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Account Switching & Unexpected Disconnect Events
  // ---------------------------------------------------------------------------

  public handleAccountSwitch(newAddress: string): void {
    if (!newAddress || newAddress === this.activeAddress) return;

    this.activeAddress = newAddress;
    if (this.activeSession) {
      this.activeSession.address = newAddress;
      this.activeSession.sessionToken = this.generateSessionToken(
        newAddress,
        this.activeSession.walletType,
      );
      this.saveSessionToStorage(this.activeSession);
    }

    // Notify state listeners of updated context
    this.transitionTo(this.state);

    // Emit account change event
    this.accountListeners.forEach((listener) => {
      try {
        listener(newAddress);
      } catch (e) {
        console.error("Error in account change listener:", e);
      }
    });
  }

  public handleUnexpectedDisconnect(reason: string = "Unexpected wallet disconnect"): void {
    if (this.state === "disconnected" || this.state === "idle") return;

    this.cleanupActiveListeners();
    this.clearSessionFromStorage();

    this.activeAddress = null;
    this.activeWalletType = null;
    this.activeSession = null;

    this.transitionTo("disconnected", reason);

    this.disconnectListeners.forEach((listener) => {
      try {
        listener(reason);
      } catch (e) {
        console.error("Error in disconnect listener:", e);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Storage & Auto-Reconnection
  // ---------------------------------------------------------------------------

  public restoreSessionFromStorage(): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;

    try {
      const raw = window.localStorage.getItem(WALLET_SESSION_STORAGE_KEY);
      if (!raw) return false;

      const session: WalletSession = JSON.parse(raw);
      if (!session || !session.address || !session.walletType || !session.sessionToken) {
        this.clearSessionFromStorage();
        return false;
      }

      // Check expiration
      if (session.expiresAt && Date.now() > session.expiresAt) {
        this.clearSessionFromStorage();
        return false;
      }

      // Valid session restored
      this.activeSession = session;
      this.activeAddress = session.address;
      this.activeWalletType = session.walletType;
      if (session.network) this.activeNetwork = session.network;

      this.transitionTo("connected");
      return true;
    } catch {
      this.clearSessionFromStorage();
      return false;
    }
  }

  private saveSessionToStorage(session: WalletSession): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn("Failed to persist wallet session:", e);
    }
  }

  private clearSessionFromStorage(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup error
    }
  }

  private generateSessionToken(address: string, walletType: string): string {
    return `sess_${walletType}_${address.slice(0, 8)}_${Date.now()}`;
  }

  private cleanupActiveListeners(): void {
    while (this.activeAdapterCleanup.length > 0) {
      const unbind = this.activeAdapterCleanup.pop();
      try {
        unbind?.();
      } catch {
        // Ignore unbind error
      }
    }
  }

  private classifyWalletError(err: any, walletType: SupportedWalletType): string {
    const msg = String(err?.message || err || "").toLowerCase();

    // User denial / rejection
    if (
      msg.includes("denied") ||
      msg.includes("reject") ||
      msg.includes("cancel") ||
      msg.includes("declined") ||
      msg.includes("not allowed") ||
      msg.includes("user closed") ||
      msg.includes("condition of use not satisfied")
    ) {
      return `User denied connection request in ${walletType} wallet popup.`;
    }

    // Not installed / not detected
    if (msg.includes("not installed") || msg.includes("not detected") || msg.includes("missing")) {
      return `${walletType} wallet is not installed or detected in your browser.`;
    }

    return err?.message || `Failed to connect to ${walletType} wallet.`;
  }

  private async connectDirectAdapter(walletType: SupportedWalletType): Promise<string> {
    if (walletType === "freighter") {
      const freighter = (window as any).freighterApi || (window as any).freighter;
      if (!freighter) throw new Error("freighter is not detected");
      if (typeof freighter.isConnected === "function") {
        const isConn = await freighter.isConnected();
        if (!isConn) throw new Error("freighter is not installed");
      }
      if (typeof freighter.requestAccess === "function") {
        const res = await freighter.requestAccess();
        if (res?.error) throw new Error(res.error);
      }
      const addrRes = await freighter.getPublicKey();
      return typeof addrRes === "string" ? addrRes : addrRes?.address || addrRes?.publicKey;
    }

    if (walletType === "xbull") {
      const xbull = (window as any).xBullSDK || (window as any).xbull;
      if (!xbull) throw new Error("xbull is not installed");
      return await xbull.getPublicKey();
    }

    if (walletType === "hana") {
      const hana = (window as any).hanaWallet || (window as any).hana;
      if (!hana) throw new Error("hana is not installed");
      return await hana.getPublicKey();
    }

    throw new Error(`No adapter available for ${walletType}`);
  }
}
