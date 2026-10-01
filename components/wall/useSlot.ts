"use client";

import { useEffect, useState } from "react";
import type { Connection } from "@solana/web3.js";

/** The real current slot, polled about once a second, so the room can see the chain moving. */
export function useSlot(connection: Connection): number | null {
  const [slot, setSlot] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await connection.getSlot("confirmed");
        if (!stopped) setSlot((prev) => (prev === null || next > prev ? next : prev));
      } catch {
        // The feed status reports connectivity problems; the ticker just holds its value.
      }
      if (!stopped) timer = setTimeout(tick, 1_000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connection]);

  return slot;
}
