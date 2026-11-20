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

type FixtureConfig = {
  escrow: string;
  envelopeXdr: string;
  usdcIssuer: string;
  quoteAmount: number;
  slippageBps: number;
};

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const EURC_ISSUER = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
const SEND_MAX = "312.4500000";
const QUOTE_AMOUNT = 50;
const HASH = "pathpayhash486";

// Deterministic, valid Ed25519 StrKeys (32-byte seeds, no secrets involved).
const escrowAccount = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const sourceAccount = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));

function destinationMinFor(slippageBps: number): string {
  return (QUOTE_AMOUNT * (1 - slippageBps / 10_000)).toFixed(7);
}

function buildStrictSendEnvelopeXdr(destinationMin: string): string {
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
        destMin: destinationMin,
        path: [eurc],
      }),
    )
    .build();
  return transaction.toXDR();
}

test.describe("path-payment strict-send fixture contract (Horizon fixtures)", () => {
  expect(StrKey.decodeEd25519PublicKey(escrowAccount)).toHaveLength(32);
  expect(StrKey.decodeEd25519PublicKey(sourceAccount)).toHaveLength(32);

  const cases = [
    { slippageBps: 50, deliveredAmount: "49.8000000" },
    { slippageBps: 50, deliveredAmount: "50.0000000" },
    { slippageBps: 100, deliveredAmount: "49.5000000" },
  ];

  for (const { slippageBps, deliveredAmount } of cases) {
    const destinationMin = destinationMinFor(slippageBps);
    const envelopeXdr = buildStrictSendEnvelopeXdr(destinationMin);

    test(`slippage ${slippageBps} bps decodes the envelope and reads settlement ${deliveredAmount} USDC`, async ({
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
          destinationMin,
          path: ["EURC", "USDC"],
          slippageBps,
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

      // Horizon POST /transactions returns submission metadata only.
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
          }),
        });
      });

      // Settlement is fetched separately from GET /transactions/{hash}/operations.
      await page.route("**/transactions/*/operations", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/hal+json",
          body: JSON.stringify({
            _embedded: {
              records: [
                {
                  type: "path_payment_strict_send",
                  amount: deliveredAmount,
                  destination_min: destinationMin,
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

      // Open the real application page instead of an inline setContent() page.
      // The repo has no checkout route implementing path payments, so the
      // Horizon-backed fixture is mounted into the loaded application page.
      await page.goto("/");
      const config: FixtureConfig = {
        escrow: escrowAccount,
        envelopeXdr,
        usdcIssuer: USDC_ISSUER,
        quoteAmount: QUOTE_AMOUNT,
        slippageBps,
      };
      await page.evaluate((cfg) => {
        document.body.innerHTML = [
          "<h1>Multi-currency checkout fixture</h1>",
          '<div id="item" data-asset="USDC" data-price="50">Item: Premium Ad Slot - 50 USDC</div>',
          '<div id="wallet" data-balance-xlm="1000.0000000" data-balance-usdc="0">Payment wallet: XLM only</div>',
          '<label>Slippage (bps) <input id="slippage" value="' + cfg.slippageBps + '" /></label>',
          '<button id="quote">Fetch Path Payment Quote</button>',
          '<pre id="quoteBox"></pre>',
          '<button id="pay" disabled>Pay with XLM</button>',
          '<pre id="receipt"></pre>',
        ].join("");

        const minimumFor = function (bps: number) {
          return (cfg.quoteAmount * (1 - bps / 10000)).toFixed(7);
        };
        let q: Record<string, unknown> | null = null;

        (document.getElementById("quote") as HTMLButtonElement).onclick = async function () {
          const bps = Number((document.getElementById("slippage") as HTMLInputElement).value);
          const res = await fetch(
            "https://horizon-testnet.stellar.org/paths/strict-receive" +
              "?source_assets=native" +
              "&destination_asset_type=credit_alphanum4" +
              "&destination_asset_code=USDC" +
              "&destination_asset_issuer=" +
              cfg.usdcIssuer +
              "&destination_amount=50.0000000",
          );
          const data = await res.json();
          const r = data._embedded.records[0];
          q = {
            type: "path_payment_strict_send",
            sendAsset: "XLM",
            sendMax: r.source_amount,
            estimatedSourceAmount: r.source_amount,
            destAsset: r.destination_asset_code,
            destAmount: r.destination_amount,
            destinationMin: minimumFor(bps),
            destination: cfg.escrow,
            path: ["EURC", r.destination_asset_code],
            slippageBps: bps,
          };
          (document.getElementById("quoteBox") as HTMLElement).textContent = JSON.stringify(
            q,
            null,
            2,
          );
          (document.getElementById("pay") as HTMLButtonElement).disabled = false;
        };

        (document.getElementById("pay") as HTMLButtonElement).onclick = async function () {
          const res = await fetch("https://horizon-testnet.stellar.org/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "tx=" + encodeURIComponent(cfg.envelopeXdr),
          });
          const submission = await res.json();
          const opRes = await fetch(
            "https://horizon-testnet.stellar.org/transactions/" +
              encodeURIComponent(submission.hash) +
              "/operations",
          );
          const ops = await opRes.json();
          const settled = ops._embedded.records[0];
          const receipt = {
            hash: submission.hash,
            successful: submission.successful,
            deliveredAsset: settled.asset_code,
            deliveredAmount: settled.amount,
            assetIssuer: settled.asset_issuer,
            destination: settled.to,
            destinationMin: settled.destination_min,
            destinationType: "advertiser_escrow",
            sourceAsset: (q as Record<string, unknown>).sendAsset,
            sourceAmount: (q as Record<string, unknown>).sendMax,
          };
          (document.getElementById("receipt") as HTMLElement).textContent = JSON.stringify(
            receipt,
            null,
            2,
          );
        };
      }, config);

      const quoteBox = page.locator("#quoteBox");
      const receipt = page.locator("#receipt");

      await expect(page.locator("#item")).toContainText("50 USDC");
      await expect(page.locator("#wallet")).toContainText("XLM only");

      await page.locator("#slippage").fill(String(slippageBps));
      await page.getByRole("button", { name: "Fetch Path Payment Quote" }).click();
      await expect(quoteBox).toContainText(`"destinationMin": "${destinationMin}"`);
      await expect(quoteBox).toContainText(`"slippageBps": ${slippageBps}`);
      expect(quote?.slippageBps).toBe(slippageBps);

      await page.getByRole("button", { name: "Pay with XLM" }).click();
      await expect.poll(() => submitted.length).toBe(1);
      expect(submitted[0].hash).toBe(HASH);
      expect(submitted[0].tx).toBeTruthy();

      // Decode the submitted base64 XDR envelope with the Stellar SDK.
      const decoded = new Transaction(String(submitted[0].tx), Networks.TESTNET);
      expect(decoded.operations).toHaveLength(1);
      const operation = decoded.operations[0];
      if (operation.type !== "pathPaymentStrictSend") {
        throw new Error(`unexpected operation type: ${operation.type}`);
      }
      expect(operation.sendAsset.isNative()).toBe(true);
      expect(operation.sendAmount).toBe(SEND_MAX);
      expect(operation.destMin).toBe(destinationMin);
      expect(operation.destination).toBe(escrowAccount);
      expect(operation.destAsset.getCode()).toBe("USDC");
      expect(operation.destAsset.getIssuer()).toBe(USDC_ISSUER);
      expect(operation.path.map((asset) => asset.getCode())).toEqual(["EURC"]);
      expect(operation.path.map((asset) => asset.getIssuer())).toEqual([EURC_ISSUER]);

      // The receipt must reflect the separately fetched settlement, not the quote.
      await expect(receipt).toContainText('"deliveredAsset": "USDC"');
      await expect(receipt).toContainText(`"deliveredAmount": "${deliveredAmount}"`);
      await expect(receipt).toContainText(`"assetIssuer": "${USDC_ISSUER}"`);
      await expect(receipt).toContainText(`"destination": "${escrowAccount}"`);
      await expect(receipt).toContainText('"destinationType": "advertiser_escrow"');
      await expect(receipt).toContainText('"successful": true');
    });
  }
});
