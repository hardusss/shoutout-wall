"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { SITE_URL } from "@/lib/config";
import { getConnection } from "@/lib/connection";
import { useReducedMotion } from "@/lib/hooks";
import type { Shout } from "@/lib/protocol";
import { parseWallParams, wallQuery, type WallConfig } from "@/lib/wall-link";
import { FEED_MS, PrintingReceipt, QuestionReceipt } from "./Printer";
import { useHiddenSignatures } from "./useHiddenSignatures";
import { useWallFeed } from "./useWallFeed";
import { WallBoard, type DropOrigin } from "./WallBoard";
import { OrganizerControls, QrReceipt, SlotTicker, SupportersStrip } from "./WallParts";
import { initialWallState, wallReducer, wallStats } from "./wallState";

const HOLD_MS = 4_000;
const BUSY_HOLD_MS = 2_500; // shorter when a queue builds up
const GAP_MS = 700;
const MAX_PINNED = 60; // receipts kept in the DOM; older ones are only counted
const CONTROLS_IDLE_MS = 2_500;

const noopSubscribe = () => () => {};

export function WallScreen() {
  const params = useSearchParams();
  const config = useMemo(() => parseWallParams(params), [params]);
  if (!config) return <BrokenWallLink />;
  return <Wall key={config.ref} config={config} />;
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

function Wall({ config }: { config: WallConfig }) {
  const [connection] = useState(getConnection);
  const reducedMotion = useReducedMotion();
  const [state, dispatch] = useReducer(wallReducer, initialWallState);
  const { hidden, hide, restoreAll } = useHiddenSignatures(config.ref);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);

  const printingRef = useRef<HTMLDivElement>(null);
  const dropOriginRef = useRef<DropOrigin>(null);
  const selectedRef = useRef(selected);
  const queueLengthRef = useRef(0);
  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => {
    selectedRef.current = selected;
    queueLengthRef.current = state.queue.length;
    reducedMotionRef.current = reducedMotion;
  });

  const onShouts = useCallback((shouts: Shout[], history: boolean) => {
    dispatch({ type: history ? "history" : "arrived", shouts });
  }, []);
  const status = useWallFeed(connection, config, onShouts);

  // The QR points guests to /send with the same wall parameters.
  const sendUrl = useSyncExternalStore(
    noopSubscribe,
    () => `${SITE_URL || window.location.origin}/send?${wallQuery(config)}`,
    () => null,
  );

  // Printer: take the next queued message after a short pause.
  useEffect(() => {
    if (!state.ready || paused || state.printing || state.queue.length === 0) return;
    const timer = setTimeout(() => dispatch({ type: "start-print" }), GAP_MS);
    return () => clearTimeout(timer);
  }, [state.ready, paused, state.printing, state.queue.length]);

  // Feed (~1.2 s), hold big (~4 s), then drop onto the wall. Waits while the organizer
  // has the hide prompt open on it.
  const printingSignature = state.printing?.signature;
  useEffect(() => {
    if (!printingSignature) return;
    const hold = queueLengthRef.current > 2 ? BUSY_HOLD_MS : HOLD_MS;
    let timer = setTimeout(
      function finish() {
        if (selectedRef.current === printingSignature) {
          timer = setTimeout(finish, 400);
          return;
        }
        dropOriginRef.current = {
          signature: printingSignature,
          rect: printingRef.current?.getBoundingClientRect() ?? null,
        };
        dispatch({ type: "finish-print" });
      },
      (reducedMotionRef.current ? 400 : FEED_MS) + hold,
    );
    return () => clearTimeout(timer);
  }, [printingSignature]);

  const visibleWall = useMemo(() => state.wall.filter((s) => !hidden.has(s.signature)), [state.wall, hidden]);
  const pinned = useMemo(() => visibleWall.slice(0, MAX_PINNED), [visibleWall]);
  const printing = state.printing && !hidden.has(state.printing.signature) ? state.printing : null;
  const stats = useMemo(() => wallStats(printing ? [printing, ...visibleWall] : visibleWall), [printing, visibleWall]);

  const onHide = useCallback(
    (signature: string) => {
      hide(signature);
      setSelected(null);
      if (state.printing?.signature === signature) dispatch({ type: "finish-print" });
    },
    [hide, state.printing],
  );

  // Organizer controls appear on mouse move and fade away again; so does the cursor.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), CONTROLS_IDLE_MS);
    };
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", show);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (key === "p") {
        setPaused((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onBackgroundClick = (event: MouseEvent) => {
    if (!(event.target as Element).closest('[role="button"], [role="dialog"], button')) setSelected(null);
  };

  const questionSize = config.question.length > 90 ? "text-[2.75rem]" : "text-[3.5rem]";

  return (
    <div
      className="wall-root flex h-dvh flex-col overflow-hidden px-10 pb-5 pt-8"
      style={{ cursor: controlsVisible ? undefined : "none" }}
      onClick={onBackgroundClick}
    >
      <title>{`${config.title} · Shoutout Wall`}</title>
      <header className="flex flex-none items-start justify-between gap-10">
        <div className="min-w-0">
          <h1 className="text-[2rem] font-semibold leading-tight text-paper/85">{config.title}</h1>
          <p className={`mt-1 line-clamp-2 font-extrabold leading-[1.04] tracking-tight text-balance ${questionSize}`}>
            {config.question}
          </p>
        </div>
        <SlotTicker connection={connection} status={status} />
      </header>

      <div className="mt-7 grid min-h-0 flex-1 grid-cols-[25rem_minmax(0,1fr)] gap-12">
        <aside className="min-h-0 pt-1">
          <QrReceipt url={sendUrl} organizer={config.to} />
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="printer-slot relative z-30 mx-auto w-[70%] flex-none" aria-hidden="true" />
          <div className="wall-board-mask relative -mt-4 min-h-0 flex-1 overflow-hidden">
            {state.ready ? (
              <WallBoard
                shouts={pinned}
                dropOriginRef={dropOriginRef}
                reducedMotion={reducedMotion}
                selected={selected}
                onSelect={setSelected}
                onHide={onHide}
              />
            ) : null}
            {/* Paper never comes out wider than the printer slot (70% of the column). */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto flex w-[66%] justify-center"
              aria-live="polite"
            >
              {printing ? (
                <div className="pointer-events-auto max-w-full">
                  <PrintingReceipt
                    key={printing.signature}
                    shout={printing}
                    receiptRef={printingRef}
                    reducedMotion={reducedMotion}
                    selected={selected === printing.signature}
                    onSelect={setSelected}
                    onHide={() => onHide(printing.signature)}
                  />
                </div>
              ) : state.ready && visibleWall.length === 0 ? (
                <QuestionReceipt question={config.question} />
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <SupportersStrip stats={stats} />

      <OrganizerControls
        visible={controlsVisible}
        paused={paused}
        waiting={state.queue.length}
        hiddenCount={hidden.size}
        onFullscreen={toggleFullscreen}
        onTogglePause={() => setPaused((value) => !value)}
        onRestoreHidden={restoreAll}
      />
    </div>
  );
}

function BrokenWallLink() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-5 px-6">
      <title>Shoutout Wall</title>
      <h1 className="text-4xl font-extrabold leading-tight">This wall link is incomplete.</h1>
      <p className="text-lg text-paper/85">
        A wall link carries the organizer address, the wall reference and the minimum tip. Start a new wall to get a
        fresh one.
      </p>
      <Link href="/" className="inline-flex h-12 items-center rounded-full bg-paper px-6 font-semibold text-ink">
        Start a new wall
      </Link>
    </main>
  );
}
