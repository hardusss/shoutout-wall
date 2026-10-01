"use client";

import { useEffect, useRef, useState } from "react";
import {
  PublicKey,
  type ConfirmedSignatureInfo,
  type Connection,
  type SignaturesForAddressOptions,
} from "@solana/web3.js";
import { MEMO_PREFIX, parseShout, type Shout } from "@/lib/protocol";
import type { WallConfig } from "@/lib/wall-link";

const POLL_MS = 2_500;
const HISTORY_LIMIT = 200;
const FETCH_CHUNK = 25;
const MAX_FETCH_ATTEMPTS = 8;
// Every Nth poll ignores `until` and rescans the latest signatures, in case one slipped by.
const FULL_RESCAN_EVERY = 12;

export type FeedStatus = "loading" | "live" | "offline";

/**
 * Reads the wall from chain: history first (getSignaturesForAddress(ref) +
 * getParsedTransactions), then polling with `until` every 2.5 s, plus a logs subscription
 * on `ref` for instant updates when the RPC has websockets.
 *
 * `onShouts(shouts, history)` receives qualifying messages oldest first. `history` is true
 * for messages that were already on chain when the wall opened.
 */
export function useWallFeed(
  connection: Connection,
  config: WallConfig,
  onShouts: (shouts: Shout[], history: boolean) => void,
): FeedStatus {
  const [status, setStatus] = useState<FeedStatus>("loading");
  const onShoutsRef = useRef(onShouts);
  useEffect(() => {
    onShoutsRef.current = onShouts;
  });

  const { ref: refAddress, to, minLamports } = config;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscription: number | undefined;
    const ref = new PublicKey(refAddress);

    const done = new Set<string>(); // fetched (accepted or rejected) or given up on
    const pending = new Map<string, number>(); // not readable yet: signature -> attempts
    const inFlight = new Set<string>();
    const historical = new Set<string>(); // signatures from the first scan
    let newest: string | undefined;
    let historyLoaded = false;
    let polls = 0;
    let failures = 0;

    const emit = (shouts: Shout[], history: boolean) => {
      if (stopped || (shouts.length === 0 && !history)) return;
      shouts.sort((a, b) => a.blockTime - b.blockTime || a.slot - b.slot);
      onShoutsRef.current(shouts, history);
    };

    const deliver = (shouts: Shout[], firstScan = false) => {
      const old = shouts.filter((s) => historical.has(s.signature));
      if (old.length || firstScan) emit(old, true);
      emit(
        shouts.filter((s) => !historical.has(s.signature)),
        false,
      );
    };

    const retryLater = (signature: string) => {
      const attempts = (pending.get(signature) ?? 0) + 1;
      if (attempts >= MAX_FETCH_ATTEMPTS) {
        pending.delete(signature);
        done.add(signature);
      } else {
        pending.set(signature, attempts);
      }
    };

    /** Never throws: anything that could not be read is retried on a later poll. */
    async function fetchShouts(signatures: string[]): Promise<{ shouts: Shout[]; failed: boolean }> {
      const todo = [...new Set(signatures)].filter((s) => !done.has(s) && !inFlight.has(s));
      todo.forEach((s) => inFlight.add(s));
      const shouts: Shout[] = [];
      let failed = false;
      try {
        for (let i = 0; i < todo.length; i += FETCH_CHUNK) {
          const chunk = todo.slice(i, i + FETCH_CHUNK);
          if (failed) {
            chunk.forEach((s) => pending.set(s, pending.get(s) ?? 0));
            continue;
          }
          try {
            const txs = await connection.getParsedTransactions(chunk, {
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            });
            txs.forEach((tx, index) => {
              const signature = chunk[index];
              if (!tx) return retryLater(signature);
              pending.delete(signature);
              done.add(signature);
              const shout = parseShout(signature, tx, to, minLamports);
              if (shout) shouts.push(shout);
            });
          } catch (error) {
            console.warn("[wall] getParsedTransactions failed", error);
            failed = true;
            chunk.forEach((s) => pending.set(s, pending.get(s) ?? 0));
          }
        }
      } finally {
        todo.forEach((s) => inFlight.delete(s));
      }
      return { shouts, failed };
    }

    function candidates(infos: ConfirmedSignatureInfo[]): string[] {
      const out: string[] = [];
      for (const info of infos) {
        if (done.has(info.signature)) continue;
        // The RPC already tells us about failures and memos; skip what cannot qualify.
        if (info.err || (typeof info.memo === "string" && !info.memo.includes(MEMO_PREFIX))) {
          done.add(info.signature);
          continue;
        }
        out.push(info.signature);
      }
      return out;
    }

    async function scan() {
      const firstScan = !historyLoaded;
      const options: SignaturesForAddressOptions = firstScan
        ? { limit: HISTORY_LIMIT }
        : newest && polls % FULL_RESCAN_EVERY !== 0
          ? { until: newest, limit: 100 }
          : { limit: 50 };
      polls++;
      const infos = await connection.getSignaturesForAddress(ref, options, "confirmed");
      if (stopped) return;
      if (infos[0]) newest = infos[0].signature;
      if (firstScan) infos.forEach((info) => historical.add(info.signature));

      const { shouts, failed } = await fetchShouts([...candidates(infos), ...pending.keys()]);
      if (stopped) return;
      historyLoaded = true;
      deliver(shouts, firstScan);
      if (failed) throw new Error("Some transactions could not be read yet");
    }

    const loop = async () => {
      try {
        await scan();
        failures = 0;
        if (!stopped) setStatus("live");
      } catch (error) {
        failures++;
        console.warn("[wall] scan failed", error);
        if (!stopped && failures >= 2) setStatus("offline");
      }
      if (!stopped) timer = setTimeout(loop, failures ? Math.min(20_000, POLL_MS * 2 ** failures) : POLL_MS);
    };
    void loop();

    try {
      subscription = connection.onLogs(
        ref,
        (logs) => {
          if (logs.err || !historyLoaded || done.has(logs.signature)) return;
          void fetchShouts([logs.signature]).then(({ shouts }) => deliver(shouts));
        },
        "confirmed",
      );
    } catch (error) {
      console.warn("[wall] websocket subscription unavailable, polling only", error);
    }

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (subscription !== undefined) void connection.removeOnLogsListener(subscription).catch(() => {});
    };
  }, [connection, refAddress, to, minLamports]);

  return status;
}
