/**
 * Prints a message on a wall from a local keypair, using exactly the transaction the guest
 * page builds. Devnet only. Handy for testing a wall without phones.
 *
 *   npm run shout -- --wall "<wall or send URL>" --keypair ~/.config/solana/id.json "gm from devnet"
 *   npm run shout -- --wall "<url>" --keypair key.json --tip 2 "twice the minimum tip"
 *
 * RPC: SHOUT_RPC_URL, else NEXT_PUBLIC_RPC_URL from .env (must be a devnet URL), else the
 * public devnet endpoint.
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { preparePrintTransaction, PRINT_ERROR_TEXT, classifyPrintError } from "../lib/print";
import { sanitizeMessage } from "../lib/protocol";
import { parseWallParams } from "../lib/wall-link";

function readEnvFile(): Record<string, string> {
  if (!existsSync(".env")) return {};
  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
  );
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function positional(): string {
  const flags = new Set(["--wall", "--keypair", "--tip"]);
  const rest: string[] = [];
  for (let i = 2; i < process.argv.length; i++) {
    if (flags.has(process.argv[i])) i++;
    else rest.push(process.argv[i]);
  }
  return rest.join(" ");
}

async function main() {
  const wallUrl = arg("wall");
  const keypairPath = (arg("keypair") ?? "~/.config/solana/id.json").replace(/^~(?=\/)/, homedir());
  const tipMultiplier = Number(arg("tip") ?? 1);
  const message = sanitizeMessage(positional());

  if (!wallUrl || !message) {
    console.error('Usage: npm run shout -- --wall "<wall URL>" [--keypair path.json] [--tip 1|2|5] "message"');
    process.exit(1);
  }
  const config = parseWallParams(new URL(wallUrl).searchParams);
  if (!config) throw new Error("That URL is missing to, ref or min.");

  const env = readEnvFile();
  const rpc = process.env.SHOUT_RPC_URL || env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet");
  const connection = new Connection(rpc, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") {
    throw new Error("This script only sends on devnet. Point SHOUT_RPC_URL at a devnet RPC.");
  }

  const sender = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))));
  const lamports = Math.round(config.minLamports * tipMultiplier);
  const latest = await connection.getLatestBlockhash("confirmed");
  try {
    const { transaction, computeUnitLimit } = await preparePrintTransaction(connection, {
      sender: sender.publicKey,
      to: new PublicKey(config.to),
      ref: new PublicKey(config.ref),
      lamports,
      message,
      ...latest,
    });
    transaction.sign(sender);
    const signature = await connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: "confirmed" });
    const { value } = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    if (value.err) throw new Error(JSON.stringify(value.err));
    console.log(`Printed (${computeUnitLimit} CU limit): https://solscan.io/tx/${signature}?cluster=devnet`);
  } catch (error) {
    console.error(PRINT_ERROR_TEXT[classifyPrintError(error)], "\n", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
