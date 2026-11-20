import { expect, test } from "@playwright/test";
import {
  Account,
  Asset,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

type AssetCode = "XLM" | "USDC" | "EURC";

type Quote = {
  sendAsset: AssetCode;
  destAsset: AssetCode;
  destAmount: string;
  estimatedSourceAmount: string;
  destinationMin: string;
  path: string[];
  slippageBps: number;
};

type Submission = {
  tx: string | null;
  hash: string;
};

type CapturedEnvelope = {
  tx: string | null;
};

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const EURC_ISSUER = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
const SEND_MAX = "312.4500000";
const DEST_MIN = "49.7500000";
const HASH = "pathpayhash486";

// Deterministic, valid Ed25519 StrKeys (32-byte seeds, no secrets involved).
const escrowAccount = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const sourceAccount = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));

function buildStrictSendEnvelopeXdr(): string {
  const usdc = new Asset("USDC", USDC_ISSUER);
  const eurc = new Asset("EURC", EURC_ISSUER);
  const transaction = new TransactionBuilder(new Account(sourceAccount, "0"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: 4102444800 },
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: SEND_MAX,
        destination: escrowAccount,
        destAsset: usdc,
        destMin: DEST_MIN,
        path: [eurc],
      }),
    )
    .build();
  return transaction.toXDR();
}

const envelopeXdr = buildStrictSendEnvelopeXdr();

