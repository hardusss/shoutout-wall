import { Buffer } from "buffer";
import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";

// Wire format of a Shoutout Wall message (version 1):
//   1. ComputeBudget limit + price
//   2. SystemProgram.transfer(guest -> organizer) with the wall `ref` appended as a
//      read-only, non-signer key (Solana Pay "reference" pattern), so the wall can find
//      its transactions with getSignaturesForAddress(ref)
//   3. Memo "sw1:<message>"

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const MEMO_PREFIX = "sw1:";
export const MAX_MESSAGE_CHARS = 120;

// 60k covers any 120 character ASCII message (measured ~46k on devnet). The Memo program
// pretty-prints the memo into its log, which is cheap for Latin and Cyrillic but costs
// ~11k CU per CJK character and ~17k CU per emoji, so heavier messages get a limit from a
// simulation (see computeUnitLimitFor) instead of failing on chain.
export const COMPUTE_UNIT_LIMIT = 60_000;
export const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
export const COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 20_000;
const BASE_FEE_LAMPORTS = 5_000;

export function networkFeeLamports(computeUnitLimit = COMPUTE_UNIT_LIMIT): number {
  return BASE_FEE_LAMPORTS + Math.ceil((computeUnitLimit * COMPUTE_UNIT_PRICE_MICRO_LAMPORTS) / 1_000_000);
}

/** Limit for a transaction that consumed `unitsConsumed` in simulation, with headroom. */
export function computeUnitLimitFor(unitsConsumed: number): number {
  return Math.min(MAX_COMPUTE_UNIT_LIMIT, Math.max(COMPUTE_UNIT_LIMIT, Math.ceil(unitsConsumed * 1.1) + 1_000));
}

/** Rough upper estimate of the units a message needs, from devnet measurements. */
export function estimateComputeUnits(message: string): number {
  let units = 5_000;
  for (const char of message) {
    const code = char.codePointAt(0) ?? 0;
    units += code < 0x80 ? 400 : code < 0x800 ? 1_100 : code < 0x1000 ? 4_000 : code < 0x10000 ? 13_500 : 17_500;
  }
  return units;
}

// A system account that keeps any lamports must stay rent exempt (0 bytes of data).
export const RENT_EXEMPT_MIN_LAMPORTS = 890_880;

export type Shout = {
  signature: string;
  sender: string;
  lamports: number;
  message: string;
  /** Unix seconds. */
  blockTime: number;
  slot: number;
};

// Control characters and bidi overrides that could garble the wall. Line and paragraph
// separators are whitespace and get collapsed first. ZWJ stays so emoji sequences survive.
const UNWANTED_CHARS = /[\p{Cc}\p{Bidi_Control}]/gu;

function cleanText(input: string): string {
  return input.replace(/\s+/gu, " ").replace(UNWANTED_CHARS, "").replace(/ {2,}/g, " ");
}

function clampChars(input: string, max: number): string {
  const chars = Array.from(input);
  return chars.length > max ? chars.slice(0, max).join("") : input;
}

export function countChars(input: string): number {
  return Array.from(input).length;
}

/** The exact text that goes on chain and on the wall. */
export function sanitizeMessage(input: string, max = MAX_MESSAGE_CHARS): string {
  return clampChars(cleanText(input).trim(), max).trim();
}

/** Same rules while typing: keeps a trailing space so words can still be typed. */
export function sanitizeDraft(input: string, max = MAX_MESSAGE_CHARS): string {
  return clampChars(cleanText(input).replace(/^ /, ""), max);
}

export function buildPrintInstructions({
  sender,
  to,
  ref,
  lamports,
  message,
  computeUnitLimit = COMPUTE_UNIT_LIMIT,
  computeUnitPrice = COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
}: {
  sender: PublicKey;
  to: PublicKey;
  ref: PublicKey;
  lamports: number;
  message: string;
  computeUnitLimit?: number;
  computeUnitPrice?: number;
}): TransactionInstruction[] {
  const text = sanitizeMessage(message);
  if (!text) throw new Error("Message is empty");

  const transfer = SystemProgram.transfer({ fromPubkey: sender, toPubkey: to, lamports });
  transfer.keys.push({ pubkey: ref, isSigner: false, isWritable: false });

  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice }),
    transfer,
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(MEMO_PREFIX + text, "utf8"),
    }),
  ];
}

function decodeMemoData(data: string): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bs58.decode(data));
  } catch {
    return null;
  }
}

/**
 * Turns a parsed transaction into a wall message, or null when it does not qualify:
 * failed, no system transfer to the organizer of at least `minLamports`, or no `sw1:` memo.
 */
export function parseShout(
  signature: string,
  tx: ParsedTransactionWithMeta,
  organizer: string,
  minLamports: number,
): Shout | null {
  if (!tx.meta || tx.meta.err) return null;

  let transfer: { source: string; lamports: number } | null = null;
  let memo: string | null = null;

  for (const ix of tx.transaction.message.instructions) {
    if ("parsed" in ix) {
      if (ix.program === "system" && ix.parsed?.type === "transfer") {
        const info = ix.parsed.info ?? {};
        const lamports = Number(info.lamports);
        if (!transfer && info.destination === organizer && Number.isFinite(lamports) && lamports >= minLamports) {
          transfer = { source: String(info.source), lamports };
        }
      } else if (memo === null && ix.programId.equals(MEMO_PROGRAM_ID) && typeof ix.parsed === "string") {
        if (ix.parsed.startsWith(MEMO_PREFIX)) memo = ix.parsed;
      }
    } else if (memo === null && ix.programId.equals(MEMO_PROGRAM_ID)) {
      const text = decodeMemoData(ix.data);
      if (text?.startsWith(MEMO_PREFIX)) memo = text;
    }
  }

  if (!transfer || memo === null) return null;
  const message = sanitizeMessage(memo.slice(MEMO_PREFIX.length));
  if (!message) return null;

  return {
    signature,
    sender: transfer.source,
    lamports: transfer.lamports,
    message,
    blockTime: tx.blockTime ?? Math.floor(Date.now() / 1000),
    slot: tx.slot,
  };
}
