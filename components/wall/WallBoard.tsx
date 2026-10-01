"use client";

import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { Receipt } from "@/components/Receipt";
import { clockTime, shortAddress } from "@/lib/format";
import type { Shout } from "@/lib/protocol";
import { HidePrompt } from "./HidePrompt";

export type DropOrigin = { signature: string; rect: DOMRect | null } | null;

const NUDGE = { duration: 650, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)" };
const DROP = { duration: 800, easing: "cubic-bezier(0.32, 0.72, 0.2, 1)" };

/**
 * Receipts pinned on the wall, newest first. Layout changes animate with FLIP: when a new
 * receipt lands in the first position, the others are nudged along to their new spots and
 * the new one shrinks from the printer into place.
 */
export function WallBoard({
  shouts,
  dropOriginRef,
  reducedMotion,
  selected,
  onSelect,
  onHide,
}: {
  shouts: Shout[];
  dropOriginRef: MutableRefObject<DropOrigin>;
  reducedMotion: boolean;
  selected: string | null;
  onSelect: (signature: string | null) => void;
  onHide: (signature: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const primed = useRef(false);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const next = new Map<string, { x: number; y: number }>();

    for (const item of Array.from(board.children) as HTMLElement[]) {
      const signature = item.dataset.signature;
      if (!signature) continue;
      const position = { x: item.offsetLeft, y: item.offsetTop };
      next.set(signature, position);
      if (!primed.current) continue; // the history renders in place, no motion

      const before = positions.current.get(signature);
      if (before) {
        const dx = before.x - position.x;
        const dy = before.y - position.y;
        if ((dx || dy) && !reducedMotion) {
          item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], NUDGE);
        }
        continue;
      }

      const origin = dropOriginRef.current;
      if (origin?.signature === signature) dropOriginRef.current = null;
      if (!reducedMotion && origin?.signature === signature && origin.rect) {
        const rect = item.getBoundingClientRect();
        const scale = origin.rect.width / rect.width;
        item.style.zIndex = "10";
        const drop = item.animate(
          [
            {
              transformOrigin: "0 0",
              transform: `translate(${origin.rect.left - rect.left}px, ${origin.rect.top - rect.top}px) scale(${scale})`,
            },
            { transformOrigin: "0 0", transform: "none" },
          ],
          DROP,
        );
        const reset = () => (item.style.zIndex = "");
        drop.onfinish = reset;
        drop.oncancel = reset;
      } else {
        item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out" });
      }
    }

    positions.current = next;
    primed.current = true;
  }, [shouts, reducedMotion, dropOriginRef]);

  // Keep the remembered positions true after resizes and web font loading.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    let active = true;
    const remember = () => {
      if (!active) return;
      const next = new Map<string, { x: number; y: number }>();
      for (const item of Array.from(board.children) as HTMLElement[]) {
        if (item.dataset.signature) next.set(item.dataset.signature, { x: item.offsetLeft, y: item.offsetTop });
      }
      positions.current = next;
    };
    const observer = new ResizeObserver(remember);
    observer.observe(board);
    void document.fonts?.ready.then(remember);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={boardRef} className="relative flex flex-wrap content-start items-start gap-x-8 gap-y-7 px-3 pb-10 pt-9">
      {shouts.map((shout) => (
        <div key={shout.signature} data-signature={shout.signature} className="relative">
          <div
            role="button"
            tabIndex={0}
            aria-label={`Message from ${shortAddress(shout.sender)}: ${shout.message}`}
            className="cursor-pointer rounded-sm"
            onClick={() => onSelect(selected === shout.signature ? null : shout.signature)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(shout.signature);
              }
            }}
          >
            <Receipt
              size="wall"
              message={shout.message}
              sender={shout.sender}
              time={clockTime(shout.blockTime)}
              lamports={shout.lamports}
              seed={shout.signature}
            />
          </div>
          {selected === shout.signature ? (
            <HidePrompt onHide={() => onHide(shout.signature)} onCancel={() => onSelect(null)} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
