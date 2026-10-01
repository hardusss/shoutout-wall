import type { Shout } from "@/lib/protocol";

export type WallState = {
  /** History has been read from chain. */
  ready: boolean;
  /** Printed receipts on the wall, newest first. */
  wall: Shout[];
  /** New messages waiting for the printer, oldest first. */
  queue: Shout[];
  /** The message currently feeding out of the printer. */
  printing: Shout | null;
  known: Set<string>;
};

export type WallAction =
  | { type: "history"; shouts: Shout[] }
  | { type: "arrived"; shouts: Shout[] }
  | { type: "start-print" }
  | { type: "finish-print" };

export const initialWallState: WallState = {
  ready: false,
  wall: [],
  queue: [],
  printing: null,
  known: new Set(),
};

const newestFirst = (a: Shout, b: Shout) => b.blockTime - a.blockTime || b.slot - a.slot;

function unknown(state: WallState, shouts: Shout[]) {
  const known = new Set(state.known);
  const fresh: Shout[] = [];
  for (const shout of shouts) {
    if (known.has(shout.signature)) continue;
    known.add(shout.signature);
    fresh.push(shout);
  }
  return { known, fresh };
}

export function wallReducer(state: WallState, action: WallAction): WallState {
  switch (action.type) {
    case "history": {
      // Messages that were on chain before the wall opened go straight onto the wall.
      const { known, fresh } = unknown(state, action.shouts);
      if (fresh.length === 0) return state.ready ? state : { ...state, ready: true };
      return { ...state, ready: true, known, wall: [...state.wall, ...fresh].sort(newestFirst) };
    }
    case "arrived": {
      const { known, fresh } = unknown(state, action.shouts);
      if (fresh.length === 0) return state;
      return { ...state, known, queue: [...state.queue, ...fresh] };
    }
    case "start-print": {
      if (state.printing || state.queue.length === 0) return state;
      const [next, ...rest] = state.queue;
      return { ...state, printing: next, queue: rest };
    }
    case "finish-print": {
      if (!state.printing) return state;
      return { ...state, printing: null, wall: [state.printing, ...state.wall] };
    }
  }
}

export type WallStats = {
  count: number;
  totalLamports: number;
  supporters: { sender: string; lamports: number }[];
};

export function wallStats(shouts: Shout[]): WallStats {
  const bySender = new Map<string, number>();
  let totalLamports = 0;
  for (const shout of shouts) {
    totalLamports += shout.lamports;
    bySender.set(shout.sender, (bySender.get(shout.sender) ?? 0) + shout.lamports);
  }
  const supporters = [...bySender]
    .map(([sender, lamports]) => ({ sender, lamports }))
    .sort((a, b) => b.lamports - a.lamports)
    .slice(0, 5);
  return { count: shouts.length, totalLamports, supporters };
}
