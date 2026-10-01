"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { Receipt } from "@/components/Receipt";
import { clockTime, shortAddress } from "@/lib/format";
import type { Shout } from "@/lib/protocol";
import { HidePrompt } from "./HidePrompt";

export const FEED_MS = 1_200;

/** The newest message feeding out of the printer slot, line by line, then held big. */
export function PrintingReceipt({
  shout,
  receiptRef,
  reducedMotion,
  selected,
  onSelect,
  onHide,
}: {
  shout: Shout;
  receiptRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  selected: boolean;
  onSelect: (signature: string | null) => void;
  onHide: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = feedRef.current;
    if (!element) return;
    if (reducedMotion) {
      const fade = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
      return () => fade.cancel();
    }
    // Reveal the paper from the slot downwards in steps, one printed line at a time.
    const message = element.querySelector(".receipt-message");
    const lineHeight = message ? parseFloat(getComputedStyle(message).lineHeight) || 64 : 64;
    const steps = Math.max(4, Math.round(element.offsetHeight / lineHeight));
    const feed = element.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }], {
      duration: FEED_MS,
      easing: `steps(${steps}, end)`,
    });
    return () => feed.cancel();
  }, [shout.signature, reducedMotion]);

  return (
    <div ref={feedRef} className="relative">
      <div
        ref={receiptRef}
        role="button"
        tabIndex={0}
        aria-label={`New message from ${shortAddress(shout.sender)}: ${shout.message}`}
        className="cursor-pointer"
        onClick={() => onSelect(selected ? null : shout.signature)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(shout.signature);
          }
        }}
      >
        <Receipt
          size="print"
          tilt={false}
          message={shout.message}
          sender={shout.sender}
          time={clockTime(shout.blockTime)}
          lamports={shout.lamports}
          seed={shout.signature}
        />
      </div>
      {selected ? <HidePrompt onHide={onHide} onCancel={() => onSelect(null)} /> : null}
    </div>
  );
}

/** Before the first message: the question, printed large. */
export function QuestionReceipt({ question }: { question: string }) {
  return (
    <div className="paper-shadow">
      <div className="paper w-[min(66rem,100%)] px-16 pb-16 pt-20" style={{ ["--tooth" as string]: "0.875rem" }}>
        <p className="text-[4.75rem] font-extrabold leading-[1.02] tracking-tight text-balance text-ink">{question}</p>
        <div className="mt-10 border-t-2 border-dashed border-ink-faded" aria-hidden="true" />
        <p className="mt-7 text-[2rem] font-medium text-ink/75">The first message gets printed big.</p>
      </div>
    </div>
  );
}
