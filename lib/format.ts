export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

const solFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const tinySolFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 9 });

export function formatSol(lamports: number): string {
  const sol = lamports / 1_000_000_000;
  return sol > 0 && sol < 0.0001 ? tinySolFormat.format(sol) : solFormat.format(sol);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock time, e.g. 14:32. */
export function clockTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Deterministic pseudo-random numbers from a string, so a receipt looks the same everywhere. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
