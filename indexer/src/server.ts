import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { buildSchema } from "./schema.js";
import { startPoller } from "./poller.js";
import { Store } from "./store.js";

const PORT = Number(process.env.PORT ?? 4000);
const RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT_ID =
  process.env.CONTRACT_ID ?? "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const DATA_FILE = process.env.DATA_FILE ?? "./data.json";

const store = new Store(DATA_FILE);
const yoga = createYoga({
  schema: buildSchema(store),
  graphqlEndpoint: "/graphql",
  cors: { origin: process.env.CORS_ORIGIN ?? "*" },
});

createServer(yoga).listen(PORT, () => {
  console.log(`[indexer] GraphQL on http://localhost:${PORT}/graphql`);
  startPoller(store, { rpcUrl: RPC_URL, contractId: CONTRACT_ID });
});
