import { clusterApiUrl } from "@solana/web3.js";

export type Cluster = "mainnet-beta" | "devnet";

// NEXT_PUBLIC_* values are inlined at build time, so they must be read with literal names.
export const CLUSTER: Cluster = process.env.NEXT_PUBLIC_CLUSTER === "devnet" ? "devnet" : "mainnet-beta";
export const IS_DEVNET = CLUSTER === "devnet";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(CLUSTER);

// Optional. web3.js derives the websocket endpoint from RPC_URL when this is empty.
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || undefined;

// Optional public origin for the QR code, e.g. when the wall runs on localhost but guests
// should open the deployed site.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

export const MWA_CHAIN = IS_DEVNET ? "solana:devnet" : "solana:mainnet";

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}${IS_DEVNET ? "?cluster=devnet" : ""}`;
}