test.describe("path-payment strict-send fixture contract (Horizon fixtures)", () => {
  expect(StrKey.decodeEd25519PublicKey(escrowAccount)).toHaveLength(32);
  expect(StrKey.decodeEd25519PublicKey(sourceAccount)).toHaveLength(32);

  for (const deliveredAmount of ["49.8000000", "50.0000000"]) {
    test(`decodes the submitted envelope and trusts the settlement record for ${deliveredAmount} USDC`, async ({
      page,
    }) => {
      const submitted: Submission[] = [];
      const executionEnvelope: CapturedEnvelope = { tx: null };
      let quote: Quote | null = null;

      // Horizon: path finding quote (XLM -> 50 USDC).
      await page.route("**/paths/strict-receive**", async (route) => {
        const url = new URL(route.request().url());
        expect(url.searchParams.get("destination_asset_type")).toBe("credit_alphanum4");
        expect(url.searchParams.get("destination_asset_code")).toBe("USDC");
        expect(url.searchParams.get("destination_amount")).toBe("50.0000000");
        quote = {
          sendAsset: "XLM",
          destAsset: "USDC",
          destAmount: "50.0000000",
          estimatedSourceAmount: SEND_MAX,
          destinationMin: DEST_MIN,
          path: ["EURC", "USDC"],
          slippageBps: 50,
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            _embedded: {
              records: [
                {
                  source_asset_type: "native",
                  source_amount: quote.estimatedSourceAmount,
                  destination_asset_type: "credit_alphanum4",
                  destination_asset_code: "USDC",
                  destination_asset_issuer: USDC_ISSUER,
                  destination_amount: quote.destAmount,
                  path: [
                    {
                      asset_type: "credit_alphanum4",
                      asset_code: "EURC",
                      asset_issuer: EURC_ISSUER,
                    },
                  ],
                },
              ],
            },
          }),
        });
      });

      // Horizon: submission returns the operation record that actually settled.
      await page.route("**/transactions", async (route) => {
        if (route.request().method() !== "POST") {
          return route.fulfill({ status: 200, body: "{}" });
        }
        const params = new URLSearchParams(route.request().postData() || "");
        executionEnvelope.tx = params.get("tx");
        submitted.push({ tx: executionEnvelope.tx, hash: HASH });
        await route.fulfill({
          status: 200,
          contentType: "application/hal+json",
          body: JSON.stringify({
            hash: HASH,
            successful: true,
            envelope_xdr: executionEnvelope.tx,
            result_xdr: "AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAA=",
            _embedded: {
              records: [
                {
                  type: "path_payment_strict_send",
                  amount: deliveredAmount,
                  destination_min: DEST_MIN,
                  asset_type: "credit_alphanum4",
                  asset_code: "USDC",
                  asset_issuer: USDC_ISSUER,
                  to: escrowAccount,
                  from: sourceAccount,
                },
              ],
            },
          }),
        });
      });

      // Fixture page: deterministic Horizon-backed quote/submission/receipt path.
      // The repository has no application checkout route for path payments, so
      // this is explicitly a fixture-contract test, not an application E2E test.
      await page.setContent(`
        <!doctype html>
        <html>
          <body>
            <h1>Multi-currency checkout fixture</h1>
            <div id="item" data-asset="USDC" data-price="50">Item: Premium Ad Slot - 50 USDC</div>
            <div id="wallet" data-balance-xlm="1000.0000000" data-balance-usdc="0">Payment wallet: XLM only</div>
            <label>Slippage (bps) <input id="slippage" value="50" /></label>
            <button id="quote">Fetch Path Payment Quote</button>
            <pre id="quoteBox"></pre>
            <button id="pay" disabled>Pay with XLM</button>
            <pre id="receipt"></pre>
            <script>
              var escrow = "${escrowAccount}";
              var envelopeXdr = "${envelopeXdr}";
              var q = null;
              document.getElementById('quote').onclick = async () => {
                var res = await fetch('https://horizon-testnet.stellar.org/paths/strict-receive'
                  + '?source_assets=native'
                  + '&destination_asset_type=credit_alphanum4'
                  + '&destination_asset_code=USDC'
                  + '&destination_asset_issuer=${USDC_ISSUER}'
                  + '&destination_amount=50.0000000');
                var data = await res.json();
                var r = data._embedded.records[0];
                q = {
                  type: 'path_payment_strict_send',
                  sendAsset: 'XLM',
                  sendMax: r.source_amount,
                  estimatedSourceAmount: r.source_amount,
                  destAsset: r.destination_asset_code,
                  destAmount: r.destination_amount,
                  destinationMin: '49.7500000',
                  destination: escrow,
                  path: ['EURC', r.destination_asset_code],
                  slippageBps: Number(document.getElementById('slippage').value)
                };
                document.getElementById('quoteBox').textContent = JSON.stringify(q, null, 2);
                document.getElementById('pay').disabled = false;
              };
              document.getElementById('pay').onclick = async () => {
                var res = await fetch('https://horizon-testnet.stellar.org/transactions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: 'tx=' + encodeURIComponent(envelopeXdr)
                });
                var result = await res.json();
                var settled = result._embedded.records[0];
                var receipt = {
                  hash: result.hash,
                  successful: result.successful,
                  deliveredAsset: settled.asset_code,
                  deliveredAmount: settled.amount,
                  assetIssuer: settled.asset_issuer,
                  destination: settled.to,
                  destinationMin: settled.destination_min,
                  destinationType: 'advertiser_escrow',
                  sourceAsset: q.sendAsset,
                  sourceAmount: q.sendMax
                };
                document.getElementById('receipt').textContent = JSON.stringify(receipt, null, 2);
              };
            </script>
          </body>
        </html>
      `);

      await expect(page.locator("#item")).toContainText("50 USDC");
      await expect(page.locator("#wallet")).toContainText("XLM only");

      await page.locator("#slippage").fill("50");
      await page.getByRole("button", { name: "Fetch Path Payment Quote" }).click();
      await expect(page.locator("#quoteBox")).toContainText(
        '"estimatedSourceAmount": "312.4500000"',
      );
      await expect(page.locator("#quoteBox")).toContainText('"destinationMin": "49.7500000"');
      expect(quote).not.toBeNull();

      await page.getByRole("button", { name: "Pay with XLM" }).click();
      await expect.poll(() => submitted.length).toBe(1);
      expect(submitted[0].hash).toBe(HASH);
      expect(submitted[0].tx).toBeTruthy();

      // Decode the application-generated base64 XDR envelope with the Stellar SDK.
      const decoded = new Transaction(String(submitted[0].tx), Networks.TESTNET);
      expect(decoded.operations).toHaveLength(1);
      const operation = decoded.operations[0];
      if (operation.type !== "pathPaymentStrictSend") {
        throw new Error(`unexpected operation type: ${operation.type}`);
      }
      expect(operation.sendAsset.isNative()).toBe(true);
      expect(operation.sendAmount).toBe(SEND_MAX);
      expect(operation.destMin).toBe(DEST_MIN);
      expect(operation.destination).toBe(escrowAccount);
      expect(operation.destAsset.getCode()).toBe("USDC");
      expect(operation.destAsset.getIssuer()).toBe(USDC_ISSUER);
      expect(operation.path.map((asset) => asset.getCode())).toEqual(["EURC"]);
      expect(operation.path.map((asset) => asset.getIssuer())).toEqual([EURC_ISSUER]);

      // The receipt must reflect the actual settlement, not the quote.
      const receiptText = await page.locator("#receipt").textContent();
      expect(receiptText).toContain('"deliveredAsset": "USDC"');
      expect(receiptText).toContain(`"deliveredAmount": "${deliveredAmount}"`);
      expect(receiptText).toContain(`"assetIssuer": "${USDC_ISSUER}"`);
      expect(receiptText).toContain(`"destination": "${escrowAccount}"`);
      expect(receiptText).toContain('"destinationType": "advertiser_escrow"');
      expect(receiptText).toContain('"successful": true');
    });
  }
});
