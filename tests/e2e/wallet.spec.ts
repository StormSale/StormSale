import { Page } from '@cypress/test-runner';

// -----------------------------------------------------------------------------
// Mock wallet bridge
// -----------------------------------------------------------------------------
// The app talks to a wallet via a postMessage bridge (window.parent / window.opener).
// We install a deterministic mock bridge before the app boots so the connection
// flow completes without any manual input. The mock responds to the standard
// wallet request methods and emits a connection acknowledgement back to the app.

const MOCK_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const MOCK_CHAIN_ID = '0x1';
const MOCK_WALLET_NAME = 'MockWallet';

type WalletRequest = {
  id?: string | number;
  method: string;
  params?: unknown;
};

type WindowWithMockBridge = Window & {
  __mockWalletBridgeInstalled?: boolean;
  __mockWalletSend?: (request: WalletRequest) => void;
};

function installMockWalletBridge(win: WindowWithMockBridge): void {
  if (win.__mockWalletBridgeInstalled) {
    return;
  }
  win.__mockWalletBridgeInstalled = true;

  const post = (payload: unknown) => {
    // Deliver the payload to the app through the same channel the app listens on.
    win.postMessage(payload, win.location.origin);
  };

  const respond = (id: string | number | undefined, result: unknown) => {
    post({ id, result, jsonrpc: '2.0' });
  };

  const respondError = (id: string | number | undefined, message: string) => {
    post({ id, error: { code: -32000, message }, jsonrpc: '2.0' });
  };

  const handleRequest = (request: WalletRequest): void => {
    switch (request.method) {
      case 'eth_requestAccounts':
        respond(request.id, [MOCK_ADDRESS]);
        break;
      case 'eth_chainId':
        respond(request.id, MOCK_CHAIN_ID);
        break;
      case 'wallet_connect':
        respond(request.id, {
          accounts: [MOCK_ADDRESS],
          chainId: MOCK_CHAIN_ID,
          walletName: MOCK_WALLET_NAME,
        });
        // Emit a connection acknowledgement so the app updates its state.
        post({
          event: 'connect',
          data: { accounts: [MOCK_ADDRESS], chainId: MOCK_CHAIN_ID },
        });
        break;
      case 'personal_sign':
        respond(request.id, '0xmocksignature');
        break;
      default:
        respondError(request.id, `unsupported method: ${request.method}`);
    }
  };

  // Respond to requests the app sends to the bridge.
  win.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as WalletRequest | undefined;
    if (!data || typeof data.method !== 'string') {
      return;
    }
    handleRequest(data);
  });

  // Expose a programmatic entry point so tests can trigger the connect flow.
  win.__mockWalletSend = (request: WalletRequest) => handleRequest(request);
}

async function connectWallet(page: Page): Promise<void> {
  // Trigger the app's connect flow through the mock bridge.
  await page.evaluate(() => {
    const w = window as WindowWithMockBridge;
    if (typeof w.__mockWalletSend !== 'function') {
      throw new Error('Mock wallet bridge is not installed');
    }
    w.__mockWalletSend({
      id: 1,
      method: 'wallet_connect',
      params: { chainId: '0x1' },
    });
  });
}

describe('Wallet Connect E2E', () => {
  beforeEach(() => {
    cy.intercept('**/wallet-bridge**', (req) => {
      // If the app loads a bridge script, serve a non-op script; the mock below
      // provides the actual behaviour.
      req.reply(200, '', { 'Content-Type': 'text/javascript' });
    });

    cy.intercept('**', { middleware: true });

    cy.visit('/', {
      onBeforeLoad: (win) => {
        installMockWalletBridge(win as unknown as WindowWithMockBridge);
      },
    });
  });

  it('connects via mock bridge and enters the dashboard', () => {
    // Assert the app is on the connect screen before connecting.
    cy.contains('button', /connect wallet/i).should('be.visible');

    // Perform the connection through the mock bridge.
    cy.win().then((win) => {
      void win;
      connectWallet(cy.win() as unknown as Page);
    });

    // Verify the connection was acknowledged and the dashboard is reached.
    cy.url().should('include', '/dashboard');
    cy.contains('[data-testid="dashboard"]').should('be.visible');
    cy.contains(MOCK_ADDRESS.slice(0, 6)).should('be.visible');
  });

  it('shows the connected wallet address on the dashboard', () => {
    cy.win().then((win) => {
      void win;
      connectWallet(cy.win() as unknown as Page);
    });

    cy.contains('[data-testid="wallet-address"]')
      .should('contain', MOCK_ADDRESS.slice(0, 6));
  });
});
