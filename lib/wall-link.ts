import { PublicKey } from "@solana/web3.js";

export const DEFAULT_TITLE = "Shoutout Wall";
export const DEFAULT_QUESTION = "What are you building today?";
export const MIN_TIP_OPTIONS = [1_000_000, 5_000_000, 10_000_000] as const;
export const MAX_TITLE_CHARS = 60;
export const MAX_QUESTION_CHARS = 140;

/** Everything a wall needs. It lives in the URL, so any laptop can open the same wall. */
export type WallConfig = {
  to: string;
  ref: string;
  title: string;
  question: string;
  minLamports: number;
};

function isPublicKey(value: string | null): value is string {
  if (!value || value.length < 32 || value.length > 44) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function cleanLine(input: string, max: number): string {
  const text = input
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, "")
    .trim();
  return Array.from(text).slice(0, max).join("").trim();
}

export function parseWallParams(params: Pick<URLSearchParams, "get">): WallConfig | null {
  const to = params.get("to");
  const ref = params.get("ref");
  if (!isPublicKey(to) || !isPublicKey(ref) || to === ref) return null;

  const minLamports = Number(params.get("min"));
  if (!Number.isSafeInteger(minLamports) || minLamports <= 0) return null;

  return {
    to,
    ref,
    title: cleanLine(params.get("t") ?? "", MAX_TITLE_CHARS) || DEFAULT_TITLE,
    question: cleanLine(params.get("q") ?? "", MAX_QUESTION_CHARS) || DEFAULT_QUESTION,
    minLamports,
  };
}

export function wallQuery(config: WallConfig): string {
  return new URLSearchParams({
    to: config.to,
    ref: config.ref,
    t: config.title,
    q: config.question,
    min: String(config.minLamports),
  }).toString();
}
