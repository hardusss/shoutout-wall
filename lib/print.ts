import {
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type PublicKey,
  type TransactionError,
} from "@solana/web3.js";
import {
  COMPUTE_UNIT_LIMIT,
  MAX_COMPUTE_UNIT_LIMIT,
  buildPrintInstructions,
  computeUnitLimitFor,
  estimateComputeUnits,
  networkFeeLamports,
} from "./protocol";

export type PrintErrorKind = "insufficient" | "cancelled" | "too-long" | "network";

export class PrintError extends Error {
  constructor(
    readonly kind: PrintErrorKind,
    detail?: string,
  ) {
    super(detail ?? kind);
    this.name = "PrintError";
  }
}

export const PRINT_ERROR_TEXT: Record<PrintErrorKind, string> = {
  insufficient: "Not enough SOL for the tip and fee",
  cancelled: "Transaction was cancelled in the wallet",
  "too-long": "Too many emoji or symbols to fit in one transaction. Try a shorter message",
  network: "Network is busy, try again",
};

const INSUFFICIENT =
  /AccountNotFound|InsufficientFunds|insufficient (funds|lamports)|no record of a prior credit|"Custom":1\b|0x1\b/i;
const OUT_OF_COMPUTE = /ComputationalBudgetExceeded|ProgramFailedToComplete|exceeded CUs meter/i;
const CANCELLED = /reject|cancel|declin|denied|dismiss|closed|aborted|4001/i;

/** Maps anything a wallet or RPC throws to one of the messages guests see. */
export function classifyPrintError(error: unknown): PrintErrorKind {
  if (error instanceof PrintError) return error.kind;
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (typeof current === "object") {
      const e = current as { name?: unknown; message?: unknown; code?: unknown; logs?: unknown; cause?: unknown };
      parts.push(String(e.name ?? ""), String(e.message ?? ""), String(e.code ?? ""));
      if (Array.isArray(e.logs)) parts.push(e.logs.join(" "));
      current = e.cause;
    } else {
      parts.push(String(current));
      current = null;
    }
  }
  const text = parts.join(" ");
  if (INSUFFICIENT.test(text)) return "insufficient";
  if (OUT_OF_COMPUTE.test(text)) return "too-long";
  if (CANCELLED.test(text)) return "cancelled";
  return "network";
}

function simulationFailure(err: TransactionError, logs: string[] | null): PrintError {
  const text = `${JSON.stringify(err)} ${(logs ?? []).join(" ")}`;
  if (INSUFFICIENT.test(text)) return new PrintError("insufficient", text);
  if (OUT_OF_COMPUTE.test(text)) return new PrintError("too-long", text);
  return new PrintError("network", text);
}

export type PrintPlan = {
  transaction: Transaction;
  computeUnitLimit: number;
  feeLamports: number;
};

/**
 * Builds the guest transaction. It first simulates with the maximum compute limit (and no
 * priority fee, so the probe never asks for more SOL than the real transaction) to learn
 * how many units the memo really needs, then sets a limit with headroom. Never below 60k.
 */
export async function preparePrintTransaction(
  connection: Connection,
  args: {
    sender: PublicKey;
    to: PublicKey;
    ref: PublicKey;
    lamports: number;
    message: string;
    blockhash: string;
    lastValidBlockHeight: number;
  },
): Promise<PrintPlan> {
  const { blockhash, lastValidBlockHeight, ...base } = args;

  let computeUnitLimit: number;
  try {
    const probe = new VersionedTransaction(
      new TransactionMessage({
        payerKey: base.sender,
        recentBlockhash: blockhash,
        instructions: buildPrintInstructions({ ...base, computeUnitLimit: MAX_COMPUTE_UNIT_LIMIT, computeUnitPrice: 0 }),
      }).compileToLegacyMessage(),
    );
    const { value } = await connection.simulateTransaction(probe, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    });
    if (value.err) throw simulationFailure(value.err, value.logs);
    computeUnitLimit = computeUnitLimitFor(value.unitsConsumed ?? estimateComputeUnits(base.message));
  } catch (error) {
    if (error instanceof PrintError) throw error;
    // Simulation unavailable: fall back to the measured per-character estimate.
    computeUnitLimit = Math.min(MAX_COMPUTE_UNIT_LIMIT, Math.max(COMPUTE_UNIT_LIMIT, estimateComputeUnits(base.message)));
  }

  const transaction = new Transaction({ feePayer: base.sender, blockhash, lastValidBlockHeight }).add(
    ...buildPrintInstructions({ ...base, computeUnitLimit }),
  );
  return { transaction, computeUnitLimit, feeLamports: networkFeeLamports(computeUnitLimit) };
}
