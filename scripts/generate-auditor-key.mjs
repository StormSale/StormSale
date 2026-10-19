#!/usr/bin/env node
/**
 * StormSale Platform Auditor Key Generator
 * Generates an Ed25519 Keypair for signing SOC 2 Type II evidence bundles.
 */

import { Keypair } from "@stellar/stellar-sdk";

const keypair = Keypair.random();
const secret = keypair.secret();
const publicKey = keypair.publicKey();

console.log("\n========================================================");
console.log("⚡ STORMSALE PLATFORM AUDITOR KEY GENERATION");
console.log("========================================================");
console.log(`Public Key (Key ID):  ${publicKey}`);
console.log(`Secret Seed (S...):   ${secret}`);
console.log("========================================================");
console.log("\nTo configure this auditor key in your environment:");
console.log("Add the following entry to your .env file:\n");
console.log(`AUDITOR_PRIVATE_KEY=${secret}\n`);
console.log("⚠️  KEEP THE SECRET SEED SECURE. NEVER COMMIT IT TO GIT.");
console.log("========================================================\n");
